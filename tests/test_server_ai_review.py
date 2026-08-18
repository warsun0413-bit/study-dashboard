import json
import unittest
from unittest import mock

import server


class DailyAiReviewPromptTests(unittest.TestCase):
    def test_missing_reason_fails_closed_and_uses_three_sections(self):
        prompt = server.make_prompt({
            "date": "2026-08-02",
            "delayedTasks": "",
            "totalStudySeconds": 7200,
            "completionRate": 60,
        }, "concise")

        self.assertIn("原因信息不足", prompt)
        self.assertIn("不得猜测意志力、情绪、能力、专注力或学习态度", prompt)
        self.assertIn("不证明理解、记忆、正确率或掌握程度", prompt)
        self.assertIn("一、今日事实评价", prompt)
        self.assertIn("二、主要问题与证据边界", prompt)
        self.assertIn("三、明日唯一动作", prompt)
        self.assertNotIn("四、任务拆解建议", prompt)
        self.assertIn('"completionRate": 60', prompt)

    def test_user_reason_stays_labeled_and_cannot_be_expanded(self):
        prompt = server.make_prompt({
            "date": "2026-08-02",
            "delayedTasks": "开始太晚",
        }, "concise")

        self.assertIn("用户明确填写的原因是：开始太晚", prompt)
        self.assertIn("只能标记为“用户自述原因”", prompt)
        self.assertIn("不能扩写成未经记录的心理或能力判断", prompt)

    def test_invalid_mode_still_falls_back_to_concise(self):
        self.assertEqual(server.normalize_mode("unknown"), "concise")
        self.assertIn("300 字以内", server.make_prompt({}, server.normalize_mode("unknown")))

    def test_request_payload_keeps_evidence_rule_and_low_randomness(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": "一、今日事实评价：测试"}}],
                    "usage": {"total_tokens": 20},
                }).encode("utf-8")

        config = {
            "base_url": "https://api.deepseek.com",
            "api_key": "example_key",
            "model": "deepseek-test",
            "thinking": "",
        }
        with mock.patch.object(server, "get_config", return_value=config), mock.patch.object(
            server.urllib.request, "urlopen", return_value=FakeResponse()
        ) as urlopen:
            result = server.call_ai_review({"delayedTasks": ""}, "concise")

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertTrue(result["ok"])
        self.assertEqual(payload["temperature"], 0.2)
        self.assertIn("区分事实、用户自述、推测和信息不足", payload["messages"][0]["content"])
        self.assertIn("原因信息不足", payload["messages"][1]["content"])


class TomorrowPlanPromptTests(unittest.TestCase):
    def setUp(self):
        self.plan_data = {
            "todayDate": "2026-08-05",
            "tomorrowDate": "2026-08-06",
            "planSource": {
                "ready": True,
                "sourceLabel": "测试总控计划",
                "planType": "nankai-marxism-control-plan",
                "schemaVersion": 3,
                "planId": "nankai-control-2026-08-06",
                "tomorrowDate": "2026-08-06",
                "detailedPlanDate": "2026-08-06",
                "detailedPlanStart": "2026-08-06",
                "detailedPlanEnd": "2026-08-12",
                "importedAt": "2026-08-05T12:00:00.000Z",
            },
            "reviewsDueTomorrow": [{"name": "真理观D1"}],
            "availableTasks": [
                {"sourceTaskKey": "english", "time": "08:00—10:00", "nextStart": "阅读第一篇"},
                {"sourceTaskKey": "722", "time": "10:15—12:15", "nextStart": "核对真理与价值"},
                {"sourceTaskKey": "844", "time": "14:00—16:00", "nextStart": "重构青年马克思"},
                {"sourceTaskKey": "originalTextOrReview", "time": "16:20—17:00", "nextStart": "先闭卷复述"},
            ],
        }
        self.valid_plan = {
            "schemaVersion": 1,
            "date": "2026-08-06",
            "summary": "沿准确断点推进并完成到期复盘",
            "tasks": [
                {"sourceTaskKey": "english", "time": "08:00—09:30", "description": "完成一篇阅读", "nextStart": "阅读第一篇", "completionCriteria": "保存题号与错因", "fallback": "完成证据定位"},
                {"sourceTaskKey": "722", "time": "10:00—12:00", "description": "继续真理与价值", "nextStart": "核对真理与价值", "completionCriteria": "纸上重构三个层次", "fallback": "闭卷写出一级框架"},
                {"sourceTaskKey": "844", "time": "14:00—16:00", "description": "继续青年马克思", "nextStart": "重构青年马克思", "completionCriteria": "保存人物著作命题链", "fallback": "写出人物著作链"},
                {"sourceTaskKey": "originalTextOrReview", "time": "16:20—17:00", "description": "处理到期复盘", "nextStart": "先闭卷复述", "completionCriteria": "保存闭卷证据", "fallback": "完成最高优先级一项"},
            ],
        }

    def test_prompt_is_source_bound_and_json_only(self):
        self.plan_data["recentAiPlanExecution"] = {
            "evidenceDays": 2,
            "repeatedUnfinished": [{"sourceTaskKey": "844", "daysCount": 2}],
        }
        prompt = server.make_tomorrow_plan_prompt(self.plan_data)
        self.assertIn("只能使用其中已有的 sourceTaskKey", prompt)
        self.assertIn("每项任务必须使用 requiredBasis", prompt)
        self.assertIn("planSource.ready 必须为 true", prompt)
        self.assertIn("planCandidates 原样复制", prompt)
        self.assertIn("不得虚构章节、教材位置、题目、掌握程度", prompt)
        self.assertIn("只输出一个 JSON 对象", prompt)
        self.assertIn("核对真理与价值", prompt)
        self.assertIn("最近证据日里至少2天重复未完成", prompt)
        self.assertIn("不得降低 completionCriteria 的证据强度", prompt)
        self.assertEqual(server.SERVER_API_VERSION, "admission-joint-v114")
        self.assertGreater(server.PORT, 0)

    def test_fenced_json_is_extracted_and_validated(self):
        content = "```json\n" + json.dumps(self.valid_plan, ensure_ascii=False) + "\n```"
        normalized = server.validate_tomorrow_plan(server.extract_json_object(content), self.plan_data)
        self.assertEqual(normalized["date"], "2026-08-06")
        self.assertEqual(len(normalized["tasks"]), 4)
        self.assertEqual(normalized["tasks"][0]["time"], "08:00—09:30")

    def test_unknown_overlap_and_missing_due_review_fail_closed(self):
        unknown = json.loads(json.dumps(self.valid_plan, ensure_ascii=False))
        unknown["tasks"][0]["sourceTaskKey"] = "invented-subject"
        with self.assertRaisesRegex(ValueError, "未知任务"):
            server.validate_tomorrow_plan(unknown, self.plan_data)

        overlap = json.loads(json.dumps(self.valid_plan, ensure_ascii=False))
        overlap["tasks"][1]["time"] = "09:00—11:00"
        with self.assertRaisesRegex(ValueError, "时间重叠"):
            server.validate_tomorrow_plan(overlap, self.plan_data)

        missing_review = json.loads(json.dumps(self.valid_plan, ensure_ascii=False))
        missing_review["tasks"] = missing_review["tasks"][:-1]
        with self.assertRaisesRegex(ValueError, "未安排复盘任务"):
            server.validate_tomorrow_plan(missing_review, self.plan_data)

    def test_completion_basis_is_required_and_candidate_text_cannot_be_rewritten(self):
        constrained_data = json.loads(json.dumps(self.plan_data, ensure_ascii=False))
        task722 = next(task for task in constrained_data["availableTasks"] if task["sourceTaskKey"] == "722")
        task722["requiredBasis"] = "today-carryover"
        task722["planCandidates"] = [{
            "basis": "today-carryover",
            "description": "完成第四章D1闭卷重构",
            "nextStart": "先默写第四章一级框架",
            "completionCriteria": "保存闭卷重构和遗漏",
            "fallback": "保留未完成状态并记录下一起点",
        }]
        constrained_plan = json.loads(json.dumps(self.valid_plan, ensure_ascii=False))
        planned722 = next(task for task in constrained_plan["tasks"] if task["sourceTaskKey"] == "722")
        planned722.update(task722["planCandidates"][0])
        normalized = server.validate_tomorrow_plan(constrained_plan, constrained_data)
        self.assertEqual(next(task for task in normalized["tasks"] if task["sourceTaskKey"] == "722")["basis"], "today-carryover")

        planned722["description"] = "AI虚构的新章节"
        with self.assertRaisesRegex(ValueError, "改写了原计划或真实剩余内容"):
            server.validate_tomorrow_plan(constrained_plan, constrained_data)

    def test_tomorrow_plan_request_returns_validated_plan_without_network(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(inner_self):
                return json.dumps({
                    "choices": [{"message": {"content": json.dumps(self.valid_plan, ensure_ascii=False)}}],
                    "usage": {"total_tokens": 200},
                }, ensure_ascii=False).encode("utf-8")

        config = {"base_url": "https://api.deepseek.com", "api_key": "example_key", "model": "deepseek-test", "thinking": ""}
        with mock.patch.object(server, "get_config", return_value=config), mock.patch.object(
            server.urllib.request, "urlopen", return_value=FakeResponse()
        ) as urlopen:
            result = server.call_ai_tomorrow_plan(self.plan_data)

        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertTrue(result["ok"])
        self.assertEqual(result["plan"]["date"], "2026-08-06")
        self.assertEqual(payload["temperature"], 0.2)
        self.assertIn("必须输出可验证的JSON计划", payload["messages"][0]["content"])

    def test_tomorrow_plan_refuses_network_without_trusted_source(self):
        untrusted = json.loads(json.dumps(self.plan_data, ensure_ascii=False))
        untrusted["planSource"] = {"ready": False}
        with mock.patch.object(server.urllib.request, "urlopen") as urlopen:
            result = server.call_ai_tomorrow_plan(untrusted)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 400)
        self.assertIn("可信逐日原计划", result["error"])
        urlopen.assert_not_called()

        forged = json.loads(json.dumps(self.plan_data, ensure_ascii=False))
        forged["planSource"]["planId"] = "forged-plan"
        with mock.patch.object(server.urllib.request, "urlopen") as urlopen:
            result = server.call_ai_tomorrow_plan(forged)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 400)
        self.assertIn("标识不匹配", result["error"])
        urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
