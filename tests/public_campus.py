"""Public Campus and visitor-reset smoke test; uses only isolated synthetic accounts."""
import argparse
import http.cookiejar
import json
from pathlib import Path
from urllib.request import HTTPCookieProcessor
import uuid

from test_api import Client, PASSWORD


def call(client, route, method="GET", data=None, expected=200):
    status, result = client.call(route, method, data)
    assert status == expected, (route, status, expected, result)
    return result


def cookies(client):
    return next(handler.cookiejar for handler in client.agent.handlers
                if isinstance(handler, HTTPCookieProcessor))


def switch(client, role):
    call(client, "/logout", "POST", {})
    call(client, "/login", "POST", {"login": role, "password": PASSWORD})


def save(path, client, **data):
    entries = [{("rest" if key == "_rest" else key): value for key, value in vars(cookie).items()}
               for cookie in cookies(client)]
    path.write_text(json.dumps({"cookies": entries, **data}), encoding="utf-8")


def restore(path):
    saved = json.loads(path.read_text(encoding="utf-8"))
    client = Client()
    for row in saved["cookies"]:
        cookies(client).set_cookie(http.cookiejar.Cookie(**row))
    return client, saved


def clean_dashboard(client, role):
    dashboard = client.dashboard()
    assert dashboard["user"]["role"] == role
    assert all(not row["read"] for row in dashboard["notifications"])
    assert not any(row["text"].startswith("Проверка поколения") for row in dashboard["items"])
    return dashboard


def prepare_old(path):
    client = Client("student1")
    data = client.dashboard()
    marker = "Проверка поколения " + uuid.uuid4().hex[:10]
    call(client, "/items", "POST", {"kind":"note","text":marker})
    call(client, "/items", "POST", {"kind":"task","text":marker})
    ticket = next(iter(data["requests"]))
    switch(client, "dean")
    route = f"/requests/{ticket['id']}"
    call(client, route, "PATCH", {"status":"Готова"})
    call(client, route + "/messages", "POST", {"body":marker})
    switch(client, "student1")
    call(client, "/notifications/read", "POST", {})
    assert all(row["read"] for row in client.dashboard()["notifications"])
    save(path, client, marker=marker, ticket=ticket["id"], status=ticket["status"])
    print("Prepared old visitor state with a note, task, request changes and read notifications.")


def verify_reset(path):
    client, saved = restore(path)
    call(client, "/dashboard", expected=401)
    call(client, "/login", "POST", {"login":"student1","password":PASSWORD})
    dashboard = clean_dashboard(client, "student")
    assert saved["marker"] not in [row["text"] for row in dashboard["items"]]
    ticket = call(client, f"/requests/{saved['ticket']}")
    assert all(row["body"] != saved["marker"] for row in ticket["messages"])
    assert ticket["status"] == saved["status"]
    switch(client, "student2")
    clean_dashboard(client, "student")
    switch(client, "dean")
    clean_dashboard(client, "staff")
    path.unlink()
    print("Old visitor state reset. Three accounts opened with clean seeded data.")


def before_restart(path):
    student = Client("student1")
    dashboard = clean_dashboard(student, "student")
    catalog = call(student, "/campus")
    assert catalog["events"] and catalog["clubs"]
    marker = "Проверка сохранения Кампуса " + uuid.uuid4().hex[:8]
    note = call(student, "/items", "POST", {"kind":"note","text":marker})
    event = next(row for row in catalog["events"] if row["status"] == "published" and not row["joined"])
    call(student, f"/campus/events/{event['id']}/join", "POST", {"joined":True})
    notification = dashboard["notifications"][0]
    call(student, "/notifications/read", "POST", {"id":notification["id"]})
    save(path, student, marker=marker, note=note["id"], event=event["id"], notification=notification["id"])
    print("Fresh generation seeded; note, participation and notification state written.")


def after_restart(path):
    student, saved = restore(path)
    data = student.dashboard()
    assert any(row["id"] == saved["note"] and row["text"] == saved["marker"] for row in data["items"])
    assert any(row["id"] == saved["notification"] and row["read"] for row in data["notifications"])
    catalog = call(student, "/campus")
    assert any(row["id"] == saved["event"] and row["joined"] for row in catalog["events"])
    isolated = Client("student1")
    clean_dashboard(isolated, "student")
    assert all(row["text"] != saved["marker"] for row in isolated.dashboard()["items"])
    assert any(row["id"] == saved["event"] and not row["joined"] for row in call(isolated, "/campus")["events"])
    path.unlink()
    print("Session, note, participation and read state survived service restart; another visitor stayed clean.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    for name in ("prepare-old", "verify-reset", "before-restart", "after-restart"):
        modes.add_argument("--" + name, type=Path)
    args = parser.parse_args()
    for name, path in vars(args).items():
        if path is not None:
            globals()[name](path)
