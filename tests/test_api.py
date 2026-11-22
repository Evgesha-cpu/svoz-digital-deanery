import http.cookiejar
import json
import os
import unittest
import urllib.error
import urllib.request

BASE = os.environ.get("SVOZ_TEST_URL", "http://127.0.0.1:8001")
PASSWORD = "SvozDemo2026!"


class Client:
    def __init__(self, login=None):
        self.agent = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        if login:
            status, _ = self.call("/login", "POST", {"login": login, "password": PASSWORD})
            if status != 200:
                raise AssertionError(f"Login {login}: {status}")

    def call(self, path, method="GET", body=None, origin=None, timeout=10):
        headers = {"Accept": "application/json"}
        if body is not None:
            headers.update({"Content-Type": "application/json", "Origin": origin or BASE})
        request = urllib.request.Request(
            BASE + "/api" + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers=headers,
        )
        try:
            result = self.agent.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            result = error
        with result:
            raw = result.read()
            return result.status, json.loads(raw) if raw else None

    def dashboard(self):
        status, data = self.call("/dashboard")
        assert status == 200, status
        return data


class Workflows(unittest.TestCase):
    def setUp(self):
        self.a, self.b, self.dean = (Client(login) for login in ("student1", "student2", "dean"))

    def test_login_profile_and_seeded_coursework(self):
        self.assertEqual(Client().call("/dashboard")[0], 401)
        self.assertEqual(Client().call("/login", "POST", {"login": "student1", "password": "wrong"})[0], 401)
        a, b, dean = (client.dashboard() for client in (self.a, self.b, self.dean))
        self.assertNotEqual(a["user"]["group"], b["user"]["group"])
        self.assertNotEqual(a["grades"], b["grades"])
        self.assertEqual(dean["user"]["role"], "staff")
        self.assertTrue(a["user"]["faculty"] and a["user"]["program"])
        self.assertTrue(any(row.get("old_room") for row in a["lessons"]))
        self.assertTrue(any(row.get("lesson_id") for row in a["notifications"]))
        self.assertEqual(self.a.call("/logout", "POST", {})[0], 200)
        self.assertEqual(self.a.call("/dashboard")[0], 401)

    def test_notes_and_tasks_persist_and_stay_private(self):
        a, b = self.a.dashboard(), self.b.dashboard()
        lesson = a["lessons"][0]
        for kind in ("note", "task"):
            text = f"Проверка {kind} {os.urandom(4).hex()}"
            status, _ = self.a.call("/items", "POST", {
                "kind": kind, "text": text, "lesson_id": lesson["id"], "due": a["today"],
            })
            self.assertIn(status, (200, 201))
            item = next(row for row in Client("student1").dashboard()["items"] if row["text"] == text)
            self.assertEqual(item["lesson_id"], lesson["id"])
            self.assertFalse(any(row["id"] == item["id"] for row in Client("student2").dashboard()["items"]))
            self.assertEqual(self.b.call(f'/items/{item["id"]}', "PATCH", {"done": True})[0], 404)
            if kind == "task":
                reminders = [row for row in self.a.dashboard()["notifications"] if row.get("item_id") == item["id"]]
                self.assertEqual(len(reminders), 1)
                self.assertFalse(any(row.get("item_id") == item["id"] for row in self.b.dashboard()["notifications"]))
                self.assertEqual(self.a.call(f'/items/{item["id"]}', "PATCH", {"done": True})[0], 200)
                self.assertTrue(next(row for row in self.a.dashboard()["items"] if row["id"] == item["id"])["done"])
        payload = {"kind": "note", "text": "Чужая пара", "lesson_id": b["lessons"][0]["id"]}
        self.assertIn(self.a.call("/items", "POST", payload)[0], (400, 404))

    def test_full_request_and_notifications(self):
        service = self.a.dashboard()["services"][0]["type"]
        title = "Справка для конкурса " + os.urandom(4).hex()
        status, _ = self.a.call("/requests", "POST", {"type": service, "subject": title, "body": "Прошу выдать справку."})
        self.assertIn(status, (200, 201))
        item = next(row for row in self.a.dashboard()["requests"] if row["subject"] == title)
        route = f'/requests/{item["id"]}'
        self.assertEqual(item["status"], "Отправлена")
        self.assertEqual(self.b.call(route)[0], 404)
        self.assertIn(self.b.call(route + "/messages", "POST", {"body": "Чужая запись"})[0], (403, 404))
        self.assertEqual(self.a.call(route, "PATCH", {"status": "В работе"})[0], 403)
        self.assertEqual(self.dean.call(route)[0], 200)
        self.assertEqual(self.dean.call(route, "PATCH", {"status": "В работе"})[0], 200)
        self.assertIn(self.dean.call(route + "/messages", "POST", {"body": "Справку готовим."})[0], (200, 201))
        self.assertEqual(self.dean.call(route, "PATCH", {"status": "Готова"})[0], 200)
        self.assertIn(self.a.call(route + "/messages", "POST", {"body": "Спасибо!"})[0], (200, 201, 409))
        details = self.a.call(route)[1]
        self.assertEqual(details["status"], "Готова")
        self.assertGreaterEqual(len(details["history"]), 3)
        self.assertIn("Справку готовим.", [msg["body"] for msg in details["messages"]])
        notification = next(row for row in self.a.dashboard()["notifications"] if row.get("request_id") == item["id"])
        self.assertFalse(notification["read"])
        self.assertIn(self.b.call("/notifications/read", "POST", {"id": notification["id"]})[0], (400, 404))
        self.assertEqual(self.a.call("/notifications/read", "POST", {"id": notification["id"]})[0], 200)
        self.assertTrue(next(row for row in self.a.dashboard()["notifications"] if row["id"] == notification["id"])["read"])

    def test_ai_default_off_grants_no_write_and_can_be_disabled(self):
        self.assertFalse(self.a.dashboard()["ai"]["enabled"])
        self.assertEqual(self.a.call("/ai/chat", "POST", {"message": "Моё расписание"})[0], 403)
        self.assertIn(self.a.call("/ai/confirm", "POST", {"id": "unknown"})[0], (400, 403, 404))
        self.assertEqual(self.a.call("/ai/consent", "POST", {"enabled": True})[0], 200)
        self.assertTrue(self.a.dashboard()["ai"]["enabled"])
        self.assertFalse(Client("student1").dashboard()["ai"]["enabled"])
        self.assertFalse(self.b.dashboard()["ai"]["enabled"])
        if not self.a.dashboard()["ai"]["available"]:
            self.assertEqual(self.a.call("/ai/chat", "POST", {"message": "Моё расписание"})[0], 503)
        self.assertEqual(self.a.call("/ai/consent", "POST", {"enabled": False})[0], 200)
        self.assertFalse(self.a.dashboard()["ai"]["enabled"])

    def test_cross_origin_write_denied(self):
        status, _ = self.a.call("/items", "POST", {"kind": "note", "text": "Блокировать"}, origin="https://example.invalid")
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
