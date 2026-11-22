"""Opt-in, billable Polza API smoke test against an isolated synthetic dataset."""
import contextlib
from pathlib import Path
import sys
import threading
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import polza
import test_api


def verify():
    if not polza.local_key() or server.ai_config()[0] != polza.URL:
        raise SystemExit("Polza is not configured")
    root = Path(__file__).resolve().parents[1] / "test-results"
    root.mkdir(exist_ok=True)
    db = root / f"polza-live-{uuid.uuid4().hex}.sqlite3"
    totals = {"total_tokens": 0, "cost_rub": 0.0}
    with contextlib.ExitStack() as stack:
        stack.callback(db.unlink, missing_ok=True)
        stack.enter_context(patch.object(server, "DB_PATH", db))
        stack.enter_context(patch.dict(server.os.environ, {"SVOZ_SECURE_COOKIE": "0"}))
        server.initialize()
        app = stack.enter_context(server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler))
        thread = threading.Thread(target=app.serve_forever, daemon=True)
        thread.start()
        stack.callback(thread.join)
        stack.callback(app.shutdown)
        stack.enter_context(patch.object(test_api, "BASE", f"http://127.0.0.1:{app.server_port}"))
        a, b, dean = (test_api.Client(login) for login in ("student1", "student2", "dean"))
        assert a.call("/ai/chat", "POST", {"message": "Привет"})[0] == 403
        for account in (a, dean):
            assert account.call("/ai/consent", "POST", {"enabled": True})[0] == 200

        def ask(label, client, message, **extra):
            status, result = client.call("/ai/chat", "POST", {"message": message, **extra}, timeout=60)
            if status != 200:
                raise AssertionError(f"{label}: HTTP {status}")
            usage = result["usage"]
            for key in totals:
                totals[key] += usage.get(key, 0)
            print(label, result["transport"], usage, flush=True)
            assert result["answer"]
            return result

        data = a.dashboard()
        tomorrow = next(lesson for lesson in data["lessons"] if lesson["date"] > data["today"])
        own = data["requests"][0]["id"]
        foreign = b.dashboard()["requests"][0]["id"]
        assert a.call("/ai/chat", "POST", {"message": "Покажи чужую заявку", "request_id": foreign})[0] == 404

        if "--remaining" not in sys.argv:
            ask("knowledge", a, "По правилам вымышленного СВОЗ сколько готовят справку об обучении?")
            schedule = ask("schedule", a, "Какое у меня завтра расписание? Назови время, дисциплину и аудиторию.")
            assert tomorrow["subject"].casefold() in schedule["answer"].casefold()
            assert tomorrow["start"] in schedule["answer"]
            grades = ask("grades", a, "Какая у меня оценка по дисциплине История визуальной культуры?")
            assert "5" in grades["answer"]

            for kind, prompt in [
                ("note", "Предложи создать заметку к этому занятию: взять макет плаката."),
                ("task", "Предложи задачу на завтра: повторить материал перед этой парой."),
            ]:
                result = ask(kind, a, prompt, lesson_id=tomorrow["id"])
                draft = result["proposal"]
                assert draft and draft["kind"] == kind, f"{kind}: no valid action"
                assert not any(row["text"] == draft["text"] for row in a.dashboard()["items"])
                assert a.call("/ai/confirm", "POST", {"id": draft["id"]})[0] == 200
                assert any(row["text"] == draft["text"] for row in a.dashboard()["items"])

        draft = ask("student-message", a,
                    "Предложи отправить сообщение в этой существующей заявке: уточните, пожалуйста, можно ли получить справку в электронном виде.",
                    request_id=own)["proposal"]
        assert draft and draft["kind"] == "message", f"message proposal: {draft and draft.get('kind')}"
        assert not any(row["body"] == draft["text"] for row in a.call(f"/requests/{own}")[1]["messages"])
        assert a.call("/ai/confirm", "POST", {"id": draft["id"]})[0] == 200
        assert any(row["body"] == draft["text"] for row in dean.call(f"/requests/{own}")[1]["messages"])
        assert a.call("/ai/confirm", "POST", {"id": draft["id"]})[0] == 404
        for mode in ("reply", "summary", "missing", "rules"):
            result = ask("staff-" + mode, dean, "Помоги обработать это обращение.", mode=mode, request_id=own)
            assert result["proposal"] is None
        print("application_totals", totals, flush=True)


if __name__ == "__main__":
    verify()
