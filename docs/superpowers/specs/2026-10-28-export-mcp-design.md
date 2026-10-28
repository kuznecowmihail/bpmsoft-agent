# Экспорт для Claude Code и Cursor через MCP-сервер

Дата: 2026-10-28. Статус: дизайн утверждён.

## Зачем

Экспорт (скиллы, знания, `AGENTS.md`) уже позволяет работать с BPMSoft в Claude Code и Cursor по подписке пользователя, без нашего токена. Действия на стенде идут через скрипт `crm.js`. Две проблемы:

1. Запроса к БД в экспорте нет: агент отдаёт SQL пользователю и ждёт результат.
2. Пароль CRM лежит в `env` файла `.claude/settings.local.json`. Claude Code передаёт его в окружение сессии, агент может прочитать его `printenv`; в Cursor — прочитать файл. Удерживает только запрет в тексте.

Решение: MCP-сервер `bpmsoft` в стенде с инструментами CRM и БД под теми же именами, что в desktop-приложении. `crm.js` убираем.

## Что не меняется

Агент desktop-приложения: `systemPrompt.ts`, провайдеры, встроенные инструменты, эвалы. В desktop меняется только установка скиллов.

## MCP-сервер `bpmsoft`

Бандл `bpmsoft-mcp.js` (esbuild, как сейчас `crm.js`), stdio, `@modelcontextprotocol/sdk`. Кладётся в стенд в `.claude/skills/bpm-knowledge/scripts/bpmsoft-mcp.js`, каталог знаний — его родительская папка (нужен pkg-lint).

Корень стенда: аргумент `--root <папка>`, иначе `CLAUDE_PROJECT_DIR`, иначе текущая папка. Установка всегда пишет `--root` абсолютным путём.

Инструменты:

| Имя | Когда есть | Что делает |
|---|---|---|
| `crm_update_from_fs` | настроена CRM | pkg-lint по изменённым в git схемам, при ошибках — стоп; затем «Обновить из файловой системы» |
| `crm_compile` | настроена CRM | `update` (как выше), при его ошибке компиляция не запускается; затем компиляция и перезапуск с ожиданием |
| `crm_restart` | настроена CRM | перезапуск и ожидание запуска |
| `crm_request` | настроена CRM | REST-запрос `GET`/`POST` к стенду с входом и `BPMCSRF`; параметры `method`, `path`, `body` (JSON-строка, только для POST), `maxChars` (по умолчанию 4000) |
| `crm_browser_login` | настроена CRM | открывает на 127.0.0.1 одноразовую выдачу пароля странице CRM (как `crm.js browser-login`), сразу возвращает адрес страницы входа, фрагмент JS и порядок действий; выдача живёт до 120 с или до следующего вызова |
| `crm_db_query` | доступ к БД включён | `crmDbTool` с `sqlGuard`: только чтение; строку подключения читает из `ConnectionStrings.config` стенда с переопределением из файла доступов |

Логика действий — та же, что в `crm.js` и desktop (`createCrmTools`, `restartCrm`, `CrmSession`, `formatCrmResponse`, `isStandPath`). Её выносим из `crmCli.ts` в модуль `standActions.ts` без разбора аргументов командной строки.

Сервер ничего не пишет в stdout, кроме протокола MCP. Подтверждений внутри сервера нет: их дают разрешения Claude Code и Cursor.

## Доступы

Файл `.claude/bpmsoft-agent.local.json` в стенде, читает только сервер:

```json
{
  "version": 1,
  "crm": { "url": "http://...", "user": "...", "password": "..." },
  "db": { "host": "...", "port": 5432, "user": "...", "password": "..." }
}
```

`crm` — есть, если в desktop заданы адрес, пользователь и пароль CRM. `db` — есть, если в desktop включён доступ к БД; поля внутри — переопределения, пустой объект значит «как в `ConnectionStrings.config`». Сервер читает файл при запуске.

## Регистрация в стенде (установка скиллов)

Если есть `crm` или `db`:

- пишется файл доступов;
- `.mcp.json` (Claude Code) и `.cursor/mcp.json` (Cursor): `mcpServers.bpmsoft = { "command": "node", "args": ["<абс. путь к bpmsoft-mcp.js>", "--root", "<абс. путь к стенду>"] }`;
- `.claude/settings.local.json`: `enabledMcpjsonServers` содержит `bpmsoft`; `permissions.allow` содержит `mcp__bpmsoft__crm_db_query`, `mcp__bpmsoft__crm_update_from_fs`, `mcp__bpmsoft__crm_browser_login`. `crm_compile`, `crm_restart`, `crm_request` остаются с подтверждением.

Если нет ни того ни другого — всё это убирается: файл доступов удаляется, запись `bpmsoft` и наши разрешения удаляются, чужое остаётся.

Всегда: из `env` в `settings.local.json` удаляются `BPMSOFT_CRM_URL`, `BPMSOFT_CRM_USER`, `BPMSOFT_CRM_PASSWORD` (миграция со старой установки); пустой `env` удаляется.

Чужие ключи во всех JSON-файлах сохраняются. Файл, который не разбирается как JSON-объект, не трогаем и сообщаем о нём. BOM и CRLF исходного файла сохраняются при записи. Старый `crm.js` удаляет из стенда существующая уборка по манифесту.

Результат установки: `integration: { state: "registered" | "removed"; invalid: string[] }` вместо `crmEnv`.

## Тексты экспорта

`AGENTS.md` и скиллы (`bpm-browser-check`, `bpm-crm-query`, `bpm-develop`, `bpm-explain`, `bpm-troubleshoot`) переходят с `crm.js` на MCP-инструменты. Таблица «имя из знаний → команда» для CRM-инструментов исчезает: имена совпадают. Если инструмента нет в сессии — доступ не настроен или сервер не включён: агент просит пользователя сделать действие самому (а для данных — даёт SQL). `bpm-crm-query`: при наличии `crm_db_query` — запрос к БД, иначе `crm_request`. `pkg-lint.js` остаётся скриптом. В текстах экспорта не должно остаться `crm.js` — проверяет `claudeExportTexts.test.ts`.

## Desktop

Обработчик `claudeSkills:install` передаёт `crm` (как сейчас) и `db` (новое: переопределения из настроек проекта и пароль из хранилища, только если включён доступ к БД). Сообщение после установки в `SettingsMenu.tsx` — по `integration`.

## Проверка

Unit (vitest):
- `standActions`: перенос тестов `crmCli.test.ts` (request, truncation, ошибки HTTP, browser-login, compile после update).
- `standConfig`: разбор файла, отсутствие файла, BOM, неверный JSON.
- MCP-сервер через in-memory транспорт: набор инструментов при разных конфигурациях, вызов `crm_request` с fake fetch, `crm_db_query` с fake клиентом.
- Установка: регистрация и удаление, сохранение чужих ключей, BOM и CRLF, неверный JSON, удаление старых переменных.
- Тексты: нет `crm.js`.

Руками (Claude Code и Cursor, macOS и Windows): сервер виден и включён; update, compile, request, browser-login, запрос к БД; пароль не виден в `printenv`. Отдельно: хватает ли тайм-аута MCP в Cursor на `crm_compile` (в Claude Code по умолчанию около 28 часов) и одобряется ли сервер через `enabledMcpjsonServers` в `settings.local.json` без вопроса. Если тайм-аута Cursor не хватает — следующей задачей разбить компиляцию на запуск и опрос статуса.

## Риски

- Cursor может требовать включить сервер в настройках вручную — тогда это строка в сообщении после установки.
- `node` должен быть в PATH (как сейчас для `crm.js` и `pkg-lint.js`).
- Файл доступов на диске открытым текстом; защита — то, что он не в окружении сессии и агенту запрещено его читать.
