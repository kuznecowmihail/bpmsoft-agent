# SQL-скрипт пакета (SqlScript) — рецепты создания и правки

Модель, поля и факты выполнения — `sql-script.md`. Скрипт — самый простой тип схемы: нет `metadata.json`, `properties.json` и ресурсов. Механика `ModifiedOnUtc` — `metadata-editing.md`.

## ✅ Новый скрипт и его выполнение
- ✅ Подтверждено 02.10.2026 (`TestDeactivateTimerProcess`): два файла, созданные вручную, выполнились после «Обновить из файловой системы» без ручного запуска. Когда и при каком `ModifiedOnUtc` выполняется повторно — `sql-script.md`, «Выполнение».
- PL/pgSQL-блок `DO $$ DECLARE ... BEGIN ... END $$;` работает. Делай скрипт идемпотентным (`IF NOT EXISTS`, `DELETE ... WHERE`): повторные запуски не должны ломать данные.
- ✅ Простые `DELETE ... WHERE` и `UPDATE ... WHERE` без блока `DO` тоже работают (05.10.2026, 06.10.2026).
- ✅ `CREATE TEMP TABLE ... ON COMMIT DROP` внутри `DO $$` работает (15.10.2026).
- ✅ Скрипт обновляет переводы справочника — таблицу `Sys<Объект>Lcz` (`RecordId`, `SysCultureId`, `Name`, `Description`): `Description` в ru-RU и en-US изменился при первом «Обновить из файловой системы» (подтверждено в БД, 15.10.2026; в интерфейсе не проверялось). Меняешь локализуемую колонку справочника — обновляй обе таблицы. Для переводов сначала предпочти набор данных с `IsForceUpdate` (`data-edit.md`, «Изменить данные»).
- ✅ Скрипт и новая колонка объекта в одном обновлении (15.10.2026): колонка уже есть в БД, но скрипт этого обновления её ещё не видел; проверка через `information_schema.columns` в первом обновлении ничего не сделала. После смены `ModifiedOnUtc` и повторного обновления скрипт заполнил колонку. Такой скрипт делай с проверкой и запускай повторно сменой `ModifiedOnUtc`. 🧪 Порядок «скрипты раньше структуры объектов» выведен из этих фактов и отдельно не проверен.
- ✅ Меняя логику скрипта, всегда обновляй и `ModifiedOnUtc` (06.10.2026: смена текста вместе с `ModifiedOnUtc` выполнила новый текст). Условие `WHERE` на пустое значение не даёт затереть уже заполненное при повторном запуске. Смена только текста не выполнит скрипт (✅ подтверждено записью в CRM (29.10.2026), `sql-script.md`, «Выполнение»).
- При `INSERT`/`UPDATE` строковые и логические колонки в PostgreSQL — `NOT NULL`: пустое значение пиши `''`, а не `NULL` (`crm-db.md`, «Колонки в PostgreSQL»).

Пример из 02.10.2026 — `descriptor.json` и `.sql`:
```json
{
  "SqlScript": {
    "UId": "<UId скрипта>",
    "Name": "TestDeactivateTimerProcess",
    "DBEngineType": 2,
    "InstallType": 1,
    "ModifiedOnUtc": "\/Date(<ModifiedOnUtc>)\/",
    "DependsOn": []
  }
}
```
`TestDeactivateTimerProcess.sql`:
```sql
/*
	Test шаг 14: деактивировать тестовый таймерный процесс TestProcTimer.
	Что делает скрипт:
	строка в SysProcessDisabled + удаление заданий Quartz процесса (job_group = UId процесса).
*/
DO $$
DECLARE
	ProcessName CONSTANT text := 'TestProcTimer';
	ProcessSchedulerName CONSTANT text := 'BPMCRMQuartzScheduler';
	ProcessId uuid;
	ProcessUId uuid;
BEGIN
	SELECT "Id", "UId"
	INTO ProcessId, ProcessUId
	FROM public."SysSchema"
	WHERE "Name" = ProcessName AND "ManagerName" = 'ProcessSchemaManager'
	LIMIT 1;
	IF ProcessId IS NOT NULL THEN
		IF NOT EXISTS (SELECT 1 FROM public."SysProcessDisabled" WHERE "SysSchemaId" = ProcessId) THEN
			INSERT INTO public."SysProcessDisabled" ("Name", "SysSchemaId") VALUES (ProcessName, ProcessId);
		END IF;
		DELETE FROM public.qrtz_triggers WHERE sched_name = ProcessSchedulerName AND job_group = ProcessUId::text;
		DELETE FROM public.qrtz_job_details WHERE sched_name = ProcessSchedulerName AND job_group = ProcessUId::text;
	END IF;
END $$;
```

## Создать новый SQL-скрипт с нуля

### Шаг 1: Создать папку схемы
```
Pkg/<Пакет>/SqlScripts/<ИмяСкрипта>/
```
Имя папки совпадает с `Name` (только латиница, цифры, подчёркивание).

### Шаг 2: Создать `descriptor.json`
КЛЮЧЕВОЙ МОМЕНТ: корневой ключ `"SqlScript"`, не `"Descriptor"`.

```json
{
  "SqlScript": {
    "UId": "<новый GUID для скрипта>",
    "Name": "<ИмяСкрипта>",
    "DBEngineType": 2,
    "InstallType": 1,
    "ModifiedOnUtc": "\/Date(<текущее_время_миллисекунды>)\/",
    "DependsOn": []
  }
}
```

- `UId` — свежий уникальный GUID; `Name` — как у папки.
- `DBEngineType` — `2` (PostgreSql) для PostgreSQL-стендов. `0` (MSSql) — только если проект работает на SQL Server.
- `InstallType` — значения и смысл в `sql-script.md`, «descriptor.json». По умолчанию `1` (AfterPackage). Если сомневаешься — выбирай `1`.
- `ModifiedOnUtc` — текущее время (`date +%s000`), не захардкоженное.
- `DependsOn` — обычно `[]`. Если скрипт должен выполниться после другого: `[ { "UId": "<UId скрипта>", "Name": "<имя скрипта>" } ]`. Порядок соблюдается (`sql-script.md`). Без зависимостей порядок — по алфавиту имён, на него не полагайся.

### Шаг 3: Создать `<ИмяСкрипта>.sql`
Сырой SQL-текст.

- Простой `UPDATE` с подзапросом — пример в `sql-script.md`, «.sql-файл».
- PL/pgSQL-блок (🧪 шаблон с плейсхолдерами, в таком виде не выполнялся; таблицы и колонки бери из метаданных проекта, `crm-db.md`):
  ```sql
  DO $$
  DECLARE
      v_id uuid;
  BEGIN
      SELECT "Id" INTO v_id FROM "<ТаблицаИсточник>" WHERE "<КолонкаИсточник>" = '<Значение1>' LIMIT 1;
      IF v_id IS NOT NULL THEN
          UPDATE "<ТаблицаЦель>" SET "<КолонкаСсылка>" = v_id WHERE "<КолонкаЦель>" = '<Значение2>';
      END IF;
  END;
  $$ LANGUAGE plpgsql;
  ```
- Таблица и индекс (🧪):
  ```sql
  CREATE TABLE IF NOT EXISTS "MyNewTable" (
      "Id" UUID PRIMARY KEY,
      "Name" VARCHAR(255) NOT NULL,
      "CreatedOn" TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX "IX_MyNewTable_Name" ON "MyNewTable" ("Name");
  ```
  ⚠️ Таблицы объектов создаёт Entity-схема (`entity-edit.md`). `CREATE TABLE` в скрипте — только для служебных таблиц вне объектов.
- MSSql (`DBEngineType: 0`): тот же запрос в диалекте T-SQL, квадратные скобки вместо двойных кавычек.

### Шаг 4: Обновить в BPMSoft
«Обновить из файловой системы». Новый скрипт с `InstallType: 1` выполняется в этом же обновлении (✅ 02.10.2026, `sql-script.md`, «Выполнение»).

**ИТОГО: два файла в папке:**
```
Pkg/<Пакет>/SqlScripts/<ИмяСкрипта>/
├── descriptor.json     (ключ "SqlScript", без metadata/properties)
└── <ИмяСкрипта>.sql   (сырой SQL-текст)
```

Ресурсов и локализации нет (`sql-script.md`, «Ресурсы»).

## ✅ Удалить SQL-скрипт

1. Удалить рекурсивно папку `Pkg/<Пакет>/SqlScripts/<ИмяСкрипта>/` (в ней только `descriptor.json` и `.sql`).
2. Открыть BPMSoft-CRM и нажать «Обновить из файловой системы».
3. Скрипт пропадает из реестра пакета.

✅ Подтверждено 05.10.2026 на `TestDeactivateTimerProcess`: удалён вместе с другими схемами за одно «Обновить из файловой системы», без ошибок.

**ПЕРЕД удалением** — проверь, не ссылаются ли на скрипт другие скрипты через `DependsOn` (на практике встречается редко).
