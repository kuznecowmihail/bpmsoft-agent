---
name: bpm-web-service
description: Use when the task creates or changes a REST web service description or calls an external service from a business process, for example «вызови внешний API из процесса», «создай веб-сервис», «добавь метод в веб-сервис», «добавь параметр в запрос сервиса».
---

# Веб-сервис BPMSoft и вызов из процесса

Подскилл вызывается из `bpm-develop` (шаг 3, исследование) и при записи веб-сервиса. Порядок работы, план и подтверждение — в `bpm-develop`. Правила стенда — в `CLAUDE.md`.

## Что читать (по порядку)

1. `.claude/skills/bpm-knowledge/metadata-editing.md` — общая механика записи, читай первым.
2. `.claude/skills/bpm-knowledge/web-service.md` — факты: файлы сервиса, коды `IQ`/`IR`/`IT`/`IW`/`IU`, значения перечислений, ресурсы, элемент «Вызвать веб-сервис» и его параметры.
3. `.claude/skills/bpm-knowledge/web-service-edit.md` — рецепты: ✅ сервис, параметры, элемент в процессе, чтение результата, удаление; 🧪 новый метод в существующем сервисе.
4. `.claude/skills/bpm-knowledge/templates/process/web-service.json` и папка `templates/process/web-service-schema/` — шаблоны элемента и сервиса, если в проекте нет своего образца.
5. Для элемента в процессе — подскилл `bpm-process` (чек-лист `process-edit.md`).

## Обязательные правила

- Если в проекте есть свой сервис, сверь с ним структуру; иначе пиши по рецепту `web-service-edit.md`.
- Порядок ключей в `metadata.json` сервиса и элемента — как в `web-service.md`.
- Параметры элемента процесса повторяют параметры метода: `<Код>_In`, `<Код>_Out`, связь через `L17`, плюс `Success`, `Response`, `StatusCode`, `RequestBody`.
- Ключи API и токены не пиши константой в схему сервиса.
- Подписи сервиса, методов и параметров — на `ru-RU` и `en-US`; `ModifiedOnUtc` в `descriptor.json` обновлён (`date +%s000`).
- Удаление сервиса: найди по всему `Pkg` элементы процессов с `IX1` = UId сервиса и предупреди пользователя.

## Обязательные шаги после записи

- Запусти `node .claude/skills/bpm-knowledge/scripts/pkg-lint.js BPMSoft.Configuration/Pkg/<Пакет>/Schemas/<Схема>` для сервиса и для изменённого процесса. Исправь все строки «ОШИБКА» и повтори запуск.
- Перечитай `descriptor.json`, `metadata.json` и ресурсы.

## Что сказать пользователю после записи

Нажать «Обновить из файловой системы». Открыть сервис в конфигурации и у метода нажать «Отправить тестовый запрос». Для процесса — открыть элемент «Вызвать веб-сервис» в Designer и проверить метод и параметры, затем запустить процесс и посмотреть результат (`Success`, `StatusCode`, `Response`).
