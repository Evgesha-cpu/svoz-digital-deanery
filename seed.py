from datetime import datetime, timedelta, timezone

MOSCOW = timezone(timedelta(hours=3))
DEMO_PASSWORD = "SvozDemo2026!"

SERVICES = [
    {"type": "study", "title": "Справка об обучении", "description": "Подтверждает, что вы учитесь в СВОЗ."},
    {"type": "transcript", "title": "Справка об успеваемости", "description": "Содержит оценки и зачёты за учебный период."},
    {"type": "application", "title": "Заявление", "description": "Подайте заявление на имя деканата."},
    {"type": "question", "title": "Вопрос в деканат", "description": "Уточните учебный или организационный вопрос."},
]
STATUSES = ("Отправлена", "В работе", "Нужна информация", "Готова", "Отклонена")
KNOWLEDGE = (
    "СВОЗ — вымышленное учебное заведение. В разделе «Заявки» доступны справка об обучении, "
    "справка об успеваемости, заявление и вопрос в деканат. Справки обычно готовятся "
    "за три учебных дня по демонстрационному регламенту. Сотрудник сообщает о готовности в заявке. "
    "Для уточнения или дополнения заявки студент отвечает в её переписке. "
    "По учебным срокам ориентируйтесь на конкретные даты во вкладке «Учёба»."
)


def now():
    return datetime.now(MOSCOW)


def timestamp():
    return now().isoformat(timespec="seconds")


def seed(db, hash_password):
    with db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
        day = now().date()
        date = lambda offset: (day + timedelta(days=offset)).isoformat()
        created = timestamp()
        accounts = [
            (1, "student1", "student", "Алина Тестовая", "Факультет цифровых сред", "Цифровой дизайн", 2, "ЦД-21"),
            (2, "student2", "student", "Марк Демонстрационный", "Факультет прикладных систем", "Аналитика данных", 1, "АД-11"),
            (3, "dean", "staff", "Оператор СВОЗ", "Деканат СВОЗ", "Обработка обращений", None, None),
        ]
        for account_id, login, role, name, faculty, program, year, group in accounts:
            db.execute(
                'INSERT INTO users(id,login,password,role,name,faculty,program,year,"group") VALUES (?,?,?,?,?,?,?,?,?)',
                (account_id, login, hash_password(DEMO_PASSWORD), role, name, faculty, program, year, group),
            )
        student_lessons = [
            (0, "09:00", "10:30", "История визуальной культуры", "Ника Светлина", "Б-214", "Лекция"),
            (0, "10:45", "12:15", "Проектирование интерфейсов", "Яна Контурова", "А-304", "Практика"),
            (0, "13:00", "14:30", "Типографика", "Тим Остролистов", "В-412", "Семинар"),
            (1, "10:45", "12:15", "Визуальные исследования", "Ника Светлина", "Б-214", "Лекция"),
            (2, "09:00", "10:30", "Проектирование интерфейсов", "Яна Контурова", "А-304", "Практика"),
            (3, "13:00", "14:30", "Типографика", "Тим Остролистов", "В-412", "Практика"),
            (4, "10:45", "12:15", "Цифровые прототипы", "Глеб Макетов", "А-108", "Семинар"),
            (5, "09:00", "10:30", "Визуальные исследования", "Ника Светлина", "Б-214", "Практика"),
            (6, "13:00", "14:30", "Типографика", "Тим Остролистов", "В-412", "Семинар"),
            (-1, "13:00", "14:30", "Проектирование интерфейсов", "Яна Контурова", "А-303", "Практика"),
        ]
        other_lessons = [
            (0, "10:45", "12:15", "Вычислительные методы", "Олег Квантов", "Д-201", "Лекция"),
            (0, "13:00", "14:30", "Основы статистики", "Лика Разбросова", "Д-314", "Практика"),
            (1, "09:00", "10:30", "Модели и данные", "Саша Табличный", "Д-204", "Семинар"),
            (3, "13:00", "14:30", "Вычислительные методы", "Олег Квантов", "Д-201", "Практика"),
            (5, "10:45", "12:15", "Основы статистики", "Лика Разбросова", "Д-314", "Лекция"),
        ]
        for owner, lessons in [(1, student_lessons), (2, other_lessons)]:
            for offset, start, end, subject, teacher, room, kind in lessons:
                changed = owner == 1 and start == "10:45" and offset == 0
                db.execute(
                    """INSERT INTO lessons(user_id,date,start,end,subject,teacher,room,kind,old_date,old_start,old_room,changed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (owner, date(offset), start, end, subject, teacher, room, kind, date(offset) if changed else None,
                     start if changed else None, "Б-217" if changed else None, created if changed else None),
                )
        db.executemany("INSERT INTO grades(user_id,subject,grade,kind,status,due) VALUES (?,?,?,?,?,?)", [
            (1, "История визуальной культуры", "5", "Зачёт", "Зачтено", None),
            (1, "Проектирование интерфейсов", "4", "Практика", "Оценено", None),
            (1, "Типографика", None, "Контрольная", "Предстоит", date(2)),
            (1, "Визуальные исследования", None, "Курсовая работа", "Нужно сдать", date(3)),
            (1, "Цифровые прототипы", None, "Экзамен", "Предстоит", date(7)),
            (2, "Основы статистики", "5", "Зачёт", "Зачтено", None),
            (2, "Вычислительные методы", None, "Экзамен", "Предстоит", date(7)),
            (2, "Модели и данные", "4", "Практика", "Оценено", None),
        ])
        db.executemany("INSERT INTO items(user_id,kind,text,lesson_id,subject,due) VALUES (?,?,?,?,?,?)", [
            (1, "task", "Подготовить презентацию", 2, "Проектирование интерфейсов", date(1)),
            (1, "note", "Собрать примеры удачной навигации для проекта", 10, "Проектирование интерфейсов", None),
            (2, "note", "Проверить гипотезу для учебного проекта", None, "Основы статистики", None),
        ])
        db.executemany(
            "INSERT INTO requests(user_id,assigned_to,type,subject,body,status,created_at,updated_at) VALUES (?,3,?,?,?,?,?,?)",
            [(1, "study", "Справка об обучении", "Подготовьте, пожалуйста, справку для участия в студенческой программе.", "В работе", created, created),
             (2, "question", "Электронная справка", "В каком формате можно получить справку?", "Готова", created, created)],
        )
        db.executemany("INSERT INTO history(request_id,status,body,created_at) VALUES (?,?,?,?)", [
            (1, "Отправлена", "Заявка принята", created), (1, "В работе", "Сотрудник начал обработку", created),
            (2, "Отправлена", "Заявка принята", created), (2, "Готова", "Вопрос рассмотрен", created),
        ])
        db.execute("INSERT INTO messages(request_id,author_id,body,created_at) VALUES (2,3,?,?)",
                   ("В демонстрационном деканате электронную справку можно запросить в разделе «Заявки».", created))
        db.executemany(
            "INSERT INTO notifications(user_id,kind,title,body,lesson_id,request_id,created_at) VALUES (?,?,?,?,?,?,?)",
            [(1, "schedule", "Изменилась аудитория", "Проектирование интерфейсов · Б-217 → А-304", 2, None, created),
             (1, "deadline", "Скоро контрольная", "Контрольная по типографике", 3, None, created),
             (1, "request", "Заявка в работе", "Деканат начал готовить справку об обучении.", None, 1, created),
             (1, "news", "Неделя студенческих проектов", "Запись на разбор портфолио открыта до конца недели.", None, None, created),
             (2, "request", "Вопрос рассмотрен", "Деканат ответил на ваше обращение.", None, 2, created),
             (2, "news", "Неделя студенческих проектов", "Запись на разбор портфолио открыта до конца недели.", None, None, created)],
        )
