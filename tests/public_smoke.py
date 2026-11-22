import http.cookiejar
import json
from pathlib import Path
import sys
import uuid
from urllib.request import HTTPCookieProcessor

import test_api
from test_api import Client, PASSWORD

STATE = Path(__file__).resolve().parents[1] / "test-results" / "public-check.json"


def call(client, path, method="GET", body=None, expected=200, timeout=10):
    status, result = client.call(path, method, body, timeout=timeout)
    assert status == expected, (path, status, expected)
    return result


def cookiejar(client):
    return next(handler.cookiejar for handler in client.agent.handlers
                if isinstance(handler, HTTPCookieProcessor))


def switch(client, login):
    call(client, "/logout", "POST", {})
    call(client, "/login", "POST", {"login": login, "password": PASSWORD})


def main():
    if "--after-restart" in sys.argv:
        with STATE.open(encoding="utf-8") as state:
            saved = json.load(state)
        client = Client()
        for args in saved["cookies"]:
            cookiejar(client).set_cookie(http.cookiejar.Cookie(**args))
        dashboard = client.dashboard()
        assert any(row["id"] == saved["id"] and row["text"] == saved["text"] for row in dashboard["items"])
        STATE.unlink()
        print("Public data and session survived restart.")
        return

    client, other = Client("student1"), Client("student1")
    dashboard = client.dashboard()
    assert dashboard["lessons"] and dashboard["grades"] and dashboard["notifications"]
    lesson = dashboard["lessons"][0]["id"]
    marker = "Проверка публикации " + uuid.uuid4().hex[:8]
    for kind in ("note", "task"):
        item = call(client, "/items", "POST", {"kind": kind, "text": marker, "lesson_id": lesson})
        assert any(row["id"] == item["id"] and row["text"] == marker for row in client.dashboard()["items"])
    ticket = call(client, "/requests", "POST", {"type":"study","subject":marker,"body":"Проверка изолированной заявки."})
    path = f"/requests/{ticket['id']}"
    call(other, path, expected=404)
    assert not any(row["text"] == marker for row in other.dashboard()["items"])
    switch(other, "dean")
    call(other, path, expected=404)
    switch(client, "student2")
    assert client.dashboard()["user"]["id"] != dashboard["user"]["id"]
    call(client, path, expected=404)
    switch(client, "dean")
    call(client, path, "PATCH", {"status":"В работе"})
    call(client, path + "/messages", "POST", {"body":"Заявка принята."})
    switch(client, "student1")
    assert call(client, path)["messages"][-1]["body"] == "Заявка принята."
    assert any(n["request_id"] == ticket["id"] for n in client.dashboard()["notifications"])
    call(client, "/ai/chat", "POST", {"message":"Расписание"}, expected=403)
    call(client, "/ai/consent", "POST", {"enabled":True})
    generated = call(client, "/ai/chat", "POST", {
        "message":"Предложи создать заметку к этому занятию: взять макет на семинар.",
        "lesson_id":lesson,
    }, timeout=40)
    assert generated["transport"] == "tool"
    draft = generated["proposal"]
    assert draft and draft["kind"] == "note"
    assert not any(row["text"] == draft["text"] for row in client.dashboard()["items"])
    confirmed = call(client, "/ai/confirm", "POST", {"id":draft["id"]})
    call(client, "/ai/consent", "POST", {"enabled":False})
    call(client, "/ai/chat", "POST", {"message":"Расписание"}, expected=403)
    assert any(row["id"] == confirmed["id"] for row in client.dashboard()["items"])
    STATE.parent.mkdir(exist_ok=True)
    cookies = [{("rest" if key == "_rest" else key): value for key,value in vars(cookie).items()}
               for cookie in cookiejar(client)]
    with STATE.open("w", encoding="utf-8") as file:
        json.dump({"cookies":cookies,"id":confirmed["id"],"text":draft["text"]}, file)
    print("Public API: isolation, three roles, request cycle, notes/tasks, live Polza, AI confirmation and opt-out.", generated["usage"])


if __name__ == "__main__":
    main()
