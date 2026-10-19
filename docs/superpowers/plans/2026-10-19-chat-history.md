# История чатов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** панель чатов слева в desktop-приложении: открыть прежний чат текущего стенда и продолжить его с полным контекстом агента после перезапуска.

**Architecture:** контекст модели — через `resume` провайдера (`sessionId` из лога); лента — разбор `.jsonl` лога чата; список — индекс `chats/index.json` в папке логов. Main-процесс решает, можно ли продолжить чат и как переключить настройки (чистая функция `planChatOpen`), восстанавливает состояние `agentSession.ts` и дописывает тот же лог. Renderer показывает `ChatSidebar` и строит ленту теми же функциями, что живой чат.

**Tech Stack:** Electron 44 + electron-vite, React 19, TypeScript, vitest (`apps/desktop`).

**Spec:** `docs/superpowers/specs/2026-10-19-chat-history-design.md`

## Global Constraints

- Только кроссплатформенный код: пути через `path.join`, без `/` в строках путей, без `~`/`$HOME`; id чата — не путь, а ключ (см. Task 2).
- Тексты интерфейса — на русском.
- Чтение лога переживает битую/недописанную последнюю строку `.jsonl` и не падает на неизвестных `kind`.
- Открытие чата ничего не трогает на стенде: ни вызова агента, ни CRM, ни БД до сообщения пользователя.
- Пока идёт ход (`isRunning`), переключать чаты и создавать новый нельзя.
- В панели — только чаты текущего стенда: `projectPath` чата === `validation.pkgRoot`.
- Тесты: `npm test -w @bpmsoft-agent/desktop`; типы: `npm run typecheck -w @bpmsoft-agent/desktop`.

## Review Focus

- Последняя строка `.jsonl` оборвана при падении приложения → чат открывается, оборванная строка пропущена (Task 1).
- `.jsonl` из индекса удалён пользователем → чат исчезает из списка, приложение не падает (Task 2).
- Пользователь открыл старый чат и сразу отправил сообщение → запись идёт в тот же `.jsonl`, а не в новый файл; `ownSchemas`/`pkg_lint` считают от начала старого чата (Task 3).
- Провайдер при `resume` вернул другой `sessionId` → ошибка «Контекст чата не восстановлен…», чат помечен `contextLost`, дальше только чтение (Task 3, Task 4).
- Открыт чат Cursor, а ключ Cursor не задан → настройки не переключаются, чат только для чтения с причиной (Task 4).

---

### Task 1: Разбор лога чата в ленту и метаданные

**Files:**
- Create: `apps/desktop/src/main/chatReplay.ts`
- Modify: `apps/desktop/src/shared/types.ts` (новые типы)
- Test: `apps/desktop/test/chatReplay.test.ts`

**Interfaces:**
- Produces (в `shared/types.ts`):
  - `type ChatReplayItem = { kind: 'user'; ts: string; text: string } | { kind: 'agent'; ts: string; event: AgentEvent }` (`AgentEvent` — `import type` из `@bpmsoft-agent/agent-runtime`)
  - `interface ChatModelRef { id: string | null; effort?: string | null; params?: CursorModelParam[] }`
  - `interface ParsedChatLog { projectPath: string | null; readRoot: string | null; startedAt: string | null; title: string; provider: AgentProvider | null; model: ChatModelRef | null; sessionId: string | null; lastTurnInterrupted: boolean; lastTurnStopped: boolean; updatedAt: string | null; items: ChatReplayItem[] }`
- Produces (в `chatReplay.ts`): `parseChatLog(text: string): ParsedChatLog`, `chatTitle(text: string): string`.

Правила разбора:
- строки делятся по `/\r?\n/`; пустые и невалидный JSON пропускаются;
- `chat_start` → `projectPath`, `readRoot`, `startedAt = ts`;
- `user_message` → item `user`, `provider`, `model` (последние), `updatedAt`; первое сообщение даёт `title = chatTitle(text)`;
- `agent_event` → item `agent`; `event.sessionId` у `system_init`/`result` обновляет `sessionId`;
- `turn_end` → `sessionId` (если не null), `lastTurnStopped = stopped`, `updatedAt`;
- `lastTurnInterrupted = true`, если после последнего `user_message` нет `turn_end`;
- `chatTitle`: первая непустая строка, пробелы схлопнуты, до 80 символов + `…`; пустой текст → `'Без названия'`.

- [ ] **Step 1: Write the failing tests** — в `chatReplay.test.ts` собрать `.jsonl` из записей вида реального лога (`chat_start`, `user_message`, `agent_event` с `system_init` и `text`, `turn_end`):
  - `parses items in order` — `items.map(i => i.kind)` равно `['user','agent','agent']`, текст первого — исходное сообщение;
  - `takes session id from system_init and turn_end` — `sessionId === 'sid-1'`;
  - `skips a truncated last line` — к тексту добавлен `'{"ts":"x","kind":"agent_ev'`, результат тот же, без исключения;
  - `marks interrupted turn` — лог без `turn_end` после последнего `user_message` → `lastTurnInterrupted === true`; с `turn_end` → `false`;
  - `marks stopped turn` — `turn_end` со `stopped: true` → `lastTurnStopped === true`;
  - `handles CRLF` — тот же лог с `\r\n` даёт тот же результат;
  - `chatTitle` — `'  опиши\nвсё'` → `'опиши'`; строка из 100 символов → 80 символов + `'…'`; `''` → `'Без названия'`.
- [ ] **Step 2:** `npm test -w @bpmsoft-agent/desktop -- test/chatReplay.test.ts` → FAIL (модуля нет).
- [ ] **Step 3:** реализовать `parseChatLog` и `chatTitle` в `chatReplay.ts`, типы — в `shared/types.ts`.
- [ ] **Step 4:** тот же запуск → PASS; `npm run typecheck -w @bpmsoft-agent/desktop` → без ошибок.
- [ ] **Step 5: Commit** — `git commit -m "feat(desktop): parse chat log into replay items"`

### Task 2: Индекс чатов

**Files:**
- Create: `apps/desktop/src/main/chatIndex.ts`
- Modify: `apps/desktop/src/shared/types.ts`
- Test: `apps/desktop/test/chatIndex.test.ts`

**Interfaces:**
- Consumes: `parseChatLog` (Task 1).
- Produces (в `shared/types.ts`): `interface ChatSummary { id: string; title: string; provider: AgentProvider; updatedAt: string; contextLost: boolean }`.
- Produces (в `chatIndex.ts`):
  - `interface ChatIndexEntry extends ChatSummary { projectPath: string; createdAt: string; model: ChatModelRef | null; modelName: string; sessionId: string | null; lastTurnInterrupted: boolean; lastTurnStopped: boolean }`
  - `initChatIndex(logDir: string): void` — индекс в `join(logDir, 'chats', 'index.json')`; если файла нет — дозаполнить из всех `chats/<день>/*.jsonl` через `parseChatLog` (чаты без `projectPath` или без `provider` пропустить) и сохранить.
  - `chatIdFromLogPath(logDir: string, jsonlPath: string): string` — `'<день>/<имя без .jsonl>'`, например `'2026-10-19/15-01-24'` (разделитель `/` — это ключ, не путь).
  - `chatLogPath(logDir: string, id: string): string` — `join(logDir, 'chats', ...id.split('/')) + '.jsonl'`.
  - `upsertChat(entry: Partial<ChatIndexEntry> & { id: string }): void` — слияние с существующей записью и запись файла (`writeFileSync` во временный файл + `renameSync`).
  - `getChat(id: string): ChatIndexEntry | undefined`.
  - `listChats(projectPath: string): ChatSummary[]` — только этого стенда, только с существующим `.jsonl` (пропавшие удалить из индекса), сортировка по `updatedAt` по убыванию.
- Решение плана (отклонение от спецификации, где индекс «рядом с settings.json»): индекс лежит в папке логов — если пользователь чистит логи, индекс уходит вместе с ними и пересобирается.

- [ ] **Step 1: Write the failing tests** (`mkdtempSync` как в `chatLog.test.ts`):
  - `backfills from existing logs` — два `.jsonl` в `chats/2026-10-18/` и `chats/2026-10-19/` для `/pkgA`, `initChatIndex` → `listChats('/pkgA')` длиной 2, новее первым, `title` из первого сообщения;
  - `filters by project` — третий лог для `/pkgB` не попадает в `listChats('/pkgA')`;
  - `drops chats whose log was deleted` — удалить один `.jsonl` → `listChats` без него;
  - `upsert merges fields` — `upsertChat({ id, sessionId: 's2' })` не стирает `title`;
  - `survives corrupt index.json` — мусор в `index.json` → `initChatIndex` не бросает, `listChats` возвращает `[]`;
  - `chatIdFromLogPath` / `chatLogPath` — туда и обратно дают тот же путь.
- [ ] **Step 2:** `npm test -w @bpmsoft-agent/desktop -- test/chatIndex.test.ts` → FAIL.
- [ ] **Step 3:** реализовать `chatIndex.ts`.
- [ ] **Step 4:** тот же запуск → PASS; typecheck без ошибок.
- [ ] **Step 5: Commit** — `git commit -m "feat(desktop): chat index with backfill from logs"`

### Task 3: Сессия — восстановление, дописывание лога, обновление индекса, защита от подмены

**Files:**
- Modify: `apps/desktop/src/main/chatLog.ts` (`reopenChatLog`, `getCurrentChatId`)
- Modify: `apps/desktop/src/main/agentSession.ts`
- Modify: `apps/desktop/src/main/index.ts` (вызов `initChatIndex` после `initChatLog`)
- Test: `apps/desktop/test/chatLog.test.ts`, `apps/desktop/test/agentSession.test.ts`

**Interfaces:**
- Consumes: `upsertChat`, `chatIdFromLogPath`, `chatTitle` (Task 1–2).
- Produces (в `chatLog.ts`):
  - `reopenChatLog(jsonlPath: string, projectPath: string): void` — делает существующую пару `.jsonl`/`.md` текущей (без новой записи `chat_start`).
  - `getCurrentChatId(): string | undefined` — `chatIdFromLogPath(logDir, current.jsonlPath)`.
- Produces (в `agentSession.ts`):
  - `interface RestoredSession { sessionId: string; projectPath: string; provider: AgentProvider; chatStartedAt: number; lastTurnStopped: boolean; lastTurnInterrupted: boolean; jsonlPath: string }`
  - `restoreAgentSession(s: RestoredSession): void` — `resetAgentSession()`, затем выставить `currentSessionId/Project/Provider`, `currentChatStartedAt`, `lastTurnStopped`, новый флаг `lastTurnInterrupted`, `reopenChatLog`.
  - `isContextLost(resumedFrom: string | undefined, event: AgentEvent): boolean` — `true`, если `resumedFrom` задан, событие `system_init` с `sessionId` и `sessionId !== resumedFrom`.
  - `CONTEXT_LOST_MESSAGE = 'Контекст чата не восстановлен: провайдер начал новую сессию. Начните новый чат.'`
  - `INTERRUPTED_TURN_NOTE = '(Предыдущий ход прервался: приложение перезапустилось во время работы агента. Прежде чем продолжать, проверь, что из прерванной работы уже сделано, затем выполни сообщение ниже.)'`

Изменения в `sendAgentMessage`:
- служебная пометка: `lastTurnInterrupted` → `INTERRUPTED_TURN_NOTE`, иначе `lastTurnStopped` → `STOPPED_TURN_NOTE`; оба флага сбрасываются после отправки;
- после `startChatLogIfNeeded` и записи `user_message`: `upsertChat({ id, projectPath, provider, model, modelName, updatedAt, lastTurnInterrupted: true })`; если записи ещё нет — также `title: chatTitle(prompt)`, `createdAt`, `contextLost: false`. `modelName` — `claudeModelName`/`cursorModelName` из настроек;
- `resumedFrom = currentSessionId` до запуска; в цикле `consume`, если `isContextLost(resumedFrom, event)`: записать `logChatRecord('context_lost', { resumedFrom, sessionId })`, `upsertChat({ id, contextLost: true })`, оборвать ход (`controller.abort()`), после завершения `resetAgentSession()` и отклонить вызов ошибкой `CONTEXT_LOST_MESSAGE` (не глотать её веткой «aborted»); событие с новой сессией в интерфейс не отправлять;
- в `rememberSessionId` при новом id → `upsertChat({ id, sessionId })`;
- в `finally` после `turn_end` → `upsertChat({ id, updatedAt, lastTurnInterrupted: false, lastTurnStopped: aborted })`.

- [ ] **Step 1: Write the failing tests**
  - `chatLog.test.ts` › `reopenChatLog appends to the same file` — создать чат, `endChatLog()`, `reopenChatLog(path, '/proj')`, `logChatRecord('user_message', …)` → в папке дня по-прежнему один `.jsonl`, в нём новая строка; `getCurrentChatLogPath()` === исходный путь;
  - `agentSession.test.ts` › `restoreAgentSession sets session id` — после вызова `getCurrentSessionId() === 'sid-1'`;
  - `agentSession.test.ts` › `isContextLost` — `(undefined, init('a'))` → false; `('a', init('a'))` → false; `('a', init('b'))` → true; `('a', { type: 'text', text: 'x' })` → false.
- [ ] **Step 2:** `npm test -w @bpmsoft-agent/desktop -- test/chatLog.test.ts test/agentSession.test.ts` → FAIL.
- [ ] **Step 3:** реализовать `reopenChatLog`, `getCurrentChatId`, `restoreAgentSession`, `isContextLost`, изменения `sendAgentMessage`/`rememberSessionId`; в `index.ts` — `initChatIndex(resolveChatLogDir())` сразу после `initChatLog`.
- [ ] **Step 4:** весь `npm test -w @bpmsoft-agent/desktop` → PASS; typecheck без ошибок.
- [ ] **Step 5: Commit** — `git commit -m "feat(desktop): restore agent session from chat history"`

### Task 4: Открытие чата в main-процессе и IPC

**Files:**
- Create: `apps/desktop/src/main/chatOpen.ts`
- Modify: `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/preload/index.d.ts`, `apps/desktop/src/shared/types.ts`
- Test: `apps/desktop/test/chatOpen.test.ts`

**Interfaces:**
- Consumes: `ChatIndexEntry`, `getChat`, `listChats`, `chatLogPath` (Task 2); `parseChatLog` (Task 1); `restoreAgentSession` (Task 3).
- Produces (в `shared/types.ts`): `interface OpenedChat { id: string; items: ChatReplayItem[]; readOnlyReason: string | null; note: string | null }`.
- Produces (в `chatOpen.ts`):
  - `interface ChatOpenContext { hasKey: (p: AgentProvider) => boolean; availableModelIds?: string[] }`
  - `interface ChatOpenPlan { readOnlyReason: string | null; settingsPatch: Partial<StoredSettings> | null; note: string | null }`
  - `planChatOpen(chat: ChatIndexEntry, ctx: ChatOpenContext): ChatOpenPlan`
- IPC: `chat:list (pkgRoot: string) → ChatSummary[]`; `chat:open (id: string, pkgRoot: string) → OpenedChat`. Preload: `listChats(pkgRoot)`, `openChat(id, pkgRoot)`.

Правила `planChatOpen` (тексты точные):
- `contextLost` → `readOnlyReason: 'Контекст этого чата потерян — продолжить его нельзя. Начните новый чат.'`, `settingsPatch: null`;
- нет `sessionId` → `'Ход оборвался до начала сессии агента — продолжить чат нельзя. Начните новый чат.'`, `settingsPatch: null`;
- нет ключа провайдера → `` `Не задан ключ ${Claude|Cursor} — продолжить чат нельзя. Укажите ключ в настройках или начните новый чат.` ``, `settingsPatch: null`;
- иначе `settingsPatch` содержит `provider`; модель чата: Claude — `claudeModel = model.id ?? ''`, `claudeEffort = model.effort ?? ''`, `claudeModelName = modelName`; Cursor — `cursorModel`, `cursorModelParams = model.params ?? []`, `cursorModelName`;
- если `availableModelIds` задан, `model.id` непустой и его нет в списке → поля модели не трогаем, `note: 'Модели этого чата больше нет — продолжаю на текущей модели провайдера.'`.

Обработчик `chat:open`: проверить, что `chat.projectPath === pkgRoot` и не идёт ход (иначе ошибка); прочитать и разобрать лог; получить список моделей провайдера чата (`listClaudeModels`/`listCursorModels`, ошибку → `availableModelIds` не задан); `planChatOpen`; если не только чтение — `updateAppSettings(settingsPatch)` **затем** `restoreAgentSession` (порядок важен: смена провайдера через `settings:setProvider` сбросила бы сессию, поэтому здесь `updateAppSettings` вызывается напрямую, без `resetAgentSession`); если только чтение — `resetAgentSession()`, чтобы следующее сообщение не ушло в прежний чат; вернуть `OpenedChat`. `chatStartedAt` — `Date.parse(parsed.startedAt)`, при отсутствии — `Date.parse(chat.createdAt)`.

- [ ] **Step 1: Write the failing tests** (`chatOpen.test.ts`), по одному на каждое правило выше с точными текстами: `contextLost`, нет `sessionId`, нет ключа (patch === null), Claude-patch, Cursor-patch с `params`, модель пропала (`note` и patch без полей модели, но с `provider`), `availableModelIds` не задан → модель переключается.
- [ ] **Step 2:** `npm test -w @bpmsoft-agent/desktop -- test/chatOpen.test.ts` → FAIL.
- [ ] **Step 3:** реализовать `planChatOpen`, обработчики IPC, preload и его `.d.ts`.
- [ ] **Step 4:** весь `npm test` → PASS; typecheck без ошибок.
- [ ] **Step 5: Commit** — `git commit -m "feat(desktop): open chat from history over IPC"`

### Task 5: Панель чатов и восстановление ленты в интерфейсе

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ChatSidebar.tsx`
- Modify: `apps/desktop/src/renderer/src/chatFormat.ts`, `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/components/Header.tsx`, `apps/desktop/src/renderer/src/components/Composer.tsx`, `apps/desktop/src/renderer/src/styles.css`
- Test: `apps/desktop/test/chatFormat.test.ts`

**Interfaces:**
- Consumes: `window.api.listChats`, `window.api.openChat`, типы `ChatSummary`, `OpenedChat`, `ChatReplayItem` (Task 1, 2, 4).
- Produces:
  - `replayToEntries(items: ChatReplayItem[]): ChatEntry[]` в `chatFormat.ts` — `user` → `{ role: 'user', content: text }`, `agent` → `mapAgentEventToEntry(event)`; `ts` записи берётся из `Date.parse(item.ts)` (не `Date.now()`).
  - `ChatSidebar` props: `{ chats: ChatSummary[]; activeChatId: string | null; disabled: boolean; onSelect: (id: string) => void; onNewChat: () => void }`.

Поведение:
- `ChatSidebar` — колонка слева в `.workspace` перед `.main`: сверху кнопка «Новый чат» (`IconPlus`), ниже список. Элемент: название (одна строка с многоточием), дата/время `updatedAt` (сегодня — только время), бейдж провайдера «Claude»/«Cursor», для `contextLost` — приглушённый вид. Активный чат подсвечен. При `disabled` элементы и кнопка неактивны.
- Кнопка «Новый чат» из `Header` переносится в `ChatSidebar` (проп `onNewChat` у `Header` убрать).
- `App`: состояние `chats`, `activeChatId`, `readOnlyReason`, `chatNote`. Список грузится при открытии проекта, после каждого хода (`finally` в `sendText`) и после «Новый чат»; `activeChatId` после первого хода нового чата — первый элемент нового списка, если его id не было в прежнем.
- Выбор чата: `openChat(id, pkgRoot)` → `resetChatView()`, `setEntries(replayToEntries(items))`, `refreshSettings()` (провайдер мог смениться), `readOnlyReason`, `note` как запись `agent-result` с `level: 'warn'` в конце ленты; ошибку показать так же, как ошибки отправки.
- `readOnlyReason` → `Composer` получает `disabledReason?: string` и показывает текст вместо поля ввода. «Новый чат» сбрасывает `readOnlyReason`.
- Смена провайдера в настройках и «Сменить проект» сбрасывают `activeChatId` и `readOnlyReason`.
- Ошибка `CONTEXT_LOST_MESSAGE` при отправке показывается как обычная ошибка, затем список перезагружается (чат станет `contextLost`), а `readOnlyReason` выставляется текстом правила `contextLost` из Task 4.

- [ ] **Step 1: Write the failing test** — `chatFormat.test.ts` › `replayToEntries keeps order and timestamps`: элементы `user` и `agent(text)` → роли `['user','agent-text']`, `ts` равен `Date.parse` исходных строк.
- [ ] **Step 2:** `npm test -w @bpmsoft-agent/desktop -- test/chatFormat.test.ts` → FAIL.
- [ ] **Step 3:** реализовать `replayToEntries`, `ChatSidebar`, изменения `App`, `Header`, `Composer`, стили (ширина панели ~240px, стиль как у `.recent-item`).
- [ ] **Step 4:** весь `npm test` → PASS; `npm run typecheck -w @bpmsoft-agent/desktop` без ошибок.
- [ ] **Step 5: Commit** — `git commit -m "feat(desktop): chat history sidebar"`

### Task 6: Ручная проверка на стенде

Делает пользователь (стенд общий); исполнитель готовит сценарий в `docs/test-runs/` по образцу соседних файлов.

- [ ] Claude: начать чат, дождаться ответа агента, закрыть приложение, открыть снова → чат в панели первым; открыть, спросить «что ты сделал в этом чате?» → агент отвечает по существу прошлого диалога; в папке дня новый `.jsonl` не появился.
- [ ] Cursor: то же; дополнительно проверить, что `system_init` после перезапуска несёт тот же `agent-…` id (иначе — ошибка «Контекст чата не восстановлен», чат только для чтения; это допустимый, но нежелательный исход — записать).
- [ ] Открыть чат Cursor при пустом ключе Cursor → только чтение с причиной, провайдер в настройках не сменился.
- [ ] Чат другого стенда в панели не виден.
- [ ] Перезапуск во время хода → при продолжении агент сначала проверяет, что успел сделать.
- [ ] Предложить пользователю прогнать эвалы по любой теме один раз: изменился промпт хода после прерывания (`INTERRUPTED_TURN_NOTE`).
- [ ] **Commit** — `git commit -m "docs(test-runs): chat history scenario"`
