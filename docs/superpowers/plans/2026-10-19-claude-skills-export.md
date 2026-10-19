# Экспорт скиллов Claude Code в проект стенда — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка в настройках приложения устанавливает в корень стенда `.claude/skills/` и `CLAUDE.md`, собранные из знаний и правил агента, с манифестом и статусом обновления.

**Architecture:** Тексты скиллов лежат в `packages/agent-runtime/claude-export/`; знания копируются из `packages/agent-runtime/knowledge/`; автономный `pkg-lint.js` собирается esbuild из `src/lint`. Логика установки — модуль `src/claudeExport/` в `agent-runtime` (чистые функции над файловой системой, покрыты vitest). Desktop добавляет IPC `claudeSkills:status` / `claudeSkills:install` и блок «Claude Code» в `SettingsMenu`.

**Tech Stack:** TypeScript (commonjs, ES2022), vitest, esbuild 0.21.x, Electron + React (electron-vite).

**Spec:** `docs/superpowers/specs/2026-10-19-claude-skills-export-design.md`

## Global Constraints

- Пути — только `path.join`; относительные пути в манифесте хранятся с разделителем `/` и переводятся в путь через `path.join(root, ...rel.split("/"))`.
- Внешние программы — `execFileSync`/`spawn` без `shell: true`; никаких `$HOME`, `~`, `/tmp` в коде.
- Файлы знаний копируются байт-в-байт (CRLF и BOM сохраняются): `fs.copyFileSync`, не чтение-запись текста.
- Метка своего `CLAUDE.md` — первая строка ровно `<!-- bpmsoft-agent: generated -->`.
- Манифест — `.claude/skills/.bpmsoft-agent.json`; ядро при раздельной записи — `.claude/bpmsoft-agent.md`; строка-импорт — `@.claude/bpmsoft-agent.md`.
- Имена скиллов: `bpm-develop`, `bpm-explain`, `bpm-troubleshoot`, `bpm-entity`, `bpm-client-schemas`, `bpm-process`, `bpm-user-task`, `bpm-source-code`, `bpm-data`, `bpm-sql-script`, `bpm-registration`, папка знаний `bpm-knowledge`.
- Ничего из настроек приложения (адрес CRM, пользователь, ключи, пути) не попадает в устанавливаемые файлы.
- Тексты `claude-export/` обезличены: нет имён проекта, путей, имён пакетов, схем, колонок.
- Правки файлов в этом репозитории делает субагент `haiku-common-agent`; основная сессия перечитывает результат.

## Review Focus

1. Повторная установка поверх уже установленной без изменений: не должна спрашивать подтверждение и не должна менять ничего, кроме даты в манифесте (тест в Task 3).
2. Пользователь удалил установленный файл руками: это не «изменён», установка просто вернёт его без вопроса (тест в Task 3).
3. Посторонний файл внутри `.claude/skills/bpm-knowledge/` или `bpm-develop/`: после установки и после обновления с удалением файлов он на месте (тест в Task 3).
4. В чужом `CLAUDE.md` уже есть строка `@.claude/bpmsoft-agent.md` (повторная установка в раздельном режиме): строка не дублируется, вопрос не задаётся повторно (тест в Task 3).
5. Знания с CRLF и BOM: после установки байты совпадают с источником (тест в Task 3).

---

### Task 1: Автономный pkg-lint

**Files:**
- Create: `packages/agent-runtime/src/lint/pkgLintCli.ts`
- Modify: `packages/agent-runtime/package.json` (devDependency `esbuild` `^0.21.5`, скрипт `build`)
- Test: `packages/agent-runtime/test/pkgLintCli.test.ts`

**Interfaces:**
- Consumes: `lintSchemas(schemaDirs, { knowledgeDir, extraFiles, sqlScriptDirs })`, `listChangedFiles`, `schemaDirsOf`, `sqlScriptDirsOf` из `src/lint`.
- Produces: `runPkgLintCli(argv: string[], defaultKnowledgeDir: string): { code: 0 | 1 | 2; text: string }`; файл `packages/agent-runtime/dist/claude-export/pkg-lint.js` после `npm run build`.

Аргументы CLI: `pkg-lint.js [--knowledge <dir>] [--git <PkgDir>] <путь>...`. Путь с `descriptor.json` в корне — папка схемы (если родитель называется `SqlScripts` — папка SQL-скрипта). Путь с подпапкой `Schemas` или `SqlScripts` — пакет: все подпапки `Schemas/*` и `SqlScripts/*`. `--git <PkgDir>`: `git status --porcelain` через `execFileSync("git", [...], { cwd })`, пути → `schemaDirsOf`/`sqlScriptDirsOf`. Нет путей и нет `--git` — `code 2`, текст с usage. Ошибки lint → `code 1`, иначе `0`. `text` — `report.text`. Значение `knowledgeDir` по умолчанию в бандле — `path.join(__dirname, "..")` (бандл лежит в `bpm-knowledge/scripts/`). Точка входа: `if (require.main === module)` печатает `text` и выходит с `code`.

- [ ] **Step 1: Write the failing tests** — в стиле `test/pkgLint.test.ts` (tmp-Pkg, `write`):
  - `"schema dir with broken JSON gives code 1 and ОШИБКА"`: схема `Schemas/TestE` с битым `metadata.json` → `code === 1`, `text` содержит `ОШИБКА`.
  - `"package path lints every schema"`: две корректные схемы в пакете → `text` содержит `Итого: 0 ошибок`, `code === 0`.
  - `"no paths gives code 2 with usage"`: `runPkgLintCli([], k)` → `code === 2`, `text` содержит `pkg-lint.js`.
  - `"--git takes changed schemas from git status"`: tmp-Pkg — git-репозиторий (`git init`, коммит), изменён один файл схемы с ошибкой → `code === 1`.
- [ ] **Step 2: Run** `npx vitest run test/pkgLintCli.test.ts` в `packages/agent-runtime` — FAIL (модуль не найден).
- [ ] **Step 3: Implement** `runPkgLintCli` в `src/lint/pkgLintCli.ts`. Не экспортировать из `src/lint/index.ts` (CLI не часть API).
- [ ] **Step 4: Run** тесты — PASS.
- [ ] **Step 5: Bundle.** `npm install -D esbuild@^0.21.5 -w @bpmsoft-agent/agent-runtime`; `build` = `tsc -p tsconfig.json && esbuild src/lint/pkgLintCli.ts --bundle --platform=node --target=node18 --outfile=dist/claude-export/pkg-lint.js`.
- [ ] **Step 6: Verify** `npm run build` в `packages/agent-runtime`; затем `node dist/claude-export/pkg-lint.js --knowledge knowledge <tmp-пакет с ошибкой>` печатает `ОШИБКА` и выходит с кодом 1; без аргументов — usage и код 2.
- [ ] **Step 7: Commit** `feat(lint): standalone pkg-lint CLI bundle for Claude Code export`.

### Task 2: Тексты скиллов и ядра

**Files:**
- Create: `packages/agent-runtime/claude-export/CLAUDE.md`
- Create: `packages/agent-runtime/claude-export/skills/<имя>/SKILL.md` для всех 11 скиллов из Global Constraints (кроме `bpm-knowledge`)
- Modify: `CLAUDE.md` репозитория (раздел «Где что лежит»: строка про `claude-export/` и правило синхронизации с `systemPrompt.ts`)
- Test: `packages/agent-runtime/test/claudeExportTexts.test.ts`

**Interfaces:**
- Produces: дерево `claude-export/` — источник для Task 3.

Содержание — по разделам спеки «Общее ядро», «Верхние скиллы», «Подскиллы». Требования к текстам:
- `claude-export/CLAUDE.md` начинается строкой `<!-- bpmsoft-agent: generated -->`, затем ядро; в нём абзац о замене инструментов: `pkg_lint` → `node .claude/skills/bpm-knowledge/scripts/pkg-lint.js <папки схем>`; запросы к БД, обновление из файловой системы, компиляция, проверка в браузере — просит пользователя (SQL готовым текстом); вопросы с вариантами — встроенным инструментом вопросов; запасные пути без git и без node (из спеки, раздел про pkg-lint).
- Пути к знаниям в текстах — относительно корня стенда: `.claude/skills/bpm-knowledge/<файл>`.
- Каждый `SKILL.md` — frontmatter `name` и `description` (третье лицо, «Use when…» с русскими формулировками запросов пользователя), затем тело. Подскилл: когда срабатывает, какие файлы знаний читать и в каком порядке (из индекса знаний в `systemPrompt.ts`), обязательные шаги (скрипт иерархии для клиентских схем, `pkg-lint.js` после записи объекта и процесса).
- `bpm-explain`: ответ языком функционала, «где это в коде» — отдельным списком в конце.
- `bpm-troubleshoot`: три входа из спеки, журналы `Logs/<ГГГГ-ММ-ДД>/` (`Error.log`, `PackagesSynchronization.log`, `Common.log`, `BusinessProcess.log`, `Scheduler.log`), время UTC, `ResourcesCore` — если есть на стенде.
- Description скиллов прогнать через skill-creator на 3–5 типичных запросах на каждый верхний скилл («добавь колонку», «почему не стартует стенд», «как работает согласование заявки», «ошибка в консоли …»).

- [ ] **Step 1: Write the failing test** `claudeExportTexts.test.ts`:
  - `"has core and all skills"`: существуют `claude-export/CLAUDE.md` и `claude-export/skills/<имя>/SKILL.md` для 11 имён.
  - `"core starts with the marker"`: первая строка `CLAUDE.md` === `<!-- bpmsoft-agent: generated -->`.
  - `"each SKILL.md has name matching its folder and a description"`: frontmatter `name: <папка>`, непустой `description`.
  - `"no app-only tools and no absolute paths"`: ни один файл не содержит `crm_db_query`, `crm_update_from_fs`, `crm_compile`, `crm_browser_`, `<choices>`, `/Users/`, `C:\\`, `~/`; строка `pkg_lint` допустима только в `CLAUDE.md` (абзац о замене).
  - `"knowledge links point to existing files"`: каждое упоминание `.claude/skills/bpm-knowledge/<путь>` указывает на существующий файл в `knowledge/` (кроме `scripts/pkg-lint.js`).
- [ ] **Step 2: Run** `npx vitest run test/claudeExportTexts.test.ts` — FAIL.
- [ ] **Step 3: Write texts** по требованиям выше.
- [ ] **Step 4: Run** — PASS. Перечитать все тексты основной сессией; проверить поиском, что нет имён проекта.
- [ ] **Step 5: Commit** `feat(claude-export): CLAUDE.md core and BPMSoft skills for Claude Code`.

### Task 3: Установка, манифест, статус

**Files:**
- Create: `packages/agent-runtime/src/claudeExport/sources.ts`
- Create: `packages/agent-runtime/src/claudeExport/install.ts`
- Create: `packages/agent-runtime/src/claudeExport/index.ts`
- Modify: `packages/agent-runtime/src/index.ts` (`export * from "./claudeExport"`)
- Test: `packages/agent-runtime/test/claudeExport.test.ts`

**Interfaces:**
- Consumes: дерево `claude-export/` (Task 2), `knowledge/`, `dist/claude-export/pkg-lint.js` (Task 1).
- Produces:
```ts
export interface ExportFile { rel: string; source: string } // rel — от корня стенда, через "/"
export interface ExportSources { files: ExportFile[]; core: string /* путь к claude-export/CLAUDE.md */; hash: string }
export function defaultExportSources(): ExportSources // пути от __dirname пакета: ../../knowledge, ../../claude-export, ../claude-export/pkg-lint.js (dist)
export function collectExportSources(dirs: { knowledgeDir: string; exportDir: string; lintBundle: string }): ExportSources

export type ClaudeSkillsStatus =
  | { state: "not-installed" }
  | { state: "installed"; installedAt: string; appVersion: string }
  | { state: "outdated"; installedAt: string; appVersion: string };
export function claudeSkillsStatus(appRoot: string, sources: ExportSources): ClaudeSkillsStatus

export type ClaudeMdChoice = "separate" | "replace";
export type InstallOutcome =
  | { kind: "installed"; written: number; removed: number; target: string }
  | { kind: "needs-claude-md-choice" }
  | { kind: "needs-overwrite-confirm"; modified: string[] };
export function installClaudeSkills(
  appRoot: string,
  sources: ExportSources,
  options: { appVersion: string; claudeMd?: ClaudeMdChoice; overwriteModified?: boolean; now?: () => Date },
): InstallOutcome
```

Правила (из спеки):
- `files`: `claude-export/skills/<имя>/**` → `.claude/skills/<имя>/**`; `knowledge/**` → `.claude/skills/bpm-knowledge/**`; `lintBundle` → `.claude/skills/bpm-knowledge/scripts/pkg-lint.js`. Ядро (`core`) в `files` не входит.
- `hash` — sha256 по отсортированным парам `rel` + sha256 содержимого, включая ядро под `rel` `CLAUDE.md`.
- Манифест: `{ appVersion, installedAt (ISO), hash, claudeMd: "root" | "separate", files: { [rel]: sha256 } }`; ядро записано в `files` под своим фактическим `rel` (`CLAUDE.md` или `.claude/bpmsoft-agent.md`).
- Порядок `installClaudeSkills`: (1) решить ядро: `CLAUDE.md` нет или первая строка — метка → `root`; в манифесте уже `separate` → `separate`; иначе нужен `options.claudeMd`, без него → `needs-claude-md-choice`. (2) Файлы старого манифеста, которые есть на диске и чей sha256 отличается от записанного, → без `overwriteModified` вернуть `needs-overwrite-confirm` со списком `rel`. (3) Записать все файлы (`mkdirSync recursive` + `copyFileSync`); ядро — в `CLAUDE.md` (`root`/`replace`) или `.claude/bpmsoft-agent.md` (`separate`), в последнем случае дописать в чужой `CLAUDE.md` строку `@.claude/bpmsoft-agent.md`, если такой строки нет (сохраняя его перевод строки). (4) Удалить файлы из старого манифеста, которых нет в новом; пустые папки внутри `.claude/skills/bpm-*` после удаления убрать. (5) Записать манифест. `target` — путь к `.claude`.
- `claudeSkillsStatus`: нет/битый манифест → `not-installed`; `hash` манифеста === `sources.hash` → `installed`, иначе `outdated`.

- [ ] **Step 1: Write the failing tests** — фикстуры: tmp `knowledgeDir` (файл с `\r\n` и BOM, `scripts/check-entity.js`), tmp `exportDir` (ядро с меткой, `skills/bpm-develop/SKILL.md`), tmp `lintBundle`, tmp `appRoot`:
  - `"fresh install writes skills, knowledge, lint and root CLAUDE.md"` → `kind "installed"`, файлы на местах, манифест с `claudeMd "root"`.
  - `"status: not-installed → installed → outdated after source change"`.
  - `"knowledge bytes are identical after install"` (CRLF+BOM) — Review Focus 5.
  - `"reinstall without changes needs no confirmation"` — Review Focus 1.
  - `"user-modified installed file requires confirmation, then is overwritten"`.
  - `"deleted installed file is restored without confirmation"` — Review Focus 2.
  - `"file removed from sources is deleted, foreign files stay"` (посторонний файл в `bpm-knowledge/` и `bpm-develop/`) — Review Focus 3.
  - `"foreign CLAUDE.md asks for choice"` → `needs-claude-md-choice`; файл не изменён.
  - `"separate mode writes core aside and adds import once"`: две установки подряд — строка `@.claude/bpmsoft-agent.md` ровно одна, второй раз выбор не нужен — Review Focus 4.
  - `"replace mode overwrites foreign CLAUDE.md with the marked core"`.
  - `"settings.local.json is untouched"`.
- [ ] **Step 2: Run** `npx vitest run test/claudeExport.test.ts` — FAIL.
- [ ] **Step 3: Implement** `sources.ts` (`collectExportSources`, `defaultExportSources`) и `install.ts`.
- [ ] **Step 4: Run** весь `npm test` в `packages/agent-runtime` — PASS; `npm run build` — без ошибок.
- [ ] **Step 5: Commit** `feat(claude-export): install Claude Code skills into the stand with manifest and status`.

### Task 4: Кнопка в настройках приложения

**Files:**
- Modify: `apps/desktop/src/main/index.ts` (два `ipcMain.handle`)
- Modify: `apps/desktop/src/preload/index.ts`, `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/renderer/src/components/SettingsMenu.tsx` (блок «Claude Code» после блока БД/CRM)
- Modify: `apps/desktop/build/afterPack.cjs` (проверка наличия `claude-export` и `dist/claude-export/pkg-lint.js` рядом с проверкой `knowledge`)

**Interfaces:**
- Consumes: `claudeSkillsStatus`, `installClaudeSkills`, `defaultExportSources` из `@bpmsoft-agent/agent-runtime`.
- Produces: `window.api.claudeSkillsStatus(appRoot: string): Promise<ClaudeSkillsStatus>`; `window.api.installClaudeSkills(appRoot: string, options: { claudeMd?: ClaudeMdChoice; overwriteModified?: boolean }): Promise<InstallOutcome>`; IPC-каналы `claudeSkills:status`, `claudeSkills:install` (в main `appVersion` = `app.getVersion()`).

Поведение UI (тексты — дословно):
- Заголовок блока `Claude Code`, подсказка `Скиллы и знания агента для Claude Code в папке проекта (.claude)`.
- Статус: `Не установлены` / `Установлены · <дата установки> · версия <appVersion>` / `Есть обновление · установлены <дата>`. Статус запрашивается при открытии меню и после установки.
- Кнопка: `Установить скиллы в проект` (не установлены) или `Обновить скиллы` (иначе); без `appRoot` неактивна с заметкой `Откройте проект, чтобы установить скиллы`.
- `needs-claude-md-choice` → в блоке вопрос `В проекте уже есть свой CLAUDE.md` и кнопки `Подключить отдельным файлом` (`claudeMd: "separate"`), `Заменить мой CLAUDE.md` (`"replace"`), `Отмена`.
- `needs-overwrite-confirm` → `Изменены вручную, будут перезаписаны:` + список + кнопки `Перезаписать` (`overwriteModified: true`) и `Отмена`.
- `installed` → заметка `Готово: <target>. Чтобы передать коллегам, заархивируйте папку .claude и CLAUDE.md`.
- Ошибка вызова → `popover-error` с `errorText(error)`.

- [ ] **Step 1: Implement** IPC, preload и типы.
- [ ] **Step 2: Implement** блок в `SettingsMenu.tsx` по образцу проверки подключения к БД (состояния `useState`, `popover-section`, `popover-note`, `popover-error`).
- [ ] **Step 3: Implement** проверку в `afterPack.cjs`.
- [ ] **Step 4: Verify** `npm run build -w @bpmsoft-agent/agent-runtime && npm run typecheck -w @bpmsoft-agent/desktop && npm test -w @bpmsoft-agent/desktop` — без ошибок.
- [ ] **Step 5: Commit** `feat(desktop): install Claude Code skills from settings`.

### Task 5: Ручная проверка на стенде (пользователь)

- [ ] **Step 1:** `npm run dev -w @bpmsoft-agent/desktop`, открыть стенд, «Настройки» → «Установить скиллы в проект». Ожидание: `.claude/skills/bpm-*`, `.claude/skills/.bpmsoft-agent.json`; `settings.local.json` не изменён; `CLAUDE.md` — по выбору.
- [ ] **Step 2:** повторное нажатие — статус «Установлены», без вопросов.
- [ ] **Step 3:** в корне стенда запустить `claude` и проверить срабатывание: «добавь в объект <Объект> колонку …» → `bpm-develop` (+ `bpm-entity`), остановка на плане; «как сейчас работает <функционал>» → `bpm-explain`, без правок; «стенд не стартует, посмотри логи» → `bpm-troubleshoot`, чтение `Logs/<последняя дата>/`.
- [ ] **Step 4:** `node .claude/skills/bpm-knowledge/scripts/pkg-lint.js BPMSoft.Configuration/Pkg/<Пакет>` на стенде — отчёт без падения.
- [ ] **Step 5:** найденное — правки текстов (Task 2) и наблюдения в `BACKLOG.md`.
