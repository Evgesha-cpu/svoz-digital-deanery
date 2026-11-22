import contextlib
from pathlib import Path
import sys
import threading
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import test_api


def main():
    root = Path(__file__).resolve().parents[1] / "test-results"
    root.mkdir(exist_ok=True)
    database = root / f"planning-{uuid.uuid4().hex}.sqlite3"
    with contextlib.ExitStack() as stack:
        stack.callback(database.unlink, missing_ok=True)
        stack.enter_context(patch.object(server, "DB_PATH", database))
        stack.enter_context(patch.dict(server.os.environ, {"SVOZ_SECURE_COOKIE":"0", "SVOZ_ISOLATED_DEMO":"0"}))
        assert server.ai_config() and server.ai_config()[0] == server.polza.URL
        server.initialize()
        app = stack.enter_context(server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler))
        thread = threading.Thread(target=app.serve_forever, daemon=True)
        thread.start()
        stack.callback(thread.join)
        stack.callback(app.shutdown)
        stack.enter_context(patch.object(test_api, "BASE", f"http://127.0.0.1:{app.server_port}"))
        seed = test_api.Client("student1")
        dashboard = seed.dashboard()
        for text, offset in (("Подготовить черновик доклада", 1), ("Проверить библиографию", 4)):
            due = (server.date.fromisoformat(dashboard["today"]) + server.timedelta(days=offset)).isoformat()
            assert seed.call("/items", "POST", {"kind":"task", "text":text, "due":due})[0] == 200
        questions = [
            "К чему подготовиться на ближайшие семь дней и что приоритетнее?",
            "Сколько примерно времени займут мои домашние задания? Укажи, что неизвестно.",
            "Успею ли я закончить задачи до пятницы, если сегодня есть только час? Учти расписание и сроки.",
            "Какие задания самые срочные и что будет, если их отложить? Есть ли известные материалы?",
        ]
        print("Контрольные даты и результаты:", [(r["subject"],r["kind"],r["due"],r["grade"]) for r in dashboard["grades"]],flush=True)
        def ask(question):
            client=test_api.Client("student1")
            assert client.call("/ai/consent", "POST", {"enabled":True})[0] == 200
            status, output = client.call("/ai/chat","POST",{"message":question},timeout=45)
            assert status==200,(status,output)
            assert output["transport"]=="tool" and output["answer"] and output["proposal"] is None
            return question,output
        for question in questions:
            question, output = ask(question)
            print(question, output["answer"], output["sources"], output["usage"], sep="\n", flush=True)


if __name__=="__main__":
    main()
