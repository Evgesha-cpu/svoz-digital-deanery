import contextlib
import json
import os
from pathlib import Path
import sys
import threading
import unittest
import uuid
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import polza
import test_api


class PolzaWorkflows(unittest.TestCase):
    """Exercise the real HTTP and SQLite paths with a simulated model."""

    def setUp(self):
        stack = self.enterContext(contextlib.ExitStack())
        temporary_root = Path(__file__).resolve().parents[1] / "test-results"
        temporary_root.mkdir(exist_ok=True)
        database = temporary_root / f"polza-{uuid.uuid4().hex}.sqlite3"
        stack.callback(database.unlink, missing_ok=True)
        stack.enter_context(patch.object(server, "DB_PATH", database))
        stack.enter_context(patch.object(server, "RATE_BUCKETS", {}))
        stack.enter_context(patch.dict(os.environ, {
            "POLZA_API_KEY": "synthetic-test-value",
            "SVOZ_AI_KEY": "",
            "SVOZ_AI_URL": "",
            "SVOZ_AI_MODEL": "",
            "SVOZ_SECURE_COOKIE": "0",
        }))
        server.initialize()
        app = stack.enter_context(server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler))
        thread = threading.Thread(target=app.serve_forever, daemon=True)
        thread.start()
        stack.callback(thread.join)
        stack.callback(app.shutdown)
        stack.enter_context(patch.object(test_api, "BASE", f"http://127.0.0.1:{app.server_port}"))
        self.provider = stack.enter_context(patch.object(server, "call_provider"))
        self.provider.return_value = {"answer": "По данным кабинета.", "proposal": None}
        self.student, self.other, self.staff = (
            test_api.Client(login) for login in ("student1", "student2", "dean")
        )

    def consent(self, client, enabled=True):
        self.assertEqual(client.call("/ai/consent", "POST", {"enabled": enabled})[0], 200)

    def chat(self, client, message, **context):
        return client.call("/ai/chat", "POST", {"message": message, **context})

    def proposal(self, client, proposal, **context):
        self.provider.return_value = {"answer": "Проверьте черновик.", "proposal": proposal}
        status, body = self.chat(client, "Подготовь действие", **context)
        self.assertEqual(status, 200, body)
        self.assertIsNotNone(body["proposal"])
        return body["proposal"]

    def test_context_is_scoped_and_requires_consent(self):
        own, other = self.student.dashboard(), self.other.dashboard()
        lesson = own["lessons"][0]
        grade = own["grades"][0]
        self.assertTrue(own["ai"]["available"])
        self.assertFalse(own["ai"]["enabled"])
        self.assertEqual(self.chat(self.student, "Какое у меня завтра расписание?")[0], 403)
        self.provider.assert_not_called()
        self.consent(self.student)
        self.provider.return_value["sources"] = [
            {"kind": "lesson", "id": lesson["id"]},
            {"kind": "lesson", "id": other["lessons"][0]["id"]},
        ]
        status, body = self.chat(self.student, "Покажи расписание на занятие", lesson_id=lesson["id"])
        self.assertEqual(status, 200, body)
        context = str(self.provider.call_args.args[1])
        self.assertIn(lesson["subject"], context)
        self.assertNotIn(other["lessons"][0]["subject"], context)
        self.assertNotIn(own["items"][0]["text"], context)
        self.assertNotIn(own["requests"][0]["body"], context)
        self.assertEqual([row["id"] for row in body["sources"]], [lesson["id"]])
        self.assertNotIn(other["user"]["name"], context)
        self.provider.return_value["sources"] = [{"kind": "grade", "id": grade["id"]}]
        status, body = self.chat(self.student, "Какой у меня зачёт и оценка?", subject=grade["subject"])
        self.assertEqual(status, 200, body)
        self.assertIn(grade["subject"], str(self.provider.call_args.args[1]))
        self.assertIn("grade", {row["kind"] for row in body["sources"]})
        self.assertEqual(self.chat(self.student, "Покажи чужое занятие", lesson_id=other["lessons"][0]["id"])[0], 404)
        self.assertEqual(self.provider.call_count, 2)
        self.consent(self.student, False)
        self.assertEqual(self.chat(self.student, "Оценки")[0], 403)
        self.assertEqual(self.provider.call_count, 2)

    def test_message_waits_for_confirmation_and_can_be_discarded(self):
        self.consent(self.student)
        self.consent(self.other)
        ticket = self.student.dashboard()["requests"][0]
        request_id = ticket["id"]
        route = f"/requests/{request_id}"
        marker = "Уточнение по синтетической справке"
        proposal = {"kind": "message", "request_id": request_id, "text": marker}
        discard = self.proposal(self.student, proposal, request_id=request_id)["id"]
        initial = self.student.call(route)[1]["messages"]
        self.assertEqual(self.staff.call(route)[1]["messages"], initial)
        self.assertEqual(self.other.call("/ai/discard", "POST", {"id": discard})[0], 404)
        self.assertEqual(self.student.call("/ai/discard", "POST", {"id": discard})[0], 200)
        self.assertEqual(self.student.call("/ai/confirm", "POST", {"id": discard})[0], 404)
        confirm = self.proposal(self.student, proposal, request_id=request_id)["id"]
        self.assertEqual(self.student.call(route)[1]["messages"], initial)
        self.assertEqual(self.other.call("/ai/confirm", "POST", {"id": confirm})[0], 404)
        self.assertEqual(self.student.call("/ai/confirm", "POST", {"id": confirm})[0], 200)
        self.assertEqual(self.student.call("/ai/confirm", "POST", {"id": confirm})[0], 404)
        messages = self.staff.call(route)[1]["messages"]
        self.assertEqual([row["body"] for row in messages].count(marker), 1)
        self.assertEqual(self.other.call(route)[0], 404)

    def test_note_and_task_use_the_same_records_as_manual_actions(self):
        self.consent(self.student)
        own = self.student.dashboard()
        subject = own["grades"][0]["subject"]
        for kind, marker in (("note", "Повторить лекцию"), ("task", "Закончить подготовку")):
            with self.subTest(kind=kind):
                draft = self.proposal(self.student, {
                    "kind": kind, "text": marker, "subject": subject, "due": own["today"],
                }, subject=subject)
                self.assertNotIn(marker, [row["text"] for row in self.student.dashboard()["items"]])
                status, body = self.student.call("/ai/confirm", "POST", {"id": draft["id"]})
                self.assertIn(status, (200, 201), body)
                item = next(row for row in self.student.dashboard()["items"] if row["text"] == marker)
                self.assertEqual((item["kind"], item["subject"]), (kind, subject))
                self.assertNotIn(marker, [row["text"] for row in self.other.dashboard()["items"]])

    def test_staff_works_with_assigned_request_and_never_sends_automatically(self):
        student_data = self.student.dashboard()
        request_id = student_data["requests"][0]["id"]
        route = f"/requests/{request_id}"
        self.assertEqual(self.chat(self.staff, "Подготовь ответ", request_id=request_id, mode="reply")[0], 403)
        self.provider.assert_not_called()
        self.consent(self.staff)
        initial = self.staff.call(route)[1]
        self.assertEqual(self.staff.call(route + "/messages", "POST", {
            "body": "Уточнение для проверки краткого содержания."
        })[0], 200)
        before_ai = self.staff.call(route)[1]
        self.provider.return_value = {"answer": "Черновик сотрудника.", "proposal": {
            "kind": "message", "request_id": request_id, "text": "Модель предлагает отправку.",
        }}
        status, reply = self.chat(self.staff, "Подготовь ответ", request_id=request_id, mode="reply")
        self.assertEqual(status, 200, reply)
        self.assertEqual(reply["answer"], "Черновик сотрудника.")
        self.assertIsNone(reply["proposal"])
        self.assertEqual(self.staff.call(route)[1]["messages"], before_ai["messages"])
        self.assertEqual(self.staff.call(route)[1]["status"], initial["status"])
        prompt = str(self.provider.call_args.args[1])
        self.assertIn(initial["body"], prompt)
        self.assertNotIn(student_data["items"][0]["text"], prompt)
        self.assertNotIn(student_data["grades"][0]["subject"], prompt)
        self.provider.return_value = {"answer": "Сводка или правило.", "proposal": None}
        for mode in ("summary", "missing", "rules"):
            with self.subTest(mode=mode):
                self.assertEqual(self.chat(self.staff, "О чём обращение?", request_id=request_id, mode=mode)[0], 200)
        self.assertEqual(self.chat(self.staff, "Покажи заявку", request_id=9999, mode="summary")[0], 404)
        self.assertEqual(self.staff.call(route)[1]["messages"], before_ai["messages"])

    def test_provider_failure_leaves_manual_routes_available(self):
        self.consent(self.student)
        self.provider.side_effect = URLError("simulated network error")
        status, body = self.chat(self.student, "Простой тестовый вопрос")
        self.assertEqual(status, 502, body)
        self.assertTrue(self.student.dashboard()["lessons"])
        status, body = self.student.call("/items", "POST", {"kind": "note", "text": "Ручной режим"})
        self.assertIn(status, (200, 201), body)
        self.provider.side_effect = HTTPError(polza.URL, 429, "rate limit", None, None)
        self.assertEqual(self.chat(self.student, "Проверка ограничения провайдера")[0], 429)

    def test_local_limit_stops_model_calls(self):
        self.consent(self.student)
        for request_number in range(1, 82):
            status, body = self.chat(self.student, "Что известно об университете?")
            if status == 429:
                break
            self.assertEqual(status, 200, body)
        self.assertEqual(status, 429)
        self.assertEqual(self.provider.call_count, request_number - 1)
        self.assertTrue(self.student.dashboard()["lessons"])

    def test_request_draft_requires_normal_submission(self):
        self.consent(self.student)
        before = self.student.dashboard()["requests"]
        draft = self.proposal(self.student, {
            "kind": "request", "type": "study", "title": "Справка для практики",
            "text": "Нужна справка, подтверждающая обучение.",
        })
        self.assertEqual(self.student.dashboard()["requests"], before)
        self.assertNotIn("id", draft)
        self.assertEqual(self.student.call("/ai/confirm", "POST", draft)[0], 400)
        self.assertEqual(self.student.dashboard()["requests"], before)
        status, body = self.student.call("/requests", "POST", {
            "type": draft["type"], "subject": draft["title"], "body": draft["text"],
        })
        self.assertIn(status, (200, 201), body)
        self.assertEqual(self.student.call(f"/requests/{body['id']}")[1]["status"], "Отправлена")


class PolzaTransport(unittest.TestCase):
    config = (polza.URL, "synthetic-test-value", polza.MODEL)

    def test_reads_single_function_result_and_provider_usage(self):
        completion = {
            "choices": [{"message": {"tool_calls": [{"function": {
                "name": "present_result",
                "arguments": json.dumps({"answer": "Проверка", "proposal": None}),
            }}]}}],
            "usage": {"prompt_tokens": 24, "completion_tokens": 15, "total_tokens": 39, "cost_rub": 0.012},
        }
        with patch.object(polza, "invoke", return_value=completion) as invoke:
            output = polza.complete(self.config, "Контекст", "Вопрос")
        request = invoke.call_args.args[1]
        self.assertEqual(request["model"], polza.MODEL)
        self.assertEqual(request["tools"][0]["function"]["name"], "present_result")
        self.assertEqual(output["transport"], "tool")
        self.assertEqual(output["answer"], "Проверка")
        self.assertEqual(output["usage"], completion["usage"])

    def test_retries_once_with_json_when_tools_are_rejected(self):
        requests = []

        def invoke(config, request):
            requests.append(request.copy())
            if len(requests) == 1:
                raise HTTPError(polza.URL, 422, "tools rejected", None, None)
            return {"choices": [{"message": {"content": '{"answer":"Ответ","proposal":null}'}}]}

        with patch.object(polza, "invoke", side_effect=invoke):
            output = polza.complete(self.config, "Контекст", "Вопрос")
        self.assertEqual(len(requests), 2)
        self.assertIn("tools", requests[0])
        self.assertNotIn("tools", requests[1])
        self.assertEqual(output["transport"], "json")
        self.assertEqual(output["answer"], "Ответ")


if __name__ == "__main__":
    unittest.main(verbosity=2)
