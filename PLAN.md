# BPMSoft AI Agent — план и контекст проекта

Сокращено 06.10.2026. Полная прежняя версия (исследование, Designer Service API, milestones 1–9) — в архиве `~/Documents/bpmsoft-test-backups/bpmsoft-agent_before_cleanup_2026-10-06.tar.gz`.

## 1. Что за продукт
Desktop-приложение (Electron) — ИИ-агент для разработки BPMSoft-проектов (низкокодовая CRM/BPM-платформа, родственная Creatio). Пользователь открывает локальную папку приложения BPMSoft и ставит задачу в чате; агент уточняет пакет и требования, составляет план и после подтверждения реализует его правками файлов в `BPMSoft.Configuration/Pkg`. Проверку делает пользователь в CRM: «Обновить из файловой системы», при необходимости компиляция.

## 2. Направление
- Источник понимания metadata — файлы проекта и база знаний `packages/agent-runtime/knowledge/*.md`: факты `<тип>.md` и рецепты `<тип>-edit.md`, статусы — в `metadata-editing.md`. Рецепт становится ✅ после подтверждения реальной записью в CRM.
- Живой инстанс не используется. Designer Service API и MCP-инструменты `bpm_*` удалены 06.10.2026: in-process MCP-серверы SDK не были видны модели, а направление сменилось на работу с файлами.

## 3. Архитектура
- Стек: Electron + React + TypeScript + Node; агент — Claude Agent SDK (`query()`).
- Монорепо (npm workspaces):
```
packages/
  metadata-core/   # определение структуры приложения BPMSoft (resolveAppLayout)
  agent-runtime/   # запуск агента: системный промпт, база знаний, песочница, события SDK
apps/
  desktop/         # Electron: выбор проекта, чат, разрешения, логи чата
```
- `agent-runtime`:
  - `provider/systemPrompt.ts` — системный промпт и индекс файлов знаний;
  - `provider/anthropicProvider.ts` — `runBpmsoftAgentQuery`: продолжение диалога (`resume`), изоляция от настроек `~/.claude` (`settingSources: []`, `skills: []`), PreToolUse-хук песочницы, `canUseTool` с автоодобрением чтения;
  - `safety/sandboxGuard.ts` — читать можно только папку приложения и каталог знаний, писать — только в `Pkg`;
  - `provider/messageMapper.ts` — сообщения SDK → `AgentEvent`.
- `apps/desktop`:
  - API-ключ Anthropic — в `safeStorage` (`secureStore.ts`);
  - `agentSession.ts` — ход агента, сессия чата, запросы разрешений;
  - `chatLog.ts` — логи чата в `~/Library/Logs/bpmsoft-agent/`: `chats/<дата>/<время>.jsonl` (трассировка) и `.md` (история), входящие наблюдения — `knowledge-notes.md`;
  - рендерер: `App.tsx`, `chatFormat.ts` (понятные описания действий агента, скрытие служебных событий).

## 4. Как ведётся работа
- Знания пополняются по результатам проверок в CRM (правила — в `CLAUDE.md`).
- Тестирование агента в приложении — задачи из `tasks_for_test.md`. В конце задачи агент пишет блок «Наблюдения для базы знаний», приложение собирает такие блоки в `knowledge-notes.md`, разработчик сверяет их с файлами и переносит в знания.

## 5. Дальше
- Прогон задач из `tasks_for_test.md`.
- Задание планировщика (Quartz) — отложено.
- Упаковка (electron-builder + CLI-бинарник Claude Agent SDK) — не начата.
