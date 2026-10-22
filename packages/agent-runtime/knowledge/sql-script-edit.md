# SQL-скрипт пакета (SqlScript) — рецепты создания/редактирования

Общая механика `ModifiedOnUtc` — см. `metadata-editing.md`. **Важное уточнение**: SQL-скрипт — это САМЫЙ ПРОСТОЙ тип схемы: **НЕТ metadata.json, НЕТ properties.json, НЕТ ресурсов/локализации вообще** (см. `sql-script.md`). Правила про обязательную локализацию на 2 языка **НЕ применимы** к этому типу.

**Не забывай про обязательное правило из `metadata-editing.md`: `ModifiedOnUtc` в `descriptor.json` должно обновляться при любом создании новой схемы на РЕАЛЬНЫЙ текущий момент времени в формате `"\/Date(<миллисекунды>)\/"` (получить можно через `date +%s000`).**

## ✅ Подтверждено записью: новый SQL-скрипт выполняется сам при «Обновить из файловой системы»
**Подтверждено 02.10.2026** на `TestDeactivateTimerProcess`: два файла, созданные вручную, после «Обновить из файловой системы» скрипт выполнился автоматически, без ручного запуска из «Конфигурации» — в БД появилась строка `SysProcessDisabled`, процесс стал неактивным.

- `InstallType: 1` (AfterPackage), `DBEngineType: 2` (PostgreSql), `DependsOn: []`.
- PL/pgSQL-блок `DO $$ DECLARE ... BEGIN ... END $$;` работает. Делай скрипт идемпотентным (`IF NOT EXISTS`, `DELETE ... WHERE`): повторные запуски при следующих обновлениях не должны ломать данные.
- ✅ Простые `DELETE ... WHERE` без блока тоже работают (05.10.2026, `TestSrcDeleteData` — удаление записи справочника и её переводов, см. `data-edit.md`, «Удалить записи данных — только SQL»).
- ✅ `CREATE TEMP TABLE ... ON COMMIT DROP` внутри `DO $$` работает (15.10.2026).
- ✅ Скрипт обновляет и переводы справочника на BaseLookup — таблицу `Sys<Объект>Lcz` (`RecordId`, `SysCultureId`, `Name`, `Description`): `Description` в строках ru-RU и en-US изменился при первом «Обновить из файловой системы» (подтверждено в БД, 15.10.2026; в интерфейсе не проверялось). Меняешь локализуемую колонку справочника — обновляй обе таблицы.
- ✅ **Скрипт и новая колонка объекта в одном обновлении** (15.10.2026): после «Обновить из файловой системы» новая колонка уже есть в БД (до компиляции), но скрипт, выполненный в этом же обновлении, её ещё не видел — скрипт с проверкой `information_schema.columns` в первом обновлении ничего не сделал, а после смены `ModifiedOnUtc` и повторного обновления заполнил колонку. Скрипт, который читает или пишет новую колонку, делай с такой проверкой и запускай повторно сменой `ModifiedOnUtc`. 🧪 Порядок «скрипты раньше структуры объектов» внутри одного обновления выведен из этих двух фактов и отдельно не проверялся.
- ✅ Когда скрипт выполняется (05.10.2026, `TestSqlRunCounter` — каждый запуск добавлял строку в тестовую таблицу): при первом «Обновить из файловой системы» после создания — да; при следующих обновлениях без изменений — нет (после двух таких обновлений строка одна); после смены только `ModifiedOnUtc` в `descriptor.json` (текст `.sql` тот же) — выполнился снова. Чтобы перезапустить скрипт — обнови `ModifiedOnUtc`; скрипт всё равно делай идемпотентным.
- ✅ Простой `UPDATE ... WHERE` без блока `DO` тоже работает (06.10.2026, `TestDeliveryType_FillDescription`, `InstallType 1`, PostgreSQL): заполнил описание у записей справочника, где оно пустое.
- ✅ Смена текста скрипта (06.10.2026, тот же скрипт): поменяли текст `.sql` и одновременно `ModifiedOnUtc` — при следующем «Обновить из файловой системы» скрипт выполнился заново и уже с новым текстом (новая пустая запись получила «Заполнено скриптом v2», записи с первого прогона сохранили прежнее значение благодаря условию `WHERE` на пустое описание). Меняя логику скрипта, всегда обновляй и `ModifiedOnUtc`. Выполнится ли скрипт после смены только текста, без `ModifiedOnUtc`, — не проверено.

`descriptor.json`:
```json
{
  "SqlScript": {
    "UId": "38512838-bf4b-4b9e-a72b-7ec1f5eed3d9",
    "Name": "TestDeactivateTimerProcess",
    "DBEngineType": 2,
    "InstallType": 1,
    "ModifiedOnUtc": "\/Date(1790937080000)\/",
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

## Создать новый SQL-скрипт с нуля — подробно (структура ✅, см. раздел выше)

Общая структура ниже подтверждена записью (см. раздел ✅ выше); отдельные пояснения остаются выводами из анализа 306 примеров. Структурно рецепт правдоподобен — самая простая из всех процедур на платформе.

### Шаг 1: Создать папку схемы

```
Pkg/<Пакет>/SqlScripts/<ИмяСкрипта>/
```

Имя папки совпадает с именем скрипта в `Name` (только латиница/цифры/подчёркивание).

### Шаг 2: Создать `descriptor.json`

**КЛЮЧЕВОЙ МОМЕНТ: корневой ключ `"SqlScript"`, а не `"Descriptor"`.**

```json
{
  "SqlScript": {
    "UId": "<новый GUID для самого скрипта>",
    "Name": "<ИмяСкрипта>",
    "DBEngineType": 2,
    "InstallType": 1,
    "ModifiedOnUtc": "\/Date(<текущее_время_миллисекунды>)\/",
    "DependsOn": []
  }
}
```

**Пояснения:**

- `UId` — свежий, уникальный GUID.
- `Name` — совпадает с именем папки.
- `DBEngineType` — в большинстве проектов используется `2` (PostgreSql). Используй `0` (MSSql) только если проект явно работает на SQL Server и нужна совместимость с MSSql.
- `InstallType` — **выбери правильное значение по назначению скрипта**:
  - `0` = BeforePackage (скрипт должен выполниться ДО установки пакета) — редко, используется для предварительной подготовки БД, если нужно.
  - `1` = AfterPackage (скрипт выполняется ПОСЛЕ установки пакета) — **самый частый случай** (~81% проекта), обычная миграция/фикс данных после развёртывания.
  - `2` = AfterSchemaData (скрипт выполняется после установки данных схемы пакета) — (~8% проекта), используется когда скрипт зависит от данных, которые должны быть установлены схемой.
  - `3` = UninstallApp (скрипт выполняется при удалении приложения/пакета) — очень редко, используется для очистки данных при удалении.
  
  **Правило большого пальца**: если сомневаешься — выбирай `1` (AfterPackage).

- `ModifiedOnUtc` — ВСЕГДА актуальное время (не захардкодированное). Получить через `date +%s000`.
- `DependsOn` — обычно `[]`. Если скрипт должен выполниться после другого скрипта (создаёт таблицу, заполняет данные), укажи его: `"DependsOn": [ { "UId": "<UId скрипта>", "Name": "<имя скрипта>" } ]` — ✅ порядок соблюдается (`sql-script.md`). Без зависимостей скрипты идут по алфавиту имён — на это не полагайся.

### Шаг 3: Создать `<ИмяСкрипта>.sql`

Сырой SQL-текст. Примеры:

**Простой UPDATE (PostgreSql):**
```sql
UPDATE "AdminUnitFeatureState"
SET "FeatureState" = 1
WHERE "FeatureId" = (
    SELECT "Id" from "Feature" WHERE "Code" = 'EnableThemeSwitcher'
)
```

**Сложный PL/pgSQL-блок (PostgreSql):**
```sql
DO $$ 
DECLARE
    v_user_id UUID;
BEGIN
    SELECT "Id" INTO v_user_id FROM "Contact" WHERE "Name" = 'Admin' LIMIT 1;
    
    IF v_user_id IS NOT NULL THEN
        UPDATE "AdminUnit" SET "HeadId" = v_user_id WHERE "Name" = 'System';
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**Создание таблицы/индекса:**
```sql
CREATE TABLE IF NOT EXISTS "MyNewTable" (
    "Id" UUID PRIMARY KEY,
    "Name" VARCHAR(255) NOT NULL,
    "CreatedOn" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX "IX_MyNewTable_Name" ON "MyNewTable" ("Name");
```

**Для MSSql (если используется):**
```sql
UPDATE [AdminUnitFeatureState]
SET [FeatureState] = 1
WHERE [FeatureId] = (
    SELECT [Id] FROM [Feature] WHERE [Code] = 'EnableThemeSwitcher'
)
```

### Шаг 4: Обновить пакет в BPMSoft

Открыть BPMSoft-CRM и нажать "Обновить из файловой системы" (Update from file system). SQL-скрипт будет зарегистрирован и выполнен при следующей установке/обновлении пакета.

**ИТОГО: ДВА файла в папке:**
```
Pkg/<Пакет>/SqlScripts/<ИмяСкрипта>/
├── descriptor.json     (ключ "SqlScript", без metadata/properties)
└── <ИмяСкрипта>.sql   (сырой SQL-текст)
```

**Никаких ресурсов, никакой локализации** — это главное отличие от всех остальных типов схем.

## ✅ Удалить SQL-скрипт

Процедура простая — только папка скрипта, ресурсов нет:

1. Удалить рекурсивно папку:
   ```
   Pkg/<Пакет>/SqlScripts/<ИмяСкрипта>/
   ```
   (В этой папке только `descriptor.json` и `.sql`-файл — других ресурсов нет.)

2. Открыть BPMSoft-CRM и нажать "Обновить из файловой системы"

3. Скрипт пропадает из реестра пакета

✅ Подтверждено 05.10.2026 на `TestDeactivateTimerProcess`: удалён вместе с другими схемами за одно «Обновить из файловой системы», без ошибок.

**ПЕРЕД удалением** — убедиться, что никаких других SQL-скриптов не ссылаются на удаляемый через поле `DependsOn` (хотя на практике это встречается редко).
