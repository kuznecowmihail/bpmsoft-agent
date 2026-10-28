---
name: bpm-crm-query
description: Use when the user asks about records in the running CRM without changing anything, for example «сколько записей в разделе», «сколько контактов в CRM», «покажи записи с таким статусом», «есть ли запись с таким названием», «какое значение у системной настройки».
---

# Данные в CRM: посчитать, найти, показать

Скилл отвечает на вопрос о записях в работающей CRM. Файлы не правятся, план не пишется. Правила стенда — в `AGENTS.md`.

## Чем читать
- `crm_db_query`, если он есть в сессии: SQL только на чтение, таблицы и кавычки — `crm-db.md`. Иначе — `crm_request` (`AGENTS.md`, «Действия на стенде CRM»): видны записи, на которые есть права у пользователя CRM из настроек.
- Сам к БД не подключайся (`psql`, драйверы, строки подключения), `ConnectionStrings.config` не читай.
- Не входи в CRM сам (`AuthService`, cookie, браузер) — вход делает `crm_request`. Браузер — только чтобы посмотреть интерфейс (`browser-check.md`), не для данных.
- Нет ни `crm_db_query`, ни `crm_request` — дай пользователю SQL-запрос готовым текстом (таблицы, колонки и кавычки — `crm-db.md`) и попроси прислать результат.

## Порядок
1. **Объект.** Найди объект раздела: по заголовку `"Caption": "<Название>"` в `BPMSoft.Configuration/Pkg/*/Schemas/*/descriptor.json` или по схеме раздела `<Объект>Section`. Если подходят несколько объектов — назови их и спроси, какой нужен.
2. **Запрос** — сначала SQL через `crm_db_query`, если он есть; иначе OData/DataService через `crm_request` (формы — `integration-api.md`, разделы «OData 4» и «DataService»):
   - количество — `GET /odata/<Объект>/$count`, с условием — `GET /odata/<Объект>/$count?$filter=<Колонка> eq '<значение>'`;
   - записи — `GET /odata/<Объект>?$select=<Колонки>&$filter=<условие>&$top=20`, большой ответ ограничь `maxChars`;
   - если OData отвечает ошибкой — `POST /0/DataService/json/SyncReply/SelectQuery` с телом из `integration-api.md`.
3. **Ответ.** Число или записи, каким запросом получено, и оговорка: это записи, которые видит пользователь CRM из настроек, без фильтров и папок раздела.

Изменяющие запросы (`POST`, `PATCH`, `DELETE` в OData, `InsertQuery`, `UpdateQuery`, `DeleteQuery`) — не в этом скилле: только на тестовых записях и с согласия пользователя (`AGENTS.md`, «Действия на стенде CRM»).

Пути знаний — `.claude/skills/bpm-knowledge/<файл>`.
