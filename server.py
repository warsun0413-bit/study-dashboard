import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PORT = 8000
ROOT_DIR = Path(__file__).resolve().parent
ENV_FILE = ROOT_DIR / ".env"

MODE_CONFIG = {
    "concise": {
        "label": "简洁模式",
        "max_tokens": 500,
        "limit": "300 字以内",
        "instruction": "只给关键问题、最主要拖延原因和明天第一步，不展开长篇分析。",
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
    return "\n".join([
        "请根据下面的考研学习面板数据，生成务实、具体、可执行的复盘建议。",
        "不要编造不存在的数据；如果信息不足，请指出需要补充什么。",
        f"当前输出模式：{mode_config['label']}，请控制在{mode_config['limit']}。",
        mode_config["instruction"],
        "",
        "请按以下结构回答：",
        "一、今日执行诊断",
        "二、拖延原因分析",
        "三、明天第一步建议",
        "四、任务拆解建议",
        "五、滚动复盘建议",
        "六、南开论述题训练建议",
        "七、明日最低完成标准",
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
                    "回答必须节制、具体、可执行，优先帮助用户降低明天开始学习的阻力。"
                ),
            },
            {
                "role": "user",
                "content": make_prompt(review_data, mode),
            },
        ],
        "temperature": 0.4,
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

    def do_POST(self):
        if self.path not in {"/api/ai-review", "/api/essay-critique"}:
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
