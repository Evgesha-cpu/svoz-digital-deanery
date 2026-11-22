import contextlib
import json
import os
from pathlib import Path
import sys
import uuid
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import test_api


class AssistantWorkflows(unittest.TestCase):
    def test_provider_context_confirmation_and_revocation(self):
        temporary_root = Path(__file__).resolve().parents[1] / "test-results"
        temporary_root.mkdir(exist_ok=True)
        with contextlib.ExitStack() as stack:
            database = temporary_root / f"assistant-{uuid.uuid4().hex}.sqlite3"
            stack.callback(database.unlink, missing_ok=True)
            stack.enter_context(patch.object(server, "DB_PATH", database))
            stack.enter_context(patch.dict(os.environ, {
                "SVOZ_AI_URL": "https://provider.example.invalid/chat/completions",
                "SVOZ_AI_MODEL": "test-model",
                "SVOZ_AI_KEY": "test-key",
                "SVOZ_SECURE_COOKIE": "0",
            }))
            server.initialize()
            app = stack.enter_context(server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler))
            serve = threading.Thread(target=app.serve_forever, daemon=True)
            serve.start()
            stack.callback(serve.join)
            stack.callback(app.shutdown)
            stack.enter_context(patch.object(test_api, "BASE", f"http://127.0.0.1:{app.server_port}"))
            a = test_api.Client("student1")
            b = test_api.Client("student2")
            dean = test_api.Client("dean")
            a_lesson = a.dashboard()["lessons"][0]
            b_lesson = b.dashboard()["lessons"][0]
            marker = "ИИ: проверить материалы перед семинаром"
            provider_answer = {"answer": "Черновик готов.", "proposal": {
                "kind": "task", "text": marker, "lesson_id": a_lesson["id"],
            }}

            with patch.object(server, "call_provider", return_value=provider_answer) as provider:
                self.assertEqual(a.call("/ai/chat", "POST", {"message": "Составь задачу"})[0], 403)
                self.assertEqual(dean.call("/ai/consent", "POST", {"enabled": True})[0], 200)
                provider.assert_not_called()
                for client in (a, b):
                    self.assertEqual(client.call("/ai/consent", "POST", {"enabled": True})[0], 200)
                result = a.call("/ai/chat", "POST", {"message": "Составь задачу"})
                self.assertEqual(result[0], 200)
                proposal = result[1]["proposal"]["id"]
                system = provider.call_args.args[1]
                self.assertIn(json.dumps(a_lesson["subject"], ensure_ascii=False), system)
                if a_lesson["subject"] != b_lesson["subject"]:
                    self.assertNotIn(json.dumps(b_lesson["subject"], ensure_ascii=False), system)
                self.assertNotIn(b.dashboard()["user"]["name"], system)
                self.assertNotIn(marker, [row["text"] for row in a.dashboard()["items"]])
                self.assertEqual(b.call("/ai/confirm", "POST", {"id": proposal})[0], 404)
                self.assertIn(a.call("/ai/confirm", "POST", {"id": proposal})[0], (200, 201))
                self.assertEqual(a.call("/ai/confirm", "POST", {"id": proposal})[0], 404)
                self.assertEqual([row["text"] for row in a.dashboard()["items"]].count(marker), 1)

                provider_answer["proposal"]["lesson_id"] = b_lesson["id"]
                self.assertIsNone(a.call("/ai/chat", "POST", {"message": "Чужая пара"})[1]["proposal"])
                provider_answer["proposal"]["lesson_id"] = a_lesson["id"]
                pending = a.call("/ai/chat", "POST", {"message": "Новый черновик"})[1]["proposal"]["id"]
                self.assertEqual(a.call("/ai/consent", "POST", {"enabled": False})[0], 200)
                self.assertEqual(a.call("/ai/confirm", "POST", {"id": pending})[0], 403)
                self.assertEqual(a.call("/ai/consent", "POST", {"enabled": True})[0], 200)
                self.assertEqual(a.call("/ai/confirm", "POST", {"id": pending})[0], 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
