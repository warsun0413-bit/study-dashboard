import json
import unittest
from unittest import mock

import server


def candidate(key):
    content = {
        "basis": "phase-plan",
        "description": f"{key}阶段任务",
        "nextStart": f"{key}准确起点",
        "completionCriteria": f"{key}完成证据",
        "fallback": "记录真实未完成状态",
    }
    return {
        "sourceTaskKey": key,
        "requiredBasis": "phase-plan",
        "planCandidates": [content],
    }


def plan_data():
    dates = [f"2026-08-{day:02d}" for day in range(13, 20)]
    return {
        "schemaVersion": 1,
        "startDate": dates[0],
        "endDate": dates[-1],
        "sourcePlan": {
            "planType": "nankai-marxism-control-plan",
            "schemaVersion": 3,
            "planId": "nankai-control-2026-08-06",
            "importedAt": "2026-08-08T09:00:00.000Z",
        },
        "capacityCalibration": {
            "status": "calibrated",
            "evidenceDays": 3,
            "recommendedMaxMinutes": 180,
        },
        "days": [{
            "date": date,
            "phaseId": "phase-2",
            "availableTasks": [candidate("english"), candidate("722"), candidate("844")],
            "reviewsDue": [],
            "requiredTaskKeys": ["english", "722", "844"],
            "maxPlannedMinutes": 180,
        } for date in dates],
    }


def raw_plan(data):
    times = ["08:00—09:00", "09:20—10:20", "10:40—11:40"]
    return {
        "schemaVersion": 1,
        "startDate": data["startDate"],
        "endDate": data["endDate"],
        "summary": "按阶段范围编排",
        "days": [{
            "date": day["date"],
            "summary": "当日安排",
            "tasks": [{
                "sourceTaskKey": task["sourceTaskKey"],
                "time": times[index],
                **task["planCandidates"][0],
            } for index, task in enumerate(day["availableTasks"])],
        } for day in data["days"]],
    }


class AiRollingWeekPlanTests(unittest.TestCase):
    def test_validates_contiguous_evidence_bound_week(self):
        data = plan_data()
        result = server.validate_rolling_week_plan(raw_plan(data), data)
        self.assertEqual(len(result["days"]), 7)
        self.assertEqual(result["days"][0]["tasks"][1]["nextStart"], "722准确起点")

    def test_rejects_rewritten_chapter(self):
        data = plan_data()
        raw = raw_plan(data)
        raw["days"][0]["tasks"][1]["description"] = "虚构章节"
        with self.assertRaisesRegex(ValueError, "改写"):
            server.validate_rolling_week_plan(raw, data)

    def test_rejects_day_above_personal_capacity_ceiling(self):
        data = plan_data()
        raw = raw_plan(data)
        raw["days"][0]["tasks"][0]["time"] = "07:30—09:00"
        with self.assertRaisesRegex(ValueError, "个人承载上限180分钟"):
            server.validate_rolling_week_plan(raw, data)

    def test_rejects_incomplete_week_before_api_call(self):
        data = plan_data()
        data["days"].pop()
        result = server.call_ai_rolling_week_plan(data)
        self.assertEqual(result["status"], 400)
        self.assertIn("7天", result["error"])

    def test_accepts_dynamic_confirmed_week_as_next_source(self):
        data = plan_data()
        data["sourcePlan"] = {
            "planType": "nankai-ai-rolling-week-plan",
            "schemaVersion": 1,
            "planId": "rolling-week-2026-08-06",
            "importedAt": "2026-08-12T21:00:00.000Z",
        }
        self.assertEqual(len(server.validate_rolling_week_source(data)), 7)

    def test_prompt_forbids_content_rewrite(self):
        prompt = server.make_rolling_week_plan_prompt(plan_data())
        self.assertIn("原样复制", prompt)
        self.assertIn("不得新增科目、章节", prompt)
        self.assertIn("maxPlannedMinutes", prompt)

    def test_api_request_enables_json_output(self):
        data = plan_data()

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "choices": [{
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(raw_plan(data), ensure_ascii=False)},
                    }],
                    "usage": {"total_tokens": 600},
                }, ensure_ascii=False).encode("utf-8")

        config = {"base_url": "https://api.deepseek.com", "api_key": "example_key", "model": "deepseek-test", "thinking": ""}
        with mock.patch.object(server, "get_config", return_value=config), mock.patch.object(
            server.urllib.request, "urlopen", return_value=FakeResponse()
        ) as urlopen:
            result = server.call_ai_rolling_week_plan(data)

        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertTrue(result["ok"])
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertIn("JSON", payload["messages"][0]["content"])

    def test_reports_truncated_json_before_parsing(self):
        data = plan_data()

        class TruncatedResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "choices": [{
                        "finish_reason": "length",
                        "message": {"content": '{"schemaVersion":1'},
                    }],
                }, ensure_ascii=False).encode("utf-8")

        config = {"base_url": "https://api.deepseek.com", "api_key": "example_key", "model": "deepseek-test", "thinking": ""}
        with mock.patch.object(server, "get_config", return_value=config), mock.patch.object(
            server.urllib.request, "urlopen", return_value=TruncatedResponse()
        ):
            result = server.call_ai_rolling_week_plan(data)

        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 502)
        self.assertIn("长度上限截断", result["error"])
        self.assertNotIn("JSON 无法解析", result["error"])


if __name__ == "__main__":
    unittest.main()
