import re
from datetime import datetime, timedelta

from seed import MOSCOW, now, timestamp

CATEGORIES = {"party", "culture", "sport", "education", "volunteering", "other"}
SCHEMA_VERSION = 1
VISIBILITY = "(e.was_published=1 OR e.author_id=?)"
EDITABLE = ("title", "description", "category", "starts_at", "ends_at", "location", "organizer", "club_id")


class CampusError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def initialize(db):
    with db:
        db.execute("BEGIN IMMEDIATE")
        notification_columns = {row["name"] for row in db.execute("PRAGMA table_info(notifications)")}
        if "event_id" not in notification_columns:
            db.execute("ALTER TABLE notifications ADD COLUMN event_id REFERENCES campus_events(id)")
        db.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        if db.execute("SELECT 1 FROM campus_seed").fetchone():
            return
        employee = db.execute("SELECT id FROM users WHERE role='staff' ORDER BY id LIMIT 1").fetchone()
        if employee is None:
            return
        clubs = (
            ("Киноклуб СВОЗ", "Смотрим и обсуждаем кино. Собираемся дважды в месяц в медиазале."),
            ("Беговой клуб", "Утренние пробежки в комфортном темпе и совместные старты."),
            ("Волонтёры СВОЗ", "Помогаем с открытыми событиями и городскими инициативами."),
        )
        club_ids = [db.execute("INSERT INTO campus_clubs(name,description) VALUES (?,?)", club).lastrowid for club in clubs]
        date = now()
        examples = (
            (1, 17, 30, "Киновечер в медиазале", "Смотрим короткометражки студентов, затем обсуждаем их с авторами.", "culture", "Медиазал В-102", club_ids[0]),
            (2, 8, 30, "Открытая тренировка", "Лёгкая пробежка вокруг кампуса. Подходит для любого темпа.", "sport", "Вход в корпус Д", club_ids[1]),
            (3, 16, 0, "Мастерская студенческих проектов", "Приносите прототип, чтобы обсудить его с ребятами с других факультетов.", "education", "Мастерская А-108", None),
            (4, 18, 0, "Вечер настольных игр", "Начнём с игр для знакомства. Можно принести свою игру или присоединиться к столу.", "party", "Гостиная кампуса", None),
            (5, 15, 0, "Уборка сквера у кампуса", "Волонтёрская команда выдаст перчатки и инвентарь. Сбор у центрального входа.", "volunteering", "У сквера СВОЗ", club_ids[2]),
            (6, 12, 0, "Экскурсия по кампусу", "Старшекурсники покажут библиотеку, студенческие пространства и учебные корпуса.", "other", "Главный вход", None),
        )
        first_event_id = None
        for days, hour, minute, title, description, category, location, club_id in examples:
            starts = date.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days)
            cur = db.execute("""INSERT INTO campus_events(author_id,title,description,category,starts_at,ends_at,
                             location,organizer,club_id,status,was_published,created_at,updated_at)
                             VALUES (?,?,?,?,?,?,?,?,?,'published',1,?,?)""",
                             (employee["id"], title, description, category, stamp(starts), stamp(starts + timedelta(hours=1)),
                              location, club_name(db, club_id) or "Студенческий совет СВОЗ", club_id, timestamp(), timestamp()))
            first_event_id = first_event_id or cur.lastrowid
        participants = {row["login"]: row["id"] for row in db.execute(
            "SELECT id,login FROM users WHERE role='student' AND login IN ('student1','student2')")}
        if "student1" in participants:
            starts = date.replace(hour=18, minute=30, second=0, microsecond=0) + timedelta(days=2)
            db.execute("""INSERT INTO campus_events(author_id,title,description,category,starts_at,ends_at,
                       location,organizer,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'pending',?,?)""",
                       (participants["student1"], "Обмен книгами", "Предлагаю принести по одной книге и обменяться рекомендациями.",
                        "culture", stamp(starts), stamp(starts + timedelta(hours=1)), "Гостиная кампуса",
                        "Студенческая инициатива", timestamp(), timestamp()))
        if "student2" in participants:
            db.execute("INSERT INTO campus_registrations(event_id,user_id,created_at) VALUES (?,?,?)",
                       (first_event_id, participants["student2"], timestamp()))
        db.execute("INSERT INTO campus_seed(id) VALUES (1)")


def stamp(value):
    return value.astimezone(MOSCOW).isoformat(timespec="seconds")


def event_time(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,6})?)?(?:Z|[+-][0-9]{2}:[0-9]{2})?", value
    ):
        raise CampusError(400, "Укажите дату и время события.")
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.astimezone(MOSCOW) if parsed.tzinfo else parsed.replace(tzinfo=MOSCOW)
    except (ValueError, OverflowError) as exc:
        raise CampusError(400, "Укажите корректную дату и время.") from exc


def text(value, label, limit, optional=False):
    if optional and value in ("", None):
        return ""
    if (not isinstance(value, str) or not value.strip() or len(value) > limit
            or re.search(r"[\ud800-\udfff\x00]", value)):
        raise CampusError(400, f"Проверьте поле «{label}».")
    return value.strip()


def club_name(db, club_id):
    if club_id is None:
        return None
    if type(club_id) is not int or not 0 < club_id <= 2**63 - 1:
        raise CampusError(400, "Проверьте выбранное сообщество.")
    row = db.execute("SELECT name FROM campus_clubs WHERE id=?", (club_id,)).fetchone()
    if row is None:
        raise CampusError(404, "Сообщество не найдено.")
    return row["name"]


def event_input(db, payload, current=None):
    prior = current or {}
    values = {key: payload.get(key, prior.get(key)) for key in EDITABLE}
    title = text(values["title"], "Название", 120)
    description = text(values["description"], "Описание", 1200)
    category = text(values["category"], "Категория", 20)
    if category not in CATEGORIES:
        raise CampusError(400, "Выберите категорию события.")
    location = text(values["location"], "Место", 150)
    start = event_time(values["starts_at"])
    try:
        if "starts_at" in payload and "ends_at" not in payload and current:
            duration = event_time(current["ends_at"]) - event_time(current["starts_at"])
            end = start + duration
        else:
            end = event_time(values["ends_at"]) if values["ends_at"] not in (None, "") else start + timedelta(hours=1)
    except OverflowError as exc:
        raise CampusError(400, "Укажите корректное время окончания события.") from exc
    if end <= start or end - start > timedelta(days=7):
        raise CampusError(400, "Конец должен быть позже начала. Максимальная длительность события — семь дней.")
    club_id = None if values["club_id"] == "" else values["club_id"]
    default_organizer = club_name(db, club_id) or "Сообщество СВОЗ"
    organizer = text(values["organizer"], "Организатор", 120, optional=True) or default_organizer
    return (title, description, category, stamp(start), stamp(end), location, organizer, club_id)


def event_rows(db, user, event_id=None, dashboard=False):
    user_id = user["id"]
    filters, params = [], [user_id, user_id]
    if dashboard:
        filters.extend(["e.status='published'", "e.ends_at>?"])
        params.append(timestamp())
    elif user["role"] != "staff":
        filters.append(VISIBILITY)
        params.append(user_id)
    if event_id is not None:
        filters.append("e.id=?")
        params.append(event_id)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    limit = " LIMIT 3" if dashboard else ""
    records = db.execute("""
        SELECT e.id,e.title,e.description,e.category,e.starts_at,e.ends_at,e.location,e.organizer,e.club_id,
               e.status,EXISTS (SELECT 1 FROM campus_registrations r WHERE r.event_id=e.id AND r.user_id=?) AS joined,
               (SELECT COUNT(*) FROM campus_registrations r WHERE r.event_id=e.id) AS participants,
               (e.author_id=?) AS own
          FROM campus_events e""" + where + " ORDER BY e.starts_at,e.id" + limit, params)
    return [dict(row) for row in records]


def event_detail(db, user, event_id):
    records = event_rows(db, user, event_id=event_id)
    if not records:
        raise CampusError(404, "Событие не найдено.")
    return records[0]


def read(db, user):
    clubs = db.execute("""
        SELECT c.id,c.name,c.description,
               EXISTS (SELECT 1 FROM campus_members m WHERE m.club_id=c.id AND m.user_id=?) AS joined,
               (SELECT COUNT(*) FROM campus_members m WHERE m.club_id=c.id) AS members
          FROM campus_clubs c ORDER BY c.id""", (user["id"],))
    return {"events": event_rows(db, user), "clubs": [dict(row) for row in clubs]}


def recipients(db, query, parameters=()):
    return [row["id"] for row in db.execute(query, parameters)]


def notify(db, event_id, ids, title, body):
    db.executemany("INSERT INTO notifications(user_id,kind,title,body,event_id,created_at) VALUES (?,'campus',?,?,?,?)",
                   [(user_id, title, body, event_id, timestamp()) for user_id in set(ids)])


def create(db, user, payload):
    values = event_input(db, payload)
    if event_time(values[3]) <= now():
        raise CampusError(400, "Выберите будущее время для нового события.")
    status = "draft" if user["role"] == "staff" else "pending"
    created = timestamp()
    cur = db.execute("""INSERT INTO campus_events(author_id,title,description,category,starts_at,ends_at,
                     location,organizer,club_id,status,created_at,updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (user["id"], *values, status, created, created))
    if status == "pending":
        staff = recipients(db, "SELECT id FROM users WHERE role='staff'")
        notify(db, cur.lastrowid, staff, "Новое предложение в кампусе", values[0])
    return {"id": cur.lastrowid, "status": status}


def modify(db, user, event_id, payload):
    if user["role"] != "staff":
        raise CampusError(403, "Управлять событиями может сотрудник деканата.")
    row = db.execute("SELECT * FROM campus_events WHERE id=?", (event_id,)).fetchone()
    if row is None:
        raise CampusError(404, "Событие не найдено.")
    current = dict(row)
    previous_status = current["status"]
    status = payload.get("status", previous_status)
    transitions = {"draft": {"published", "cancelled"}, "pending": {"published", "rejected"},
                   "published": {"cancelled"}, "cancelled": set(), "rejected": set()}
    changes = set(payload) & set(EDITABLE)
    if not isinstance(status, str) or (status != previous_status and status not in transitions[previous_status]):
        raise CampusError(409, "Из текущего состояния нельзя перейти к выбранному статусу.")
    if changes and previous_status in {"cancelled", "rejected"}:
        raise CampusError(409, "Закрытое событие нельзя редактировать.")
    values = event_input(db, payload, current) if changes else tuple(current[key] for key in EDITABLE)
    if status == "published" and (status != previous_status or values[3] != current["starts_at"]) and event_time(values[3]) <= now():
        raise CampusError(400, "Опубликовать можно только предстоящее событие.")
    if status == previous_status and values == tuple(current[key] for key in EDITABLE):
        return {"id": event_id, "status": status}
    db.execute("""UPDATE campus_events SET title=?,description=?,category=?,starts_at=?,ends_at=?,location=?,
               organizer=?,club_id=?,status=?,was_published=?,updated_at=? WHERE id=?""",
               (*values, status, bool(current["was_published"]) or status == "published", timestamp(), event_id))
    participants = recipients(db, "SELECT user_id AS id FROM campus_registrations WHERE event_id=?", (event_id,))
    if status != previous_status:
        if status == "published":
            students = recipients(db, "SELECT id FROM users WHERE role='student'")
            notify(db, event_id, students, "Новое событие в кампусе", values[0])
        elif status == "cancelled":
            notify(db, event_id, [*participants, current["author_id"]], "Событие отменено", values[0])
        elif status == "rejected":
            notify(db, event_id, [current["author_id"]], "Предложение кампусу отклонено", values[0])
    elif status == "published":
        notify(db, event_id, participants, "Событие обновлено", values[0])
    return {"id": event_id, "status": status}


def join_event(db, user, event_id, joined):
    record = event_detail(db, user, event_id)
    if user["role"] != "student":
        raise CampusError(403, "Запись на событие доступна студентам.")
    if joined and (record["status"] != "published" or event_time(record["starts_at"]) <= now()):
        raise CampusError(409, "Запись на это событие закрыта.")
    return update_membership(db, "campus_registrations", "event_id", event_id, user["id"], joined)


def join_club(db, user, club_id, joined):
    if user["role"] != "student":
        raise CampusError(403, "В сообщества могут вступать студенты.")
    club_name(db, club_id)
    return update_membership(db, "campus_members", "club_id", club_id, user["id"], joined)


def update_membership(db, table, foreign_key, record_id, user_id, joined):
    if joined:
        db.execute(f"INSERT OR IGNORE INTO {table}({foreign_key},user_id,created_at) VALUES (?,?,?)",
                   (record_id, user_id, timestamp()))
    else:
        db.execute(f"DELETE FROM {table} WHERE {foreign_key}=? AND user_id=?", (record_id, user_id))
    return {"id": record_id, "joined": joined}
