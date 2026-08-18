import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PORT = int(os.environ.get("PORT") or "8000")
ROOT_DIR = Path(__file__).resolve().parent
ENV_FILE = ROOT_DIR / ".env"
SERVER_API_VERSION = "admission-joint-v114"
TRUSTED_AI_PLAN_SOURCES = {
    "nankai-marxism-control-plan": {"schemaVersion": 3, "planId": "nankai-control-2026-08-06"},
    "nankai-marxism-exam-plan": {"schemaVersion": 2, "planId": ""},
    "nankai-ai-rolling-week-plan": {"schemaVersion": 1, "planId": "dynamic"},
}

MODE_CONFIG = {
    "concise": {
        "label": "简洁模式",
        "max_tokens": 500,
        "limit": "300 字以内",
        "instruction": "每部分只保留最关键的一点，不展开长篇分析。",
    },
    "standard": {
        "label": "标准模式",
        "max_tokens": 900,
        "limit": "600 字以内",
        "instruction": "按结构输出，适度分析，重点给出可执行建议。",
    },
    "detailed": {
        "label": "详细模式",
        "max_tokens": 1400,
        "limit": "1000 字以内",
        "instruction": "允许更完整分析，但避免废话，所有建议都要能落到行动。",
    },
}

ESSAY_CRITIQUE_CONFIG = {
    "framework": {
        "label": "框架批改",
        "max_tokens": 900,
        "instruction": "用户可能只写了提纲或答题框架。重点检查是否扣题、结构是否完整、概念是否准确、是否适合南开论述题，以及哪些层次需要补充。",
    },
    "full": {
        "label": "完整答案批改",
        "max_tokens": 1600,
        "instruction": "用户写了较完整答案。重点检查立论、教材逻辑、原著支撑、历史或现实材料、论述题语言，以及空话、套话、断裂、跑题问题。",
    },
    "memorization": {
        "label": "背诵压缩",
        "max_tokens": 1200,
        "instruction": "把答案压缩成可背诵版本，必须输出标准背诵版、关键词版、口诀版和 3 分钟默写版。",
    },
}

TOMORROW_PLAN_MAX_TOKENS = 2200
ROLLING_WEEK_PLAN_MAX_TOKENS = 7000


def load_env_file():
    env = {}
    if not ENV_FILE.exists():
        return env

    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            env[key] = value

    return env


def get_config():
    file_env = load_env_file()
    return {
        "base_url": os.environ.get("AI_BASE_URL") or file_env.get("AI_BASE_URL") or "https://api.deepseek.com",
        "api_key": os.environ.get("AI_API_KEY") or file_env.get("AI_API_KEY") or "",
        "model": os.environ.get("AI_MODEL") or file_env.get("AI_MODEL") or "deepseek-v4-flash",
        "thinking": os.environ.get("AI_THINKING") or file_env.get("AI_THINKING") or "disabled",
    }


def normalize_mode(mode):
    return mode if mode in MODE_CONFIG else "concise"


def normalize_critique_mode(mode):
    return mode if mode in ESSAY_CRITIQUE_CONFIG else "framework"


def build_chat_url(base_url):
    clean_base = base_url.rstrip("/")
    if clean_base.endswith("/chat/completions"):
        return clean_base
    return f"{clean_base}/chat/completions"


def make_prompt(review_data, mode):
    mode_config = MODE_CONFIG[mode]
    delayed_tasks = str(review_data.get("delayedTasks") or "").strip()
    cause_boundary = (
        f"用户明确填写的原因是：{delayed_tasks}。只能标记为“用户自述原因”，不能扩写成未经记录的心理或能力判断。"
        if delayed_tasks
        else "用户没有填写拖延原因。必须写“原因信息不足”，不得猜测意志力、情绪、能力、专注力或学习态度。"
    )
    return "\n".join([
        "请根据下面的考研学习面板数据，生成务实、具体、可执行的复盘建议。",
        "证据规则：",
        "1. 只把面板中明确记录的内容称为事实，不得补写不存在的任务、产出、原因或掌握情况。",
        "2. 学习时长、专注时长、完成率和任务勾选只证明执行活动，不证明理解、记忆、正确率或掌握程度。",
        "3. 如确需提出推测，必须以“[推测]”开头并说明依据；没有依据时直接写“信息不足”，不要推测。",
        f"4. {cause_boundary}",
        "5. 不打分，不泛泛鼓励，不一次布置多个互相竞争的明日重点。",
        f"当前输出模式：{mode_config['label']}，请控制在{mode_config['limit']}。",
        mode_config["instruction"],
        "",
        "必须严格按以下三段回答：",
        "一、今日事实评价：引用 1—3 条面板事实，说明今天实际完成到哪里；不得评价未被证据证明的学习质量。",
        "二、主要问题与证据边界：指出一个最影响推进的问题；原因只能写“用户自述原因”“[推测]”或“原因信息不足”。",
        "三、明日唯一动作：只给一个以动词开头、能直接开始的动作，并写清可观察的最低完成标志。",
        "",
        "学习面板数据：",
        json.dumps(review_data, ensure_ascii=False, indent=2),
    ])


def call_ai_review(review_data, mode):
    mode = normalize_mode(mode)
    mode_config = MODE_CONFIG[mode]
    config = get_config()
    if not config["api_key"]:
        return {
            "ok": False,
            "status": 400,
            "error": "未配置 AI_API_KEY，请查看 .env.example",
        }

    payload = {
        "model": config["model"],
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一位熟悉考研执行管理、马克思主义理论复习和南开马理论论述题训练的学习教练。"
                    "你必须区分事实、用户自述、推测和信息不足，不能用学习时长或任务完成状态推断掌握程度。"
                    "回答必须节制、具体、可执行，优先帮助用户降低明天开始学习的阻力。"
                ),
            },
            {
                "role": "user",
                "content": make_prompt(review_data, mode),
            },
        ],
        "temperature": 0.2,
        "max_tokens": mode_config["max_tokens"],
    }

    if config["thinking"]:
        payload["thinking"] = {"type": config["thinking"]}

    request = urllib.request.Request(
        build_chat_url(config["base_url"]),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": error.code,
            "error": f"DeepSeek API 请求失败：{message}",
        }
    except urllib.error.URLError as error:
        return {
            "ok": False,
            "status": 502,
            "error": f"无法连接 DeepSeek API：{error.reason}",
        }
    except Exception as error:
        return {
            "ok": False,
            "status": 500,
            "error": f"AI 复盘请求失败：{error}",
        }

    try:
        content = response_data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return {
            "ok": False,
            "status": 502,
            "error": "DeepSeek API 返回格式异常",
        }

    return {
        "ok": True,
        "status": 200,
        "content": content,
        "advice": content,
        "mode": mode,
        "usage": response_data.get("usage") or {},
    }


def make_tomorrow_plan_prompt(plan_data):
    return "\n".join([
        "请根据学习面板提供的今日真实执行、正式学习结果、专业课准确断点、明日到期复盘和现有明日任务，生成明日一天计划。",
        "所有内容必须受输入证据约束：不得虚构章节、教材位置、题目、掌握程度、错因或完成情况。",
        "学习时长和完成率只说明执行活动，不证明理解、记忆或掌握。",
        "availableTasks 是原计划与今日完成度合成后的唯一候选；只能使用其中已有的 sourceTaskKey，不得新增科目。",
        "planSource.ready 必须为 true；计划摘要应说明使用了该原计划，但不得声称完成了未完成任务。",
        "每项任务必须使用 requiredBasis：today-carryover 表示今日未完成内容必须优先顺延，original-plan 表示按原明日计划继续。",
        "description、nextStart、completionCriteria、fallback 必须从 requiredBasis 对应的 planCandidates 原样复制；AI只调整确切时间，不得改写章节或任务内容。",
        "722和844必须从输入中已有的 nextStart 或专业课进度继续；没有准确断点时写“先核对并确认准确起点”，不得编造进度。",
        "安排应遵循：高认知任务放在精力较好的时段；同一时段不得重叠；连续高强度任务之间留出休息；到期复盘使用闭卷提取；总任务时间不得超过12小时。",
        "每个任务必须给出可直接开始的 nextStart、可观察的 completionCriteria，以及时间不足时不伪造完成的 fallback。",
        "如果任务标记 protected=true，复制它的既有安排，不要重写人工编辑内容。",
        "recentAiPlanExecution 是最近最多3个已应用AI计划日的执行事实：trackedFocusSeconds只表示被计时器记录的专注，不等于全部学习时间，也不证明掌握程度。",
        "只有 repeatedUnfinished 中在最近证据日里至少2天重复未完成的任务，才可以据此缩小次日任务范围或调整时段；单日偏差只能在summary中注明，不能据此降低任务量。",
        "校准时可以减少同一任务的范围，但不得降低 completionCriteria 的证据强度，不得把“开始过”改写为“已完成”。",
        "只输出一个 JSON 对象，不要输出 Markdown、代码围栏或解释文字。",
        "JSON结构必须严格为：",
        '{"schemaVersion":1,"date":"YYYY-MM-DD","summary":"计划依据摘要","tasks":[{"sourceTaskKey":"仅限availableTasks中的值","basis":"requiredBasis的原值","time":"HH:MM—HH:MM","description":"从候选原样复制","nextStart":"从候选原样复制","completionCriteria":"从候选原样复制","fallback":"从候选原样复制"}]}',
        "明日计划输入：",
        json.dumps(plan_data, ensure_ascii=False, indent=2),
    ])


def extract_json_object(content):
    text = str(content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("DeepSeek 未返回有效 JSON 计划")
    try:
        value = json.loads(text[start:end + 1])
    except json.JSONDecodeError as error:
        raise ValueError(f"DeepSeek 计划 JSON 无法解析：{error.msg}") from error
    if not isinstance(value, dict):
        raise ValueError("DeepSeek 计划 JSON 根节点必须是对象")
    return value


def parse_plan_time_range(value):
    normalized = re.sub(r"[-–~～至]", "—", str(value or "").strip())
    match = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)—([01]\d|2[0-3]):([0-5]\d)", normalized)
    if not match:
        return None
    start = int(match.group(1)) * 60 + int(match.group(2))
    end = int(match.group(3)) * 60 + int(match.group(4))
    if end <= start:
        return None
    return {"value": normalized, "start": start, "end": end, "minutes": end - start}


def validate_tomorrow_plan(raw_plan, plan_data):
    expected_date = str(plan_data.get("tomorrowDate") or "")
    if int(raw_plan.get("schemaVersion") or 0) != 1 or str(raw_plan.get("date") or "") != expected_date:
        raise ValueError("DeepSeek 计划版本或日期不正确")
    available_tasks = plan_data.get("availableTasks")
    if not isinstance(available_tasks, list):
        raise ValueError("明日可用任务结构无效")
    available_keys = {
        str(task.get("sourceTaskKey") or "")
        for task in available_tasks if isinstance(task, dict) and task.get("sourceTaskKey")
    }
    tasks = raw_plan.get("tasks")
    if not isinstance(tasks, list) or not 3 <= len(tasks) <= 8:
        raise ValueError("DeepSeek 计划必须包含3至8个任务块")
    normalized_tasks = []
    seen = set()
    for task in tasks:
        if not isinstance(task, dict):
            raise ValueError("DeepSeek 计划包含无效任务")
        source_key = str(task.get("sourceTaskKey") or "").strip()
        if source_key not in available_keys:
            raise ValueError(f"DeepSeek 计划包含未知任务：{source_key or '未命名'}")
        if source_key in seen:
            raise ValueError(f"DeepSeek 计划重复任务：{source_key}")
        seen.add(source_key)
        available_task = next((item for item in available_tasks if isinstance(item, dict) and str(item.get("sourceTaskKey") or "") == source_key), {})
        candidates = available_task.get("planCandidates") if isinstance(available_task.get("planCandidates"), list) else []
        basis = str(task.get("basis") or "").strip()
        candidate = next((item for item in candidates if isinstance(item, dict) and str(item.get("basis") or "") == basis), None)
        if candidates and (candidate is None or basis != str(available_task.get("requiredBasis") or "")):
            raise ValueError(f"DeepSeek 计划任务 {source_key} 未按今日完成度选择原计划或顺延任务")
        time_range = parse_plan_time_range(task.get("time"))
        if not time_range or not 10 <= time_range["minutes"] <= 240:
            raise ValueError(f"DeepSeek 计划时间无效：{task.get('time') or source_key}")
        normalized = {"sourceTaskKey": source_key, "basis": basis or "original-plan", "time": time_range["value"]}
        for key in ("description", "nextStart", "completionCriteria"):
            value = str(task.get(key) or "").strip()
            if not value or len(value) > 500:
                raise ValueError(f"DeepSeek 计划任务 {source_key} 缺少或超长字段：{key}")
            normalized[key] = value
        normalized["fallback"] = str(task.get("fallback") or "").strip()[:500]
        if candidate and any(
            str(task.get(key) or "").strip() != str(candidate.get(key) or "").strip()
            for key in ("description", "nextStart", "completionCriteria", "fallback")
        ):
            raise ValueError(f"DeepSeek 计划任务 {source_key} 改写了原计划或真实剩余内容")
        normalized["_start"] = time_range["start"]
        normalized["_end"] = time_range["end"]
        normalized_tasks.append(normalized)
    normalized_tasks.sort(key=lambda task: task["_start"])
    for previous, current in zip(normalized_tasks, normalized_tasks[1:]):
        if current["_start"] < previous["_end"]:
            raise ValueError("DeepSeek 计划存在时间重叠")
    if sum(task["_end"] - task["_start"] for task in normalized_tasks) > 720:
        raise ValueError("DeepSeek 计划总任务时间超过12小时")
    total_minutes = sum(task["_end"] - task["_start"] for task in normalized_tasks)
    max_planned_minutes = min(720, max(0, int(plan_data.get("maxPlannedMinutes") or 0)))
    if max_planned_minutes and total_minutes > max_planned_minutes:
        raise ValueError(f"DeepSeek 计划总任务时间超过个人承载上限{max_planned_minutes}分钟")
    requested_required = plan_data.get("requiredTaskKeys")
    required_keys = requested_required if isinstance(requested_required, list) else ["english", "722", "844"]
    for required in required_keys:
        required = str(required or "")
        if required in available_keys and required not in seen:
            raise ValueError(f"DeepSeek 计划缺少必需任务：{required}")
    due_reviews = plan_data.get("reviewsDueTomorrow")
    if isinstance(due_reviews, list) and due_reviews and "originalTextOrReview" in available_keys and "originalTextOrReview" not in seen:
        raise ValueError("明日有到期复盘，但DeepSeek计划未安排复盘任务")
    for task in normalized_tasks:
        task.pop("_start", None)
        task.pop("_end", None)
    return {
        "schemaVersion": 1,
        "date": expected_date,
        "summary": str(raw_plan.get("summary") or "").strip()[:500],
        "tasks": normalized_tasks,
    }


def validate_ai_plan_source(plan_data):
    if not isinstance(plan_data, dict):
        raise ValueError("明日计划请求结构无效")
    plan_source = plan_data.get("planSource")
    if not isinstance(plan_source, dict) or plan_source.get("ready") is not True:
        raise ValueError("明日没有已导入的可信逐日原计划，请先导入总控计划")
    plan_type = str(plan_source.get("planType") or "").strip()
    trusted = TRUSTED_AI_PLAN_SOURCES.get(plan_type)
    if not trusted or int(plan_source.get("schemaVersion") or 0) != trusted["schemaVersion"]:
        raise ValueError("明日原计划类型或版本不受信任")
    plan_id = str(plan_source.get("planId") or "").strip()
    if trusted["planId"] and plan_id != trusted["planId"]:
        raise ValueError("明日原计划标识不匹配")
    tomorrow_date = str(plan_data.get("tomorrowDate") or "")
    source_tomorrow_date = str(plan_source.get("tomorrowDate") or "")
    detailed_plan_date = str(plan_source.get("detailedPlanDate") or "")
    detailed_start = str(plan_source.get("detailedPlanStart") or "")
    detailed_end = str(plan_source.get("detailedPlanEnd") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", tomorrow_date):
        raise ValueError("明日日期无效")
    if source_tomorrow_date != tomorrow_date or detailed_plan_date != tomorrow_date:
        raise ValueError("明日没有对应的逐日原计划")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", detailed_start) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", detailed_end):
        raise ValueError("逐日原计划日期范围无效")
    if not detailed_start <= tomorrow_date <= detailed_end:
        raise ValueError("明日超出逐日原计划范围")
    if not str(plan_source.get("importedAt") or "").strip():
        raise ValueError("原计划缺少导入时间，无法核验来源")
    return plan_source


def call_ai_tomorrow_plan(plan_data):
    try:
        validate_ai_plan_source(plan_data)
    except (TypeError, ValueError) as error:
        return {"ok": False, "status": 400, "error": str(error)}
    config = get_config()
    if not config["api_key"]:
        return {"ok": False, "status": 400, "error": "未配置 AI_API_KEY，请查看 .env.example"}
    payload = {
        "model": config["model"],
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是考研马理论学习计划教练。你只能使用用户提供的真实任务、正式进度和准确断点，"
                    "必须输出可验证的JSON计划，不得虚构学习内容或根据时长推断掌握程度。"
                ),
            },
            {"role": "user", "content": make_tomorrow_plan_prompt(plan_data)},
        ],
        "temperature": 0.2,
        "max_tokens": TOMORROW_PLAN_MAX_TOKENS,
    }
    if config["thinking"]:
        payload["thinking"] = {"type": config["thinking"]}
    request = urllib.request.Request(
        build_chat_url(config["base_url"]),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {config['api_key']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": error.code, "error": f"DeepSeek API 请求失败：{message}"}
    except urllib.error.URLError as error:
        return {"ok": False, "status": 502, "error": f"无法连接 DeepSeek API：{error.reason}"}
    except Exception as error:
        return {"ok": False, "status": 500, "error": f"AI明日计划请求失败：{error}"}
    try:
        content = response_data["choices"][0]["message"]["content"]
        plan = validate_tomorrow_plan(extract_json_object(content), plan_data)
    except (KeyError, IndexError, TypeError, ValueError) as error:
        return {"ok": False, "status": 502, "error": str(error) or "DeepSeek 明日计划返回格式异常"}
    return {
        "ok": True,
        "status": 200,
        "plan": plan,
        "content": content,
        "usage": response_data.get("usage") or {},
    }


def make_rolling_week_plan_prompt(plan_data):
    return "\n".join([
        "请为南开马理论考研学习面板编排下一轮连续7天计划。",
        "days 中的 availableTasks 是唯一允许使用的任务证据。不得新增科目、章节、题目、断点或完成情况。",
        "每一天必须使用该日全部必需任务；每项任务的 basis 必须等于 requiredBasis。",
        "requiredTaskKeys 必须全部安排；其他候选是可选任务，只有在 maxPlannedMinutes 上限内才安排。",
        "capacityCalibration 只反映执行承载能力，不代表理解或掌握，不得据此声称学习质量提高或下降。",
        "description、nextStart、completionCriteria、fallback 必须从对应 planCandidates 原样复制，AI只能调整时间顺序。",
        "阶段目标只用于理解安排强度，不得据此改写或扩写章节范围。学习时长和完成状态不证明掌握程度。",
        "同一天任务不得重叠，每项10至240分钟，每天总任务时间不超过12小时；高认知任务之间留出休息。",
        "只输出JSON对象，不要输出Markdown、代码围栏或解释文字。",
        "JSON结构严格为：",
        '{"schemaVersion":1,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","summary":"依据摘要","days":[{"date":"YYYY-MM-DD","summary":"当日安排依据","tasks":[{"sourceTaskKey":"候选键","basis":"phase-plan","time":"HH:MM—HH:MM","description":"原样复制","nextStart":"原样复制","completionCriteria":"原样复制","fallback":"原样复制"}]}]}',
        "滚动计划输入：",
        json.dumps(plan_data, ensure_ascii=False, indent=2),
    ])


def validate_rolling_week_source(plan_data):
    if not isinstance(plan_data, dict) or int(plan_data.get("schemaVersion") or 0) != 1:
        raise ValueError("滚动计划请求结构无效")
    source = plan_data.get("sourcePlan")
    if not isinstance(source, dict):
        raise ValueError("滚动计划缺少已导入来源")
    plan_type = str(source.get("planType") or "").strip()
    trusted = TRUSTED_AI_PLAN_SOURCES.get(plan_type)
    if not trusted or int(source.get("schemaVersion") or 0) != trusted["schemaVersion"]:
        raise ValueError("滚动计划来源类型或版本不受信任")
    plan_id = str(source.get("planId") or "").strip()
    if trusted["planId"] == "dynamic":
        if not re.fullmatch(r"rolling-week-\d{4}-\d{2}-\d{2}", plan_id):
            raise ValueError("滚动计划来源标识无效")
    elif trusted["planId"] and plan_id != trusted["planId"]:
        raise ValueError("滚动计划来源标识不匹配")
    if not str(source.get("importedAt") or "").strip():
        raise ValueError("滚动计划来源缺少导入时间")
    start_text = str(plan_data.get("startDate") or "")
    end_text = str(plan_data.get("endDate") or "")
    try:
        start_day = date.fromisoformat(start_text)
        end_day = date.fromisoformat(end_text)
    except ValueError as error:
        raise ValueError("滚动计划日期范围无效") from error
    if end_day != start_day + timedelta(days=6):
        raise ValueError("滚动计划必须是连续7天")
    calibration = plan_data.get("capacityCalibration")
    if not isinstance(calibration, dict) or calibration.get("status") not in {"calibrated", "insufficient-data"}:
        raise ValueError("滚动计划缺少有效的执行强度校准")
    evidence_days = int(calibration.get("evidenceDays") or 0)
    recommended_max = int(calibration.get("recommendedMaxMinutes") or 0)
    if not 0 <= evidence_days <= 7 or not 1 <= recommended_max <= 720:
        raise ValueError("滚动计划执行强度校准数值无效")
    if calibration["status"] == "calibrated" and evidence_days < 3:
        raise ValueError("有效学习日不足3天，不能判断个人执行速度")
    if calibration["status"] == "insufficient-data" and evidence_days >= 3:
        raise ValueError("已有足够证据日，强度校准状态不一致")
    days = plan_data.get("days")
    if not isinstance(days, list) or len(days) != 7:
        raise ValueError("滚动计划必须提供7天任务证据")
    for index, day_data in enumerate(days):
        expected = (start_day + timedelta(days=index)).isoformat()
        if not isinstance(day_data, dict) or str(day_data.get("date") or "") != expected:
            raise ValueError(f"滚动计划缺少 {expected} 的任务证据")
        if not str(day_data.get("phaseId") or "").strip() or not isinstance(day_data.get("availableTasks"), list):
            raise ValueError(f"{expected} 缺少阶段或候选任务")
        required_keys = day_data.get("requiredTaskKeys")
        available_keys = {str(task.get("sourceTaskKey") or "") for task in day_data["availableTasks"] if isinstance(task, dict)}
        if not isinstance(required_keys, list) or not {"english", "722", "844"}.issubset(set(required_keys)) or not set(required_keys).issubset(available_keys):
            raise ValueError(f"{expected} 的必需任务约束无效")
        day_max = int(day_data.get("maxPlannedMinutes") or 0)
        if not 1 <= day_max <= recommended_max:
            raise ValueError(f"{expected} 的计划时长上限无效")
    return days


def validate_rolling_week_plan(raw_plan, plan_data):
    days_data = validate_rolling_week_source(plan_data)
    if int(raw_plan.get("schemaVersion") or 0) != 1:
        raise ValueError("DeepSeek滚动计划版本不正确")
    if str(raw_plan.get("startDate") or "") != str(plan_data.get("startDate") or "") or str(raw_plan.get("endDate") or "") != str(plan_data.get("endDate") or ""):
        raise ValueError("DeepSeek滚动计划日期范围不正确")
    raw_days = raw_plan.get("days")
    if not isinstance(raw_days, list) or len(raw_days) != 7:
        raise ValueError("DeepSeek滚动计划必须完整返回7天")
    normalized_days = []
    for raw_day, day_data in zip(raw_days, days_data):
        if not isinstance(raw_day, dict) or str(raw_day.get("date") or "") != str(day_data.get("date") or ""):
            raise ValueError(f"DeepSeek滚动计划日期缺失或乱序：{day_data.get('date')}")
        normalized = validate_tomorrow_plan({
            "schemaVersion": 1,
            "date": raw_day.get("date"),
            "summary": raw_day.get("summary"),
            "tasks": raw_day.get("tasks"),
        }, {
            "tomorrowDate": day_data.get("date"),
            "availableTasks": day_data.get("availableTasks"),
            "reviewsDueTomorrow": day_data.get("reviewsDue"),
            "requiredTaskKeys": day_data.get("requiredTaskKeys"),
            "maxPlannedMinutes": day_data.get("maxPlannedMinutes"),
        })
        normalized_days.append(normalized)
    return {
        "schemaVersion": 1,
        "startDate": str(plan_data.get("startDate") or ""),
        "endDate": str(plan_data.get("endDate") or ""),
        "summary": str(raw_plan.get("summary") or "").strip()[:500],
        "days": normalized_days,
    }


def call_ai_rolling_week_plan(plan_data):
    try:
        validate_rolling_week_source(plan_data)
    except (TypeError, ValueError) as error:
        return {"ok": False, "status": 400, "error": str(error)}
    config = get_config()
    if not config["api_key"]:
        return {"ok": False, "status": 400, "error": "未配置 AI_API_KEY，请查看 .env.example"}
    payload = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": "你是考研马理论逐日计划编排器。只能复制输入候选内容并调整时间，必须输出可验证JSON，不得虚构章节或学习结果。"},
            {"role": "user", "content": make_rolling_week_plan_prompt(plan_data)},
        ],
        "temperature": 0.15,
        "max_tokens": ROLLING_WEEK_PLAN_MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }
    if config["thinking"]:
        payload["thinking"] = {"type": config["thinking"]}
    request = urllib.request.Request(
        build_chat_url(config["base_url"]),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {config['api_key']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": error.code, "error": f"DeepSeek API 请求失败：{message}"}
    except urllib.error.URLError as error:
        return {"ok": False, "status": 502, "error": f"无法连接 DeepSeek API：{error.reason}"}
    except Exception as error:
        return {"ok": False, "status": 500, "error": f"AI滚动计划请求失败：{error}"}
    try:
        choice = response_data["choices"][0]
        if str(choice.get("finish_reason") or "").strip() == "length":
            raise ValueError("DeepSeek滚动计划输出被长度上限截断，请重新生成；若重复出现，请缩短候选任务描述")
        content = choice["message"]["content"]
        plan = validate_rolling_week_plan(extract_json_object(content), plan_data)
    except (KeyError, IndexError, TypeError, ValueError) as error:
        return {"ok": False, "status": 502, "error": str(error) or "DeepSeek滚动计划返回格式异常"}
    return {"ok": True, "status": 200, "plan": plan, "content": content, "usage": response_data.get("usage") or {}}


def make_essay_critique_prompt(topic, answer, mode):
    mode_config = ESSAY_CRITIQUE_CONFIG[mode]
    return "\n".join([
        "请对下面的南开马克思主义理论考研论述题训练进行结构化批改。",
        "批改要严格、具体、可执行，不要泛泛鼓励，不要编造用户没有写的内容。",
        f"当前批改模式：{mode_config['label']}。",
        mode_config["instruction"],
        "",
        "批改结果必须按以下结构输出：",
        "一、总体评分，满分100",
        "二、主要优点",
        "三、主要问题",
        "四、结构修改建议",
        "五、教材逻辑补强",
        "六、原著支撑补强",
        "七、南开答题表达优化",
        "八、可直接修改后的答题框架",
        "九、下一次训练任务",
        "",
        f"题目：{topic}",
        "",
        "我的答案或框架：",
        answer,
    ])


def call_essay_critique(topic, answer, mode):
    mode = normalize_critique_mode(mode)
    mode_config = ESSAY_CRITIQUE_CONFIG[mode]
    config = get_config()
    if not config["api_key"]:
        return {
            "ok": False,
            "status": 400,
            "error": "未配置 AI_API_KEY，请查看 .env.example",
        }

    payload = {
        "model": config["model"],
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一位熟悉南开马克思主义理论考研、马克思主义基本原理、马克思主义发展史、"
                    "原著文本和论述题阅卷标准的严谨批改老师。你只给可执行的批改建议。"
                ),
            },
            {
                "role": "user",
                "content": make_essay_critique_prompt(topic, answer, mode),
            },
        ],
        "temperature": 0.3,
        "max_tokens": mode_config["max_tokens"],
    }

    if config["thinking"]:
        payload["thinking"] = {"type": config["thinking"]}

    request = urllib.request.Request(
        build_chat_url(config["base_url"]),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": error.code,
            "error": f"DeepSeek API 请求失败：{message}",
        }
    except urllib.error.URLError as error:
        return {
            "ok": False,
            "status": 502,
            "error": f"无法连接 DeepSeek API：{error.reason}",
        }
    except Exception as error:
        return {
            "ok": False,
            "status": 500,
            "error": f"AI 精批请求失败：{error}",
        }

    try:
        content = response_data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return {
            "ok": False,
            "status": 502,
            "error": "DeepSeek API 返回格式异常",
        }

    return {
        "ok": True,
        "status": 200,
        "content": content,
        "mode": mode,
        "usage": response_data.get("usage") or {},
    }


class DashboardRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/runtime-status":
            self.send_json(200, {
                "ok": True,
                "apiVersion": SERVER_API_VERSION,
                "aiTomorrowPlan": True,
                "autoImportTomorrowPlan": True,
                "aiRollingWeekPlan": True,
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path not in {"/api/ai-review", "/api/essay-critique", "/api/ai-tomorrow-plan", "/api/ai-week-plan"}:
            self.send_json(404, {"ok": False, "error": "接口不存在"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            request_data = json.loads(raw_body or "{}")
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "请求 JSON 格式不正确"})
            return

        if self.path == "/api/essay-critique":
            topic = str(request_data.get("topic") or "").strip()
            answer = str(request_data.get("answer") or "").strip()
            if not topic or not answer:
                self.send_json(400, {"ok": False, "error": "缺少题目或答案内容"})
                return

            mode = normalize_critique_mode(request_data.get("mode"))
            result = call_essay_critique(topic, answer, mode)
            self.send_json(result["status"], result)
            return

        if self.path == "/api/ai-tomorrow-plan":
            plan_data = request_data.get("planData")
            if not isinstance(plan_data, dict):
                self.send_json(400, {"ok": False, "error": "缺少 planData 数据"})
                return
            tomorrow_date = str(plan_data.get("tomorrowDate") or "")
            available_tasks = plan_data.get("availableTasks")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", tomorrow_date) or not isinstance(available_tasks, list):
                self.send_json(400, {"ok": False, "error": "planData 缺少有效日期或可用任务"})
                return
            result = call_ai_tomorrow_plan(plan_data)
            self.send_json(result["status"], result)
            return

        if self.path == "/api/ai-week-plan":
            plan_data = request_data.get("planData")
            if not isinstance(plan_data, dict):
                self.send_json(400, {"ok": False, "error": "缺少 planData 数据"})
                return
            result = call_ai_rolling_week_plan(plan_data)
            self.send_json(result["status"], result)
            return

        review_data = request_data.get("reviewData")
        if not isinstance(review_data, dict):
            self.send_json(400, {"ok": False, "error": "缺少 reviewData 数据"})
            return

        mode = normalize_mode(request_data.get("mode"))
        result = call_ai_review(review_data, mode)
        self.send_json(result["status"], result)


def main():
    os.chdir(ROOT_DIR)
    server = ThreadingHTTPServer(("localhost", PORT), DashboardRequestHandler)
    print(f"Study Dashboard running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
