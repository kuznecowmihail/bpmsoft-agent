# Петля исправлений, pkg_lint и эвал-набор — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. В этом репозитории правки делает `haiku-common-agent` (см. `CLAUDE.md`).

**Goal:** агент сам доводит запись в `Pkg` до чистой загрузки и компиляции с контрольной точкой вместо бесконечного цикла (часть A), до обращения к CRM проверяет изменённые схемы детерминированным линтером (часть B), а разработчик проверяет изменения знаний и промпта автоматическим прогоном задач (часть C).

**Architecture:** общий помощник «что изменено в этом чате» (`changedFiles.ts`, по mtime файлов `Pkg` с момента начала чата) используется и петлёй, и линтером. Петля — счётчик неудачных попыток внутри `createCrmTools` (инструменты создаются заново на каждый ход, поэтому счётчик живёт один ход, а «Продолжай» от пользователя начинает новый ход со свежим лимитом). Линтер — новый `AppTool` `pkg_lint`, который вызывает существующие `check-entity.js` / `check-process.js` как модули и добавляет общие проверки; `crm_update_from_fs` запускает его первым. Эвалы — отдельный workspace `packages/evals` с CLI, который гоняет `runBpmsoftAgentQuery` / `runCursorAgentQuery` без интерфейса с заготовленными ответами пользователя.

**Tech Stack:** TypeScript (commonjs, ES2022), vitest, Node `fs`/`path`/`child_process.execFile`, Claude Agent SDK, Cursor SDK.

**Spec:** обсуждение в чате 14–15.10.2026 (пункты 3, 4, 5); правила петли — раздел «Правила петли» ниже.

## Global Constraints

- Кроссплатформенность: пути только через `path.join`; имя файла из строки ошибки — разбиением по `/[\\/]/`; внешние программы — `execFile` без `shell: true`; никаких `~`, `$HOME`, `/tmp` в коде приложения (в тестах `os.tmpdir()` допустим, как в `test/localTools.test.ts`).
- Файлы с BOM и CRLF: JSON читать после `.replace(/^\uFEFF/, "")`, регулярные выражения по тексту — с `\r?\n`.
- Тексты для агента и пользователя — на русском.
- Промпт в `systemPrompt.ts` — один template-литерал, без обратных кавычек внутри; после правки — `npm run build` в `packages/agent-runtime`.
- Репозиторий публичный: в кейсах эвалов только нейтральные имена (`Test…`, `{{package}}`); адреса и пути стенда — только в `packages/evals/local.json` (в `.gitignore`).
- Учётные данные агенту не показываются: `pkg_lint` и раннер эвалов не выводят паролей; пароли раннера — из переменных окружения.

## Правила петли (решено 15.10.2026)

1. Лимит — **5 неудачных действий** `crm_update_from_fs` / `crm_compile` (включая отказ `pkg_lint` внутри обновления) за ход. Это контрольная точка, а не стоп: агент пишет, что пробовал, и спрашивает «Продолжай исправлять» / «Остановись, разберусь сам». «Продолжай» — новый ход и новые 5 попыток. Успешная компиляция обнуляет счётчик. «CRM недоступна» и «Вход не выполнен» не считаются: на них агент и так не повторяет вызов.
2. Ошибка в схеме, которую в этом чате не меняли (чужая): агент не исправляет её молча, а сообщает пользователю и предлагает «Исправь» / «Не трогай». Если пользователь в этом чате уже просил исправить эту ошибку — исправляет.
3. Та же ошибка повторно: на 2-й раз подряд — подсказка «смени подход» (перечитай рецепт, найди рабочий образец в `Pkg`, сравни), на 3-й раз подряд — контрольная точка, как в п. 1.
4. Исправление, которое требует менять что-то вне плана (другие схемы, удаление), — вопрос пользователю.
5. «Спрашивать перед каждым действием» действует и внутри петли (уже так: `confirm` в `runAction`).

## Review Focus

- Запись командами оболочки. Песочницы разрешают запись в `Pkg` командами, они ограничивают только место записи: Claude — Bash в песочнице ОС на macOS/Linux (`buildShellSandbox`), на Windows её нет и такие команды идут через подтверждение пользователя; Cursor — наш `run_shell` с проверкой путей (`checkToolAccess`), на macOS — Seatbelt, на Windows — bash из Git for Windows без песочницы ОС, запись — с подтверждения. Поэтому `perl -pi` / `node -e` меняют `Pkg` у обоих провайдеров на обеих ОС, а содержимое команды для нас непрозрачно (хук `PreToolUse` и `run_shell` видят только текст команды) — «изменено в чате» определяем по mtime, а не перехватом вызовов. Тест в Task 1 ставит mtime через `fs.utimesSync`.
- Служебные папки SDK. Claude Agent SDK пишет атомарно через `<папка>/.claude/.cc-writes` прямо внутри `Pkg` (в том числе в `Schemas/<Имя>/`), а `cleanupStagingDirs` убирает их только после хода; `listChangedFiles` должен пропускать `.claude` и любые папки на точку, иначе пакет `.claude` или схема из служебной папки попадут в «изменённые»; тест в Task 1.
- `pkg_lint` и CRM-инструменты выполняются в процессе приложения, вне песочницы агента. Им можно читать только `Pkg` и каталог знаний; `require` — только скриптов из `knowledgeDir/scripts` (агент туда писать не может), никогда из `Pkg`; тест в Task 4 — путь к скрипту строится от `knowledgeDir`, а не от проверяемой папки.
- Раннер эвалов обязан запускать агента с той же песочницей, что приложение (`sandbox` / `readRoot`), иначе у Claude не будет хука `PreToolUse`, а «разрешить всё» в раннере откроет запись вне `Pkg`; на Windows (нет песочницы ОС для оболочки) раннер не запускается без явного `--allow-unsandboxed-shell`; тест в Task 7.
- Путь к файлу в ошибке компиляции с обратными слешами (стенд на Windows) — имя схемы должно определяться; тест в Task 2.
- Чат, где агент ещё ничего не менял (пользователь просит «почини компиляцию»), — все ошибки чужие, но агент не должен застрять: правило 2 + тест в Task 2 на пустой `ownSchemas`.
- Ложное срабатывание линтера блокирует обновление — отказ линтера считается попыткой, значит, через 5 попыток срабатывает контрольная точка; тест в Task 5.
- `descriptor.json` / `resource.*.xml` с BOM и CRLF не должны давать ложных ошибок; тест в Task 4.

---

## Часть A. Петля исправлений

### Task 1: Помощник «что изменено в этом чате»

**Files:**
- Create: `packages/agent-runtime/src/lint/changedFiles.ts`
- Create: `packages/agent-runtime/src/lint/index.ts` (реэкспорт), добавить `export * from "./lint";` в `packages/agent-runtime/src/index.ts`
- Test: `packages/agent-runtime/test/changedFiles.test.ts`

**Interfaces:**
- Produces:
  - `listChangedFiles(pkgRoot: string, sinceMs: number): string[]` — абсолютные пути файлов с `mtimeMs >= sinceMs`; обходит только `<pkgRoot>/<пакет>/{Schemas,Resources,Data,SqlScripts}` и `<пакет>/descriptor.json`; пропускает `node_modules` и все папки, чьё имя начинается с точки (`.git`, служебная `.claude/.cc-writes` SDK).
  - `changedSchemaNames(pkgRoot: string, sinceMs: number): Set<string>` — имена схем из путей: `<пакет>/Schemas/<Имя>/…` → `<Имя>`; `<пакет>/Resources/<Имя>.<Категория>/…` → `<Имя>` (отрезается последняя часть после точки); `<пакет>/Data/<Имя>/…`, `<пакет>/SqlScripts/<Имя>/…` → `<Имя>`.
  - `changedSchemaDirs(pkgRoot: string, sinceMs: number): string[]` — уникальные папки `<пакет>/Schemas/<Имя>`, в которых изменено что-то (в том числе через `Resources/<Имя>.<Категория>`), только существующие.

- [ ] **Step 1: Тесты.** Во временном `Pkg` (`fs.mkdtempSync`) создать `P1/Schemas/TestA/metadata.json`, `P1/Resources/TestA.Entity/resource.ru-RU.xml`, `P1/Schemas/TestOld/metadata.json`, `P1/Data/TestData/data.json`; для `TestOld` выставить `fs.utimesSync(..., old, old)` с `old = since/1000 - 3600`.
  - `changedSchemaNames(pkg, since)` равно `new Set(["TestA", "TestData"])`.
  - `changedSchemaDirs(pkg, since)` равно `[path.join(pkg, "P1", "Schemas", "TestA")]`.
  - Изменён только `Resources/TestB.ClientUnit/resource.en-US.xml` при существующей `Schemas/TestB` → `changedSchemaDirs` содержит папку `TestB`.
  - `listChangedFiles` не возвращает файлы из `P1/.git`, `P1/Schemas/TestA/.claude/.cc-writes/x.tmp` и `<pkg>/.claude/…`; `changedSchemaNames` не содержит `.claude`.
- [ ] **Step 2:** `npx vitest run test/changedFiles.test.ts` → FAIL (модуля нет).
- [ ] **Step 3:** Реализовать три функции в `changedFiles.ts` (рекурсивный `fs.readdirSync(..., { withFileTypes: true })` + `fs.statSync`).
- [ ] **Step 4:** `npx vitest run test/changedFiles.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(runtime): changed schemas of the current chat by mtime`.

### Task 2: Счётчик попыток и чужие ошибки в CRM-инструментах

**Files:**
- Create: `packages/agent-runtime/src/crm/fixLoop.ts`, экспорт из `src/crm/index.ts`
- Modify: `packages/agent-runtime/src/crm/crmTools.ts` (`CrmToolsOptions`, `CrmActionRecord`, `ActionOutcome`, `runAction`, `runUpdate`, `runCompile`)
- Test: `packages/agent-runtime/test/fixLoop.test.ts`, дополнить `packages/agent-runtime/test/crm.test.ts`

**Interfaces:**
- Consumes: ничего из Task 1 напрямую (принимает функцию `ownSchemas`).
- Produces:
  - `export const DEFAULT_MAX_FAILED_ACTIONS = 5;`
  - `export interface FailureInfo { signature: string; schemaNames: string[] }`
  - `export class FixLoop { constructor(options: { maxFailures?: number; ownSchemas?: () => Set<string> }); blocked(): string | undefined; success(action: "update" | "compile"): void; failure(info: FailureInfo): { text: string; attempt: number; foreignSchemas: string[] } }`
  - `export function errorSignature(error: string): string` — убирает `(\d+,\d+)` и пробельные различия, чтобы правка строк не делала ошибку «новой».
  - `export function schemaNameFromFile(fileName: string): string` — последний сегмент по `/[\\/]/`, до первой точки.
  - `CrmToolsOptions` += `maxFailedActions?: number; ownSchemas?: () => Set<string>; lint?: () => { ok: boolean; text: string }` (`lint` использует Task 5).
  - `CrmActionRecord` += `attempt?: number; foreignSchemas?: string[]; blocked?: boolean`.

Поведение `FixLoop`:
- `failure` увеличивает счётчик; `foreignSchemas` = `schemaNames`, которых нет в `ownSchemas()`.
- Текст добавки (дописывается в конец ответа инструмента):
  - всегда: `Неудачная попытка N из M в этом ходе.`;
  - есть чужие: `Ошибка в схемах, которые в этом чате не менялись: <имена>. Не исправляй их молча: сообщи пользователю, где ошибка и в чём, и задай блок <choices> «Исправить ошибку в <имена>?» — «Исправь», «Не трогай». Если пользователь в этом чате уже просил исправить эту ошибку — исправляй.`;
  - та же `signature`, что у прошлой неудачи (2-й раз подряд): `Та же ошибка, что в прошлой попытке: прошлое исправление не помогло. Смени подход: перечитай рецепт в знаниях, найди рабочий образец в Pkg и сравни с ним.`;
  - 3-й раз подряд та же или `N >= M`: текст контрольной точки — `Достигнута контрольная точка. Не вызывай crm_update_from_fs и crm_compile в этом ходе: напиши пользователю по попыткам, что пробовал и какая ошибка осталась, и закончи ответ блоком <choices> с вопросом «Что дальше?» и вариантами «Продолжай исправлять» и «Остановись, разберусь сам».` После этого `blocked()` возвращает `Контрольная точка уже достигнута в этом ходе — не вызывай инструмент, спроси пользователя, продолжать ли.`
- `success("compile")` обнуляет счётчик и серию одинаковых ошибок; `success("update")` их не трогает.

Изменения `crmTools.ts`:
- `createCrmTools` создаёт один `FixLoop` на набор инструментов.
- `runAction`: в начале, если `loop.blocked()` → вернуть `{ text, isError: true }` и `onAction({..., blocked: true})` без входа в CRM. Если `action === "update"` и задан `options.lint` и `!lint().ok` → неудача `{ signature: errorSignature(lintText), schemaNames: [] }`, без `confirm` и без входа в CRM, ответ = текст линтера + добавка.
- `ActionOutcome` += `countable?: boolean; schemaNames?: string[]`. Ошибки входа и «CRM недоступна» — `countable: false`. `runUpdate` заполняет `schemaNames` из `workspaceItem.name`, `runCompile` — `schemaNameFromFile(fileName)` реальных ошибок.
- `finish` вызывает `loop.success(action)` или `loop.failure(...)` и дописывает текст.

- [ ] **Step 1: Тесты `fixLoop.test.ts`:**
  - 5 разных неудач при `maxFailures` 5 → у пятой текст содержит `Достигнута контрольная точка`, после неё `blocked()` не `undefined`;
  - две одинаковые подряд (`errorSignature("A.cs(10,5): CS0029 x") === errorSignature("A.cs(12,5): CS0029 x")`) → во второй есть `Смени подход`; третья одинаковая → контрольная точка при `attempt` 3;
  - `success("compile")` после 4 неудач → следующая неудача — попытка 1;
  - `success("update")` после 4 неудач → следующая — попытка 5 и контрольная точка;
  - `ownSchemas = () => new Set(["TestOwn"])`, `schemaNames: ["TestOwn", "TestForeign"]` → `foreignSchemas` = `["TestForeign"]`, текст содержит `Исправить ошибку в TestForeign?`;
  - `ownSchemas = () => new Set()` → все имена чужие, текст содержит «Если пользователь в этом чате уже просил исправить»;
  - `schemaNameFromFile("C:\\app\\Pkg\\P\\Schemas\\TestHelper\\TestHelper.cs") === "TestHelper"`, то же для `/app/.../TestHelper.cs`.
- [ ] **Step 2: Тесты `crm.test.ts`** (существующие фейки `fetchImpl`): ответ компиляции с ошибкой 5 раз → пятый результат содержит `контрольная точка`, шестой вызов не делает HTTP-запросов (счётчик запросов фейка не растёт) и `onAction` получает `blocked: true`; ошибка входа 6 раз → ни в одном тексте нет `Неудачная попытка`.
- [ ] **Step 3:** `npx vitest run test/fixLoop.test.ts test/crm.test.ts` → FAIL.
- [ ] **Step 4:** Реализовать `fixLoop.ts` и изменения `crmTools.ts`.
- [ ] **Step 5:** `npx vitest run` (весь пакет) → PASS.
- [ ] **Step 6:** Commit `feat(runtime): fix loop with checkpoint and foreign errors in CRM tools`.

### Task 3: Подключение петли в приложении и промпт

**Files:**
- Modify: `apps/desktop/src/main/agentSession.ts` (`resetAgentSession`, `sendAgentMessage`)
- Modify: `packages/agent-runtime/src/provider/systemPrompt.ts` (`CRM_ACTIONS_SECTION`)
- Test: `packages/agent-runtime/test/systemPrompt.test.ts`

**Interfaces:**
- Consumes: `changedSchemaNames` (Task 1), `CrmToolsOptions.ownSchemas` (Task 2).
- Produces: `let currentChatStartedAt: number | undefined` в `agentSession.ts` — ставится `Date.now()` в начале `sendAgentMessage`, если `undefined`; сбрасывается в `resetAgentSession`. Task 5 использует её же.

- [ ] **Step 1: Тест `systemPrompt.test.ts`:** с `crmActions: true` промпт содержит `Продолжай исправлять` и `контрольная точка`; без `crmActions` — не содержит `контрольная точка`.
- [ ] **Step 2:** `npx vitest run test/systemPrompt.test.ts` → FAIL.
- [ ] **Step 3:** В `CRM_ACTIONS_SECTION` заменить пункт «Порядок…» и «crm_compile: при ошибках…» на правила 1–4 из раздела «Правила петли» (коротко, для агента): исправляй ошибки своих схем без нового плана; ответ инструмента сообщает номер попытки, чужие схемы и контрольную точку — выполняй его указания; на контрольной точке — итог по попыткам и `<choices>` «Что дальше?»; исправление, требующее правок вне плана, — вопрос.
- [ ] **Step 4:** В `agentSession.ts` передать в `createCrmTools` `ownSchemas: () => changedSchemaNames(projectPath, currentChatStartedAt ?? Date.now())`; в `onAction` лог уже пишет запись целиком — новые поля попадут сами.
- [ ] **Step 5:** `npm run build` в `packages/agent-runtime`, `npx vitest run` в `packages/agent-runtime` и `apps/desktop` → PASS.
- [ ] **Step 6:** Commit `feat: fix loop rules in prompt, own schemas from chat start`.
- [ ] **Step 7 (проверка пользователем на стенде):** задача 6 из `tasks_for_test_9.md` (сломанная `;`) и та же задача с двумя сломанными файлами — в логе номера попыток; при ошибке в схеме, которую чат не менял, агент спрашивает «Исправь / Не трогай».

---

## Часть B. pkg_lint

### Task 4: Скрипты проверок как модули и ядро линтера

**Files:**
- Modify: `packages/agent-runtime/knowledge/scripts/check-entity.js`, `check-process.js` — вместо последней строки `main();`: `if (require.main === module) { main(); }` и `module.exports = { validateEntity, getEntityFolders };` / `module.exports = { validateProcess, getProcessFolders };`. Поведение CLI не меняется.
- Create: `packages/agent-runtime/src/lint/pkgLint.ts`
- Test: `packages/agent-runtime/test/pkgLint.test.ts`

**Interfaces:**
- Consumes: `changedSchemaDirs`, `listChangedFiles` (Task 1).
- Produces:
  - `export interface LintIssue { schema: string; level: "error" | "warning"; message: string }`
  - `export interface LintReport { checked: number; issues: LintIssue[]; ok: boolean; text: string }` (`ok` = нет `error`)
  - `export function lintSchemas(schemaDirs: string[], options: { knowledgeDir: string; extraFiles?: string[] }): LintReport`
  - `export function lintChanged(pkgRoot: string, sinceMs: number, knowledgeDir: string): LintReport` = `lintSchemas(changedSchemaDirs(...), { knowledgeDir, extraFiles: listChangedFiles(...) })`

Проверки (только ✅-факты и подтверждённые ошибки; ничего «на всякий случай»):
1. Каждый файл `*.json` из `extraFiles` и `descriptor.json` / `metadata.json` (если первый непробельный символ `{`) разбирается `JSON.parse` после снятия BOM → иначе `error` `<файл>: JSON не разбирается: <сообщение>`.
2. Для каждой папки `Resources/<Имя>.<Категория>` изменённой схемы: есть `resource.ru-RU.xml`, но нет `resource.en-US.xml` (или наоборот) → `error` `нет resource.<culture>.xml`; оба есть, но множества `Name` из `<Item Name="…"` различаются → `warning` с перечнем лишних/недостающих ключей.
3. Схема сущности (`descriptor.Descriptor.ManagerName === "EntitySchemaManager"`) → `validateEntity(dir)` из `require(path.join(knowledgeDir, "scripts", "check-entity.js"))`; процесса (`ProcessSchemaManager`) → `validateProcess(dir)` из `check-process.js`. Строки их `errors` / `warnings` → `LintIssue`.
- `text`: заголовок `pkg_lint: проверено схем: N`, затем по схеме `== <Имя>` и строки `ОШИБКА …` / `ВНИМАНИЕ …` (как у скриптов), итог `Итого: X ошибок, Y предупреждений`; при `checked === 0` — `pkg_lint: в этом чате схемы не изменялись.`

- [ ] **Step 1: Тесты** (временный `Pkg`):
  - `descriptor.json` с BOM и CRLF + корректный JSON → нет `error`;
  - `metadata.json` с висящей запятой → `error`, текст содержит `JSON не разбирается`;
  - `Resources/TestA.Entity/` только с `resource.ru-RU.xml` → `error` `нет resource.en-US.xml`;
  - оба файла, в en-US нет ключа `Caption` → `warning`, `ok === true`;
  - сущность из `knowledge/templates` (или минимальная валидная копия из существующих тестов скриптов), в которой `BL3` / координата дробная → есть `error` от `validateEntity` (проверить, что подключение скриптов работает);
  - `node knowledge/scripts/check-entity.js <папка>` по-прежнему печатает `Итого:` (CLI не сломан) — через `execFileSync(process.execPath, [...])`.
- [ ] **Step 2:** `npx vitest run test/pkgLint.test.ts` → FAIL.
- [ ] **Step 3:** Правка двух скриптов и реализация `pkgLint.ts`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat(runtime): pkg_lint core over check scripts`.

### Task 5: Инструмент `pkg_lint`, проверка перед обновлением, подключение

**Files:**
- Create: `packages/agent-runtime/src/lint/pkgLintTool.ts`
- Modify: `packages/agent-runtime/src/safety/sandboxGuard.ts` (`isAutoApprovedToolCall`, рядом с `CRM_BROWSER_TOOL_PATTERN`)
- Modify: `apps/desktop/src/main/agentSession.ts`
- Modify: `packages/agent-runtime/src/provider/systemPrompt.ts`
- Test: `packages/agent-runtime/test/pkgLint.test.ts`, `test/sandboxGuard.test.ts`, `test/crm.test.ts`, `test/systemPrompt.test.ts`

**Interfaces:**
- Consumes: `lintChanged`, `lintSchemas` (Task 4), `CrmToolsOptions.lint` (Task 2), `currentChatStartedAt` (Task 3).
- Produces:
  - `export const PKG_LINT_TOOL = "pkg_lint";`
  - `export const PKG_LINT_TOOL_PATTERN = /^(mcp__app__)?pkg_lint$/;` (в `sandboxGuard.ts`, автоодобрение — только чтение)
  - `export function createPkgLintTool(options: { pkgRoot: string; since: () => number; knowledgeDir?: string }): AppTool` — параметр `schema` (string, optional): имя схемы — проверить только её папку `<пакет>/Schemas/<schema>` (поиск по всем пакетам), иначе всё изменённое в чате. `knowledgeDir` по умолчанию `path.join(__dirname, "../../knowledge")`. Результат `{ text: report.text, isError: !report.ok }`.

- [ ] **Step 1: Тесты:**
  - `createPkgLintTool(...).execute({})` на временном `Pkg` с битым JSON → `isError: true`; с `{ schema: "TestA" }` проверяет только `TestA`;
  - `isAutoApprovedToolCall("mcp__app__pkg_lint", {})` и `("pkg_lint", {})` → `true`;
  - `crm.test.ts`: `lint: () => ({ ok: false, text: "ОШИБКА x" })` → `crm_update_from_fs` не делает HTTP-запросов и не вызывает `confirm`, текст содержит `ОШИБКА x` и `Неудачная попытка 1 из 5`; пять таких вызовов → контрольная точка;
  - промпт содержит `pkg_lint`.
- [ ] **Step 2:** тесты → FAIL.
- [ ] **Step 3:** Реализация `pkgLintTool.ts`, паттерн в `sandboxGuard.ts`.
- [ ] **Step 4:** `agentSession.ts`: `const lintTool = createPkgLintTool({ pkgRoot: projectPath, since: () => currentChatStartedAt ?? Date.now() })`; `appTools = [...(browserTools ?? []), lintTool]` (всегда, независимо от браузера); в `createCrmTools` — `lint: () => lintChanged(projectPath, currentChatStartedAt ?? Date.now(), <knowledgeDir>)` (knowledgeDir — экспортировать из runtime функцию `defaultKnowledgeDir()` в `pkgLintTool.ts` и использовать её).
- [ ] **Step 5:** Промпт:
  - п. 5 «РЕАЛИЗАЦИЯ»: «После записи вызови pkg_lint и исправь все строки ОШИБКА до ответа пользователю; ВНИМАНИЕ оцени. Если считаешь ОШИБКА ложной — не обходи, напиши пользователю.»
  - в `CRM_ACTIONS_SECTION`: «crm_update_from_fs сначала сам запускает pkg_lint: при ошибках линтера в CRM ничего не отправляется»; ссылки «запусти check-process.js / check-entity.js» в разделе и в индексе для `entity-edit.md` и `process-edit.md` заменить на «вызови pkg_lint (он запускает check-entity.js / check-process.js)».
  - тот же текст в `runUpdate` (`crmTools.ts`, строка «Найди причину…»): `check-process.js / check-entity.js` → `pkg_lint`.
- [ ] **Step 6:** `npm run build` в `packages/agent-runtime`, `npx vitest run` в обоих пакетах → PASS.
- [ ] **Step 7:** Commit `feat: pkg_lint tool, lint before update from file system`.
- [ ] **Step 8 (проверка пользователем):** задачи 1 и 3 из `tasks_for_test_9.md` на Claude и Cursor — в логе вызов `pkg_lint` после записи; искусственно удалить `resource.en-US.xml` у тестовой схемы и попросить «обнови CRM» — обновление не уходит на стенд, агент сначала чинит ресурс.

---

## Часть C. Эвал-набор

### Task 6: Workspace `packages/evals`, формат кейса и проверки

**Files:**
- Create: `packages/evals/package.json` (`name: "@bpmsoft-agent/evals"`, `private`, `main: dist/cli.js`, scripts `build: tsc -p tsconfig.json`, `test: vitest run`, `eval: node dist/cli.js`; зависимость `@bpmsoft-agent/agent-runtime: "*"`; devDependencies как в `agent-runtime`)
- Create: `packages/evals/tsconfig.json` (копия `agent-runtime/tsconfig.json`)
- Create: `packages/evals/src/caseFile.ts`, `packages/evals/src/checks.ts`
- Create: `packages/evals/local.example.json`; добавить `packages/evals/local.json` и `packages/evals/results/` в корневой `.gitignore`
- Test: `packages/evals/test/caseFile.test.ts`, `packages/evals/test/checks.test.ts`

**Interfaces:**
- Produces:
  - `export interface EvalConfig { appRoot: string; package: string; prefix: string; vars: Record<string, string>; crm?: { url: string; user: string }; db?: boolean }` — читается из `local.json`; пароль CRM — `process.env.BPMSOFT_EVAL_CRM_PASSWORD`, ключи — `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`.
  - `export type EvalCheck = { type: "file_exists"; path: string } | { type: "file_contains"; path: string; pattern: string } | { type: "lint_clean" } | { type: "crm_update_ok" } | { type: "crm_compile_ok" } | { type: "db_rows"; sql: string; min: number } | { type: "tool_called"; name: string } | { type: "tool_not_called"; name: string }` — `path` относительно `Pkg/<package>`, допускает `*` в одном сегменте.
  - `export interface EvalSetup { type: "replace_in_file"; path: string; find: string; replace: string }`
  - `export interface EvalCase { id: string; title: string; provider?: "claude" | "cursor"; setup?: EvalSetup[]; task: string; answers: string[]; maxTurns: number; checks: EvalCheck[] }` — файл `packages/evals/cases/<id>.json`.
  - `export function loadCase(file: string, config: EvalConfig): EvalCase` — подставляет `{{package}}`, `{{prefix}}` и `{{<ключ из vars>}}` во все строки; неизвестная подстановка → исключение с именем.
  - `export interface CheckResult { check: EvalCheck; passed: boolean; detail: string }`
  - `export interface CheckContext { pkgRoot: string; packageDir: string; toolNames: string[]; crmTools?: CrmTool[]; dbTool?: CrmDbTool; lint: () => LintReport }`
  - `export async function runChecks(checks: EvalCheck[], ctx: CheckContext): Promise<CheckResult[]>` — `crm_*_ok` вызывают инструменты из `createCrmTools` без `confirm`; `db_rows` — `dbTool.execute(sql)` и число строк ≥ `min`; `tool_called` сравнивает и с префиксом `mcp__*__`.

- [ ] **Step 1: Тесты:** `loadCase` подставляет `{{package}}` и падает на `{{unknown}}`; `runChecks` на временном `Pkg`: `file_exists` с `Schemas/*/metadata.json`, `file_contains` с регуляркой, `tool_called` находит `mcp__crm__crm_compile` по имени `crm_compile`, `tool_not_called`; `crm_*`/`db_rows` — с фейковыми `CrmTool` / `CrmDbTool`.
- [ ] **Step 2:** `npm install` в корне, `npx vitest run` в `packages/evals` → FAIL.
- [ ] **Step 3:** Реализация `caseFile.ts`, `checks.ts`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat(evals): case format and checks`.

### Task 7: Раннер и CLI

**Files:**
- Create: `packages/evals/src/runner.ts`, `packages/evals/src/cli.ts`, `packages/evals/src/report.ts`
- Test: `packages/evals/test/runner.test.ts`, `packages/evals/test/report.test.ts`

**Interfaces:**
- Consumes: Task 6; из runtime — `runBpmsoftAgentQuery`, `runCursorAgentQuery`, `createCrmTools`, `createCrmDbTool`, `createPkgLintTool`, `lintChanged`, `AgentEvent`.
- Produces:
  - `export type QueryFn = (args: { prompt: string; resume?: string; startedAt: number }) => AsyncIterable<AgentEvent>`
  - `export interface CaseRun { caseId: string; provider: "claude" | "cursor"; run: number; passed: boolean; checks: CheckResult[]; turns: number; failedCrmActions: number; costUsd: number; durationMs: number; transcriptFile: string; error?: string }`
  - `export async function resetPackage(pkgRoot: string, packageName: string): Promise<void>` — `execFile("git", ["-C", pkgRoot, "checkout", "--", packageName])`, затем `["clean", "-fd", "--", packageName]`, затем `status --porcelain -- <package>` должен быть пустым, иначе исключение `Пакет не вернулся в исходное состояние`.
  - `export async function runCase(evalCase: EvalCase, config: EvalConfig, provider: "claude" | "cursor", run: number, deps: { query: QueryFn; resultsDir: string }): Promise<CaseRun>`
  - `export function renderReport(runs: CaseRun[]): string` — markdown-таблица `кейс | провайдер | прогон | итог | итераций CRM | ходов | $ | время` и ниже — не прошедшие проверки с `detail`.
  - CLI: `npm run eval -w @bpmsoft-agent/evals -- [--case <id>] [--provider claude|cursor] [--runs N]` (по умолчанию все кейсы, провайдер из кейса или `claude`, 1 прогон).

Порядок `runCase`:
1. `resetPackage`; применить `setup`; если включены CRM-действия — `crm_update_from_fs` (стенд в исходное состояние); `startedAt = Date.now()`.
2. Ход 1 — `task`; ход `i+1` — `answers[i]`; остановка, когда ответы кончились или `maxTurns`. `resume` — `sessionId` из `system_init`/`result`. Песочница — как в `agentSession.ts`: Claude — `sandbox: { readRoots: [appRoot], writeRoots: [pkgRoot] }` и те же `additionalDirectories`, Cursor — `readRoot: appRoot`, `cwd: pkgRoot`. Разрешения — `requestToolPermission: async () => true` (стенд тестовый; сюда доходят только вызовы, которые песочница уже пропустила), каждое — в транскрипт. На `process.platform === "win32"` CLI отказывается запускаться без флага `--allow-unsandboxed-shell` (на Windows у оболочки нет песочницы ОС, а раннер одобряет всё).
3. `toolNames` — из событий `tool_use`; `failedCrmActions` — из `onAction` (`success === false`).
4. `runChecks`; транскрипт (все события и записи `onAction`) — `results/<runId>/<caseId>-<provider>-<run>.jsonl`.
5. Исключение на любом шаге → `passed: false`, `error`.

- [ ] **Step 1: Тесты:** `runCase` с фейковым `QueryFn`, который на первый ход отвечает текстом с `<choices>`, а на второй — `tool_use` `crm_compile`: ходов 2, второй `prompt` равен `answers[0]`, проверка `tool_called crm_compile` прошла, файл транскрипта создан; `maxTurns: 1` → второй ход не делается; `resetPackage` во временном git-репозитории (`git init`, коммит, правка, новый файл) → после вызова правки и нового файла нет; `renderReport` на двух прогонах содержит обе строки и `detail` упавшей проверки; фабрика аргументов запроса (`buildQueryArgs(config, provider)`, экспортировать из `runner.ts`) для Claude возвращает `sandbox.writeRoots === [pkgRoot]` и `sandbox.readRoots === [appRoot]`, для Cursor — `readRoot === appRoot`; разбор CLI с `platform: "win32"` без `--allow-unsandboxed-shell` бросает исключение с текстом про песочницу.
- [ ] **Step 2:** → FAIL. **Step 3:** реализация. **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat(evals): runner, report and CLI`.

### Task 8: Первые кейсы и инструкция

**Files:**
- Create: `packages/evals/cases/01-entity-lookup-column.json`, `02-process-deadline.json`, `03-client-validation.json`, `04-compile-error.json`, `05-db-sql-script.json`
- Create: `packages/evals/README.md` — подготовка (тестовый пакет в git с исходным коммитом, `local.json`, переменные окружения), запуск, что делать с результатом.

Кейсы — по задачам 1, 3, 5, 6, 7 из `tasks_for_test_9.md`, с явными именами создаваемого (`{{prefix}}EvalSource`, `{{prefix}}EvalDeadlineProcess` …), чтобы проверки знали, что искать. Объект и карточка теста — `{{entity}}`, `{{page}}`; C#-схема для поломки — `{{helperCs}}` (из `vars` в `local.json`). Ответы: `["{{package}}", "Делай", "Обнови и скомпилируй"]` (у клиентской валидации — `"Только обнови"`).

Минимальные проверки:
- 01: `lint_clean`, `crm_update_ok`, `crm_compile_ok`, `db_rows` по `information_schema.columns` для колонки, `tool_called pkg_lint`.
- 02: `file_exists Schemas/{{prefix}}EvalDeadlineProcess/metadata.json`, `lint_clean`, `crm_compile_ok`.
- 03: `file_contains Schemas/{{page}}/{{page}}.js` с текстом проверки, `crm_update_ok`, `tool_not_called crm_compile`.
- 04: `setup replace_in_file` (убрать `;`), задача «Конфигурация перестала компилироваться…», ответы `[]`; `crm_compile_ok`, `tool_called crm_compile`.
- 05: `tool_called crm_db_query`, `file_exists SqlScripts/*/descriptor.json`, `crm_update_ok`.

- [ ] **Step 1:** `loadCase` для каждого кейса с `local.example.json` не бросает исключений (тест `cases.test.ts` перебирает папку `cases`).
- [ ] **Step 2:** Проверка обезличивания: `grep -ri` по `packages/evals` на имена проекта из таблицы замен (память `feedback_public_repo_anonymized`) → пусто.
- [ ] **Step 3:** Commit `feat(evals): first five cases and README`.
- [ ] **Step 4 (пользователь):** заполнить `local.json`, `npm run build`, `npm run eval -w @bpmsoft-agent/evals -- --case 04` — первый прогон самого короткого кейса; затем все пять.

## Открытые вопросы (решить до Task 8, Step 4)

1. **Хвосты в БД стенда.** Откат файлов пакета не удаляет из БД схемы, созданные агентом. Пока кейсы используют фиксированные имена, повторный прогон перезаписывает те же схемы. Если этого мало — отдельный стенд для эвалов или восстановление БД из бэкапа docker перед прогоном.
2. **Сценарий ответов.** Ответы идут по порядку; если агент задаст другой вопрос, кейс, скорее всего, упадёт на проверках — это видно по транскрипту. Пользователь-модель — позже, если порядок окажется хрупким.
