import contextlib
import os
from pathlib import Path
import sys
import threading
import unittest
import uuid
from datetime import timedelta
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import test_api


class CampusWorkflows(unittest.TestCase):
    def setUp(self):
        self.stack = self.enterContext(contextlib.ExitStack())
        temporary_root = Path(__file__).resolve().parents[1] / "test-results"
        temporary_root.mkdir(exist_ok=True)
        database = temporary_root / f"campus-{uuid.uuid4().hex}.sqlite3"
        self.database = database
        self.stack.callback(database.unlink, missing_ok=True)
        self.visitor_databases = set()
        self.stack.callback(self.remove_visitor_databases)
        self.stack.enter_context(patch.object(server, "DB_PATH", database))
        self.stack.enter_context(patch.object(server, "RATE_BUCKETS", {}))
        self.stack.enter_context(patch.dict(os.environ, {
            "SVOZ_SECURE_COOKIE": "0", "SVOZ_ISOLATED_DEMO": "0", "POLZA_API_KEY": "",
            "SVOZ_AI_KEY": "", "SVOZ_AI_URL": "", "SVOZ_AI_MODEL": "",
        }))
        self.start_app()
        self.student, self.other, self.staff = self.login_all()

    def remove_visitor_databases(self):
        for database in self.visitor_databases:
            database.unlink(missing_ok=True)

    def start_app(self):
        stack = self.app_stack = self.stack.enter_context(contextlib.ExitStack())
        server.initialize()
        app = stack.enter_context(server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler))
        thread = threading.Thread(target=app.serve_forever, daemon=True)
        thread.start()
        stack.callback(thread.join)
        stack.callback(app.shutdown)
        stack.enter_context(patch.object(test_api, "BASE", f"http://127.0.0.1:{app.server_port}"))

    def login_all(self):
        return tuple(test_api.Client(login) for login in ("student1", "student2", "dean"))

    def catalog(self, client):
        status, data = client.call("/campus")
        self.assertEqual(status, 200, data)
        return data

    def event(self, client, event_id):
        return next((row for row in self.catalog(client)["events"] if row["id"] == event_id), None)

    def club(self, client, club_id):
        return next(row for row in self.catalog(client)["clubs"] if row["id"] == club_id)

    def create_event(self, client, title):
        data = {
            "title": title,
            "description": "Открытая встреча для участников учебного проекта.",
            "category": "education",
            "starts_at": (server.now() + timedelta(days=2)).isoformat(timespec="minutes"),
            "location": "Учебный корпус, аудитория Д-4",
            "organizer": "Кампус СВОЗ",
        }
        status, body = client.call("/campus/events", "POST", data)
        self.assertIn(status, (200, 201), body)
        return body["id"]

    def change_event(self, client, event_id, **fields):
        status, body = client.call(f"/campus/events/{event_id}", "PATCH", fields)
        self.assertEqual(status, 200, body)

    def join_event(self, client, event_id, joined=True):
        return client.call(f"/campus/events/{event_id}/join", "POST", {"joined": joined})

    def join_club(self, client, club_id, joined=True):
        return client.call(f"/campus/clubs/{club_id}/join", "POST", {"joined": joined})

    def test_proposal_moderation_and_join_are_permission_checked(self):
        self.assertEqual(test_api.Client().call("/campus")[0], 401)
        event_id = self.create_event(self.student, "Студенческий воркшоп")
        self.assertEqual(self.event(self.student, event_id)["status"], "pending")
        self.assertEqual(self.event(self.staff, event_id)["status"], "pending")
        self.assertIsNone(self.event(self.other, event_id))
        self.assertEqual(self.other.call(f"/campus/events/{event_id}")[0], 404)
        self.assertTrue(any(row.get("event_id") == event_id for row in self.staff.dashboard()["notifications"]))
        status, _ = self.other.call(f"/campus/events/{event_id}", "PATCH", {"title": "Чужая встреча"})
        self.assertIn(status, (403, 404))
        status, _ = self.student.call(f"/campus/events/{event_id}", "PATCH", {"status": "published"})
        self.assertIn(status, (403, 404))
        status, _ = self.join_event(self.other, event_id)
        self.assertIn(status, (403, 404, 409))
        self.change_event(self.staff, event_id, status="published")
        public_event = self.event(self.other, event_id)
        self.assertEqual(public_event["status"], "published")
        self.assertEqual(self.other.call(f"/campus/events/{event_id}")[0], 200)
        initial = public_event["participants"]
        self.assertFalse(public_event["joined"])
        self.assertEqual(self.join_event(self.other, event_id)[0], 200)
        self.assertEqual(self.join_event(self.other, event_id)[0], 200)
        self.assertTrue(self.event(self.other, event_id)["joined"])
        self.assertFalse(self.event(self.student, event_id)["joined"])
        self.assertEqual(self.event(self.student, event_id)["participants"], initial + 1)
        self.assertNotIn(self.other.dashboard()["user"]["name"], str(self.event(self.student, event_id)))
        self.assertEqual(self.join_event(self.other, event_id, False)[0], 200)
        self.assertFalse(self.event(self.other, event_id)["joined"])
        self.assertEqual(self.event(self.student, event_id)["participants"], initial)
        owner_notifications = self.student.dashboard()["notifications"]
        self.assertTrue(any(row.get("event_id") == event_id for row in owner_notifications))

    def test_rejection_stays_private_and_notifies_proposer(self):
        event_id = self.create_event(self.student, "Закрытая студенческая идея")
        self.change_event(self.staff, event_id, status="rejected")
        self.assertEqual(self.event(self.student, event_id)["status"], "rejected")
        self.assertEqual(self.event(self.staff, event_id)["status"], "rejected")
        self.assertIsNone(self.event(self.other, event_id))
        self.assertEqual(self.other.call(f"/campus/events/{event_id}")[0], 404)
        self.assertTrue(any(row.get("event_id") == event_id for row in self.student.dashboard()["notifications"]))
        self.assertFalse(any(row.get("event_id") == event_id for row in self.other.dashboard()["notifications"]))

    def test_staff_draft_edit_publish_and_cancel_notifies_participant(self):
        event_id = self.create_event(self.staff, "Официальная встреча")
        self.assertEqual(self.event(self.staff, event_id)["status"], "draft")
        self.assertIsNone(self.event(self.student, event_id))
        self.change_event(self.staff, event_id, title="Встреча с организаторами", location="Аудитория Г-5")
        self.change_event(self.staff, event_id, status="published")
        self.assertEqual(self.event(self.student, event_id)["title"], "Встреча с организаторами")
        self.assertEqual(self.event(self.student, event_id)["location"], "Аудитория Г-5")
        self.assertEqual(self.join_event(self.student, event_id)[0], 200)
        old_notice_ids = {row["id"] for row in self.student.dashboard()["notifications"]}
        self.change_event(self.staff, event_id, status="cancelled")
        self.assertEqual(self.event(self.staff, event_id)["status"], "cancelled")
        status, _ = self.join_event(self.other, event_id)
        self.assertIn(status, (403, 404, 409))
        notice = next(
            row for row in self.student.dashboard()["notifications"]
            if row.get("event_id") == event_id and row["id"] not in old_notice_ids
        )
        self.assertFalse(notice["read"])
        status, _ = self.other.call("/notifications/read", "POST", {"id": notice["id"]})
        self.assertIn(status, (403, 404))
        self.assertEqual(self.student.call("/notifications/read", "POST", {"id": notice["id"]})[0], 200)

    def test_membership_and_event_signup_survive_restart(self):
        club_id = self.catalog(self.student)["clubs"][0]["id"]
        if self.club(self.student, club_id)["joined"]:
            self.assertEqual(self.join_club(self.student, club_id, False)[0], 200)
        initial_club = self.club(self.other, club_id)
        event_id = self.create_event(self.staff, "Встреча клуба")
        self.change_event(self.staff, event_id, status="published")
        self.assertEqual(self.join_club(self.student, club_id)[0], 200)
        self.assertEqual(self.join_club(self.student, club_id)[0], 200)
        self.assertEqual(self.join_event(self.student, event_id)[0], 200)
        self.app_stack.close()
        self.start_app()
        self.student, self.other, self.staff = self.login_all()
        self.assertTrue(self.event(self.student, event_id)["joined"])
        self.assertFalse(self.event(self.other, event_id)["joined"])
        self.assertTrue(any(row["id"] == event_id for row in self.student.dashboard()["campus_events"]))
        self.assertTrue(self.club(self.student, club_id)["joined"])
        self.assertEqual(self.club(self.other, club_id)["joined"], initial_club["joined"])
        self.assertEqual(self.club(self.other, club_id)["members"], initial_club["members"] + 1)
        self.assertEqual(self.join_club(self.student, club_id, False)[0], 200)
        self.assertFalse(self.club(self.student, club_id)["joined"])
        self.assertEqual(self.club(self.other, club_id)["members"], initial_club["members"])

    def test_distinct_visitor_sessions_with_same_login_are_isolated(self):
        def visitor_database(token):
            database = self.database.with_name(f"{self.database.stem}-{server.token_hash(token)}.sqlite3")
            self.visitor_databases.add(database)
            return database

        def switch_role(client, login):
            self.assertEqual(client.call("/logout", "POST", {})[0], 200)
            self.assertEqual(client.call("/login", "POST", {
                "login": login, "password": test_api.PASSWORD,
            })[0], 200)

        self.stack.enter_context(patch.dict(os.environ, {"SVOZ_ISOLATED_DEMO": "1"}))
        self.stack.enter_context(patch.object(server, "demo_database", side_effect=visitor_database))
        visitor, outsider = test_api.Client("student1"), test_api.Client("student1")
        event_id = self.create_event(visitor, "Событие первого посетителя")
        switch_role(visitor, "dean")
        self.change_event(visitor, event_id, status="published")
        switch_role(visitor, "student2")
        self.assertEqual(self.join_event(visitor, event_id)[0], 200)
        self.assertTrue(self.event(visitor, event_id)["joined"])
        self.assertIsNone(self.event(outsider, event_id))
        self.assertEqual(outsider.call(f"/campus/events/{event_id}")[0], 404)
        self.assertEqual(self.join_event(outsider, event_id)[0], 404)
        self.assertFalse(any(row.get("event_id") == event_id for row in outsider.dashboard()["notifications"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
