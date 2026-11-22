"""Run against a fresh server with SVOZ_ISOLATED_DEMO=1."""
import os
import unittest

from test_api import Client, PASSWORD


@unittest.skipUnless(os.getenv("SVOZ_TEST_ISOLATED") == "1", "requires isolated demo server")
class VisitorIsolation(unittest.TestCase):
    def test_shared_demo_credentials_do_not_share_mutations(self):
        first = Client("student1")
        other = Client("student1")
        marker = "Заявка исключительно первого посетителя"
        status, ticket = first.call("/requests", "POST", {
            "type": first.dashboard()["services"][0]["type"],
            "subject": marker,
            "body": "Данные изолированного стенда.",
        })
        self.assertEqual(status, 200)
        path = f"/requests/{ticket['id']}"
        self.assertEqual(other.call(path)[0], 404)
        self.assertNotIn(marker, [x["subject"] for x in other.dashboard()["requests"]])
        self.assertEqual(first.call("/logout", "POST", {})[0], 200)
        self.assertEqual(first.call("/login", "POST", {"login":"dean","password":PASSWORD})[0], 200)
        self.assertEqual(first.call(path)[1]["subject"], marker)
        self.assertEqual(first.call(path, "PATCH", {"status":"В работе"})[0], 200)
        self.assertEqual(first.call(path + "/messages", "POST", {"body":"Ответ первого стенда"})[0], 200)
        self.assertEqual(other.call("/logout", "POST", {})[0], 200)
        self.assertEqual(other.call("/login", "POST", {"login":"dean","password":PASSWORD})[0], 200)
        self.assertEqual(other.call(path)[0], 404)
        self.assertEqual(first.call("/logout", "POST", {})[0], 200)
        self.assertEqual(first.call("/login", "POST", {"login":"student1","password":PASSWORD})[0], 200)
        self.assertEqual(first.call(path)[1]["status"], "В работе")
        self.assertEqual(first.call(path)[1]["messages"][-1]["body"], "Ответ первого стенда")
        self.assertTrue(any(n["request_id"] == ticket["id"] for n in first.dashboard()["notifications"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
