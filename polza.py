import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

URL = "https://polza.ai/api/v1/chat/completions"
MODEL = "deepseek/deepseek-v4.1-flash"
ROOT = Path(__file__).resolve().parent
RULES = [
    {"id":"certificates","title":"Справки","rule":"Справки об обучении и успеваемости заказываются в разделе «Заявки». Обычный срок в вымышленном СВОЗ — три учебных дня."},
    {"id":"processing","title":"Статусы и получение","rule":"Готовность сообщает сотрудник в карточке заявки. Доступный способ получения уточняется в переписке."},
    {"id":"required","title":"Сведения в обращении","rule":"Укажите вид справки, цель и желаемый срок. Запрашивать паспортные данные в конкурсном кабинете не требуется."},
    {"id":"session","title":"Сроки и сессия","rule":"Даты сдачи и экзаменов указаны в разделе «Учёба». Если даты нет, её нужно уточнить у деканата или преподавателя."},
    {"id":"changes","title":"Переносы занятий","rule":"Актуальные время и аудитория отображаются в расписании. Сравнение с прежними данными находится в карточке занятия."},
]
MODES = {
    "reply": "Напиши короткий вежливый черновик ответа студенту. Не утверждай, что заявка обработана или справка готова без подтверждения в данных.",
    "summary": "Кратко перечисли суть обращения, что уже уточнили и что остаётся открытым. Не предлагай административное решение.",
    "missing": "По правилам укажи, каких уточнений не хватает. Не запрашивай паспорт или реальные персональные данные.",
    "rules": "Подбери подходящие правила и укажи их заголовки. Если правила нет, сообщи об этом.",
}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def local_key():
    if "POLZA_API_KEY" in os.environ:
        return os.environ["POLZA_API_KEY"].strip()
    path = ROOT / ".env"
    if not path.is_file():
        return ""
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "POLZA_API_KEY":
            value = value.strip()
            return value[1:-1] if len(value) > 1 and value[0] in {"'", '"'} and value[-1] == value[0] else value
    return ""


def accounting(result):
    raw = result.get("usage")
    if not isinstance(raw, dict):
        return {}
    usage = {key: raw[key] for key in ("prompt_tokens", "completion_tokens", "total_tokens")
             if type(raw.get(key)) is int and raw[key] >= 0}
    for key in ("cost_rub", "cost"):
        if type(raw.get(key)) in (int, float) and 0 <= raw[key] < 1000000:
            usage[key] = raw[key]
    if raw.get("currency") in ("RUB", "USD"):
        usage["currency"] = raw["currency"]
    return usage


def invoke(config, payload):
    url, key, _ = config
    request = Request(url, data=json.dumps(payload, ensure_ascii=False).encode(),
                      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    with build_opener(NoRedirect()).open(request, timeout=25) as response:
        data = response.read(131073)
    if len(data) > 131072:
        raise ValueError("Provider response exceeds limit")
    return json.loads(data)


def complete(config, system, message):
    url, _, model = config
    payload = {"model": model, "messages": [{"role":"system","content":system},
               {"role":"user","content":message}], "max_tokens": 1500, "temperature": 0.2}
    if url == URL:
        payload["tool_choice"] = "required"
        payload["reasoning"] = {"effort": "none"}
        payload["tools"] = [{"type":"function","function":{"name":"present_result",
            "description":"Publish the answer and optionally propose a single action for user review without executing it.",
            "parameters":{"type":"object","properties":{"answer":{"type":"string"},
                "proposal":{"type":["object","null"],"description":"Optional action matching the system instructions",
                    "properties":{"kind":{"type":"string","enum":["note","task","request","message"]},
                        "text":{"type":"string"},"subject":{"type":"string"},"lesson_id":{"type":"integer"},
                        "due":{"type":"string"},"type":{"type":"string"},"title":{"type":"string"},
                        "request_id":{"type":"integer"}}},
                "sources":{"type":"array","items":{"type":"object","properties":{"kind":{"type":"string"},"id":{"type":"integer"}}}}},
                "required":["answer"]}}}]
    try:
        result = invoke(config, payload)
    except HTTPError as error:
        if error.code not in (400, 422) or "tools" not in payload:
            raise
        del payload["tools"]
        del payload["tool_choice"]
        result = invoke(config, payload)
    choice = result["choices"][0]
    if choice.get("finish_reason") == "length":
        raise ValueError("Provider truncated the answer")
    output = choice["message"]
    calls = output.get("tool_calls") or []
    if calls:
        if len(calls) != 1 or calls[0]["function"]["name"] != "present_result":
            raise ValueError("Unexpected tool calls")
        generated = json.loads(calls[0]["function"]["arguments"])
        transport = "tool"
    else:
        content = output["content"].strip()
        if content.startswith("```json") and content.endswith("```"):
            content = content[7:-3].strip()
        generated = json.loads(content)
        transport = "json"
    if not isinstance(generated, dict):
        raise ValueError("Invalid result")
    return {**generated, "usage": accounting(result), "transport": transport}
