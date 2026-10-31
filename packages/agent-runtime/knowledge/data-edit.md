# Данные пакета (Data) — рецепты создания и редактирования

Модель и факты — `data.md`. Общая механика ресурсов и локализации — `metadata-editing.md`. Data не использует `resource.xml` в `Resources/`: локализация — в подпапке `Localization/` самой Data-схемы.

## ✅ Системная настройка и её значение (`SysSettings` + `SysSettingsValue`)
Подтверждено записью в CRM: две Data-схемы, собранные клоном реальных наборов `Data/SysSettings_<Код>` и `Data/SysSettingsValue_<Код>` проекта, загрузились обычным «Обновить из файловой системы»; код прочитал значение через `SysSettings.GetValue<string>`.

**`Data/SysSettings_<Код>/`** — сама настройка (объект `SysSettings`, `27aeadd6-d508-4572-8061-5b55b667c902`):
- `descriptor.json` — как у образца: `UId` (новый), `Name` = `SysSettings_<Код>`, свежий `ModifiedOnUtc`, `InstallType: 0`, `Schema`, `Columns` (9 колонок образца без изменений).
- `data.json` — одна строка `Row`: `Id` (новый GUID — на него ссылается значение), `Code` = `<Код>`, `ValueTypeName` (`"Text"`, `"Integer"`, `"Boolean"`, `"Lookup"` и т.д.), `IsCacheable: true`, `IsSSPAvailable: false`, `IsPersonal: false`, `ReferenceSchemaUId: "null"` (для `Lookup` — UId объекта справочника).
- `Localization/data.ru-RU.json` и `data.en-US.json` — локализуемые колонки той же строки: `Id`, `Name` (`736c30a7-c0ec-4fa9-b034-2552b319b633`), `Description` (`9e53fd7c-dde4-4502-a64c-b9e34148108b`); у каждой ячейки `SchemaColumnUId`, `ColumnName`, `Value`. В `data.json` колонок `Name`/`Description` нет.
- `filter.json` — пустой файл (0 байт).

**`Data/SysSettingsValue_<Код>/`** — значение (объект `SysSettingsValue`, `951b2bbb-0ba3-4049-9a29-b5d4c0b6d50f`):
- `descriptor.json` — как у образца (12 колонок), свой `UId`, `Name` = `SysSettingsValue_<Код>`.
- `data.json` — строка: `Id` (новый), `SysSettings` = `Id` строки настройки, `SysAdminUnit` = `a29a3ba5-4b0d-de11-9a51-005056c00008` («Все сотрудники»), `TextValue` / `IntegerValue` / `BooleanValue` / `FloatValue` / `GuidValue` / `DateTimeValue` — заполняй колонку своего типа, остальные по умолчанию (`0`, `false`, `"null"`), `IsDef: false`, `Position: 2147483647`, `BinaryValue: "null"`.
- `filter.json` — пустой файл.

Генерируй node-скриптом: прочитай дескриптор и `data.json` образца, найди ячейки по `ColumnName` → `ColumnUId` и подставь свои значения. Чтение из кода — `source-code-edit.md`, «Прочитать системную настройку».

✅ Дробная настройка: в `SysSettings_<Код>/data.json` — `ValueTypeName: "Float"`; в `SysSettingsValue_<Код>/data.json` значение — JSON-числом в ячейке `FloatValue` (`b1ffd2d8-2bd3-4c46-b9c0-782afb0996c0`), например `15.00`. Образец — любой набор `SysSettings_*` с `ValueTypeName: "Float"`. Лишнюю локализацию образца (`es-ES`) можно не переносить. После «Обновить из файловой системы» настройка появилась с типом «Дробное число» и значением 15, REST-метод прочитал 15.

### `IsPersonal` и `IsCacheable`

✅ **Персональное и общее значение** (`DataService` под администратором и обычным пользователем): значение — строка `SysSettingsValue`; общее — на «Все сотрудники» (`Position` `2147483647`), персональное — на пользователя (`Position` `0`). Персональная строка перекрывает общую только для своего пользователя. `IsPersonal` влияет на поведение карточки настройки (по умолчанию сохраняется персональное значение); хранение и чтение от него не зависят.
- Запросы: `POST /0/DataService/json/SyncReply/QuerySysSettings` с `{"sysSettingsNameCollection": ["<Код>"]}`; `POST /0/DataService/json/SyncReply/PostSysSettingsValues` с `{"isPersonal": true, "sysSettingsValues": {"<Код>": <значение>}}`. Флаг работает для любой настройки. В ответе смотри `saveResult` по коду: `success: false` при успешной записи — так отвечает сервис.

✅ **Права на системную настройку**: `POST /0/DataService/json/SyncReply/SetSysSettingsRightsRequest` с телом `{"sysSettingsCode": "<Код>", "readOperationCode": "<код операции или пусто>", "readWriteOperationCode": "<код операции>"}`; чтение — `GetSysSettingsRightsRequest`. Хранится в `SysSettingsRights`. Пользователь без операции записи получает `SecurityException` и на общее, и на персональное значение; читать может. Пустые коды удаляют строку. Переносится набором данных: объект `SysSettingsRights` (`5eb3ec0a-6c9b-493c-8b35-8c82d0fbe93c`), колонки `SysSettingsCode`, `ReadOperationCode`, `ReadWriteOperationCode`; действует сразу после «Обновить из файловой системы». Удаление набора строку не удаляет — сними права пустыми кодами.

✅ `IsCacheable` — клиентский кеш: кешируемая настройка приходит со страницей (`BPMSoft.preLoadedSysSettings`), некешируемая читается запросом `QuerySysSettings` при каждом обращении. Делай настройку некешируемой, если её значение меняет сервер (счётчики, даты синхронизации). Сброс серверного кеша — `platform-api.md`, «Кеши и перезапуск».

❌ «Персональная строка, удалённая SQL, перестаёт действовать сразу» — неверно: это сбросило обновление CRM между шагами. После правки `SysSettingsValue` SQL сбрось кеш (`ClearSysSettingsCacheRequest`, `platform-api.md`).

## ✅ Записи справочника с переводом (`<Объект>_data`)
Подтверждено записью в CRM: три записи с названием и описанием на ru/en появились после «Обновить из файловой системы». Факты — `data.md`, «Записи справочника с переводом».

**Файлы `Data/<Объект>_data/`**:
- Имя набора на загрузку не влияет. Префикс `Lookup_<Объект>` занят регистрацией справочника (`registration-edit.md`), поэтому записи называй `<Объект>_data`.
- `descriptor.json`: `UId` (новый), `Name`, свежий `ModifiedOnUtc`, `InstallType: 0`, `Schema` = `{UId, Name}` объекта, `Columns` — по элементу на каждую колонку набора: `ColumnUId` (UId колонки объекта), `ColumnName`, `DataTypeValueUId` (тип), `IsKey` (`true` только у `Id`), `IsForceUpdate` (`false` у `Id`, у остальных `true`). Колонки `BaseLookup`: `Id` `ae0e45ca-c495-4fe7-a39d-3ab7278e1617`, `Name` `736c30a7-c0ec-4fa9-b034-2552b319b633`, `Description` `9e53fd7c-dde4-4502-a64c-b9e34148108b` (тип текста `ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd`), `Id` — тип `23018567-a13c-4320-8687-fd6f9e3699bd`. Таблица типов — `crm-db.md`, «Типы данных».
- `data.json`: `{"PackageData": [{"Row": [{"SchemaColumnUId": "<UId колонки>", "Value": <значение>}, ...]}, ...]}` — по `Row` на запись: `Id` и нелокализуемые колонки. Ячейки без `ColumnName`.
- `Localization/data.ru-RU.json`, `data.en-US.json`: те же записи, в каждой `Row` — `Id` и локализуемые колонки (`Name`, `Description`); ячейки с `SchemaColumnUId`, `ColumnName`, `Value`.
- `filter.json` — пустой файл.

**Как хранится в БД**: основная таблица объекта — значения культуры по умолчанию (ru); переводы — `Sys<Объект>Lcz` (`RecordId`, `SysCultureId`, локализуемые колонки).

## ✅ Изменить данные
Правило `IsForceUpdate` — `data.md`, «IsForceUpdate». Порядок правки:
1. Меняй значение в `data.json` или в `Localization/data.<culture>.json`. Колонка должна иметь `IsForceUpdate: true`, иначе у существующей записи значение не поменяется.
2. Для перевода достаточно поменять одну культуру (✅).
3. Счётчики (`<Объект>LastNumber` и т.п.) — `IsForceUpdate: false`, чтобы обновление пакета не сбрасывало накопленное (✅).
4. Колонка-картинка (Image) — строка base64 в `Value` ячейки `data.json`; тип — `crm-db.md`, «Типы данных» (✅).
5. При любой правке — свежий `ModifiedOnUtc` в `descriptor.json`.

## ✅ Удалить записи данных — только SQL
**Подтверждено записью в CRM**: запись, убранная из `data.json` и обеих `Localization`, после «Обновить из файловой системы» осталась в БД. Data-схемы записи не удаляют ни при удалении строки, ни при удалении всей папки набора. Удалил её SQL-скрипт пакета `SqlScripts/TestSrcDeleteData` (`InstallType: 1`, `DBEngineType: 2`; рецепт — `sql-script-edit.md`), выполнившийся при том же обновлении:
```sql
DELETE FROM public."SysTestSrcEntityLcz" WHERE "RecordId" = '<Id записи>';
DELETE FROM public."TestSrcEntity" WHERE "Id" = '<Id записи>';
```
- Порядок: сначала переводы `Sys<Объект>Lcz` (по `RecordId`), потом запись объекта (по `Id`).
- Убери запись и из файлов данных, иначе при следующей загрузке она вернётся.
- Перед удалением проверь, не ссылаются ли на запись другие таблицы (lookup-колонки); скрипт делай идемпотентным (`DELETE ... WHERE` по `Id`).

## ✅ Создать новый набор данных с нуля — общий рецепт

Подтверждено записью в CRM на справочнике, системной настройке и таблице с колонками-справочниками, числом, логическим и датой.

### Шаг 1: Создать папку набора
```
Pkg/<Пакет>/Data/<Имя>/
```
Готовые образцы наборов — `templates/data/` (`Lookup`, `SysModule`, `SysModuleEdit`, `SysSettings` и др.). Клонируй образец и меняй значения по имени колонки.

### Шаг 2: Создать `descriptor.json`
GUID типов — `crm-db.md`, «Типы данных».
```json
{
  "Descriptor": {
    "UId": "<новый GUID для набора>",
    "Name": "<Имя>",
    "ModifiedOnUtc": "\/Date(<текущее_время_миллисекунды>)\/",
    "InstallType": 0,
    "Schema": {
      "UId": "<UId целевого объекта (Entity-схемы)>",
      "Name": "<Имя целевого объекта>"
    },
    "Columns": [
      {
        "ColumnUId": "<UId колонки Id целевого объекта>",
        "IsForceUpdate": false,
        "IsKey": true,
        "ColumnName": "Id",
        "DataTypeValueUId": "23018567-a13c-4320-8687-fd6f9e3699bd"
      },
      {
        "ColumnUId": "<UId колонки Name целевого объекта>",
        "IsForceUpdate": true,
        "IsKey": false,
        "ColumnName": "Name",
        "DataTypeValueUId": "8b3f29bb-ea14-4ce5-a5c5-293a929b6ba2"
      }
    ]
  }
}
```

### Шаг 3: Выбрать `InstallType`
Значения и факты — `data.md`, «InstallType».

| InstallType | Значение | Поведение | Когда |
|---|---|---|---|
| Install | `0` | строки грузятся при «Обновить из файловой системы» (✅) | обычные данные, справочники, по умолчанию |
| FirstInstall | `1` | строк не добавляет (✅); 🧪 поведение при первой установке не проверено | seed-данные, которые не должны переустанавливаться (🧪) |
| Update | `2` | новые строки не добавляет; существующие обновляет по `IsForceUpdate: true` (✅) | обновить уже существующие записи |

По умолчанию используй `0`. Для данных, которые должны появиться в среде разработки, — только `0`.

### Шаг 4: Создать `data.json`
```json
{
  "PackageData": [
    {
      "Row": [
        { "SchemaColumnUId": "<UId колонки Id>", "Value": "04992e36-958e-476a-8824-06c7192c6eed" },
        { "SchemaColumnUId": "<UId колонки Name>", "Value": "Первая запись" }
      ]
    },
    {
      "Row": [
        { "SchemaColumnUId": "<UId колонки Id>", "Value": "a1234567-890b-4d2f-1234-5678901234cd" },
        { "SchemaColumnUId": "<UId колонки Name>", "Value": "Вторая запись" }
      ]
    }
  ]
}
```

**Правила**:
- Каждая запись в `PackageData` — одна строка таблицы данных.
- В каждой `Row` перечисли все колонки из `Columns` (из `descriptor.json`) в любом порядке.
- `Value`: GUID — строка; текст — строка; число — число (`42`); логическое — `true`/`false` (не строка); пустой lookup — строка `"null"`.
- **Для lookup-колонок `DisplayValue` обязателен** (`data.md`, «DisplayValue»): отображаемое значение записи или `"null"`. Если клонируешь строку с реального набора и меняешь `Value` lookup-ячейки — замени `DisplayValue` на подпись новой записи (или `"null"`), а не удаляй его.
- Дата и время — `"\/Date(<миллисекунды>+0300)\/"`, смещение указывай всегда.

### Шаг 5: Локализация (ЕСЛИ есть локализуемые текстовые колонки)
Если среди колонок есть локализуемые текстовые поля (`Name`, `Description`), создай подпапку `Pkg/<Пакет>/Data/<Имя>/Localization/` и в ней файл на каждую культуру:
```json
{
  "PackageData": [
    {
      "Row": [
        { "SchemaColumnUId": "<UId колонки Id>", "ColumnName": "Id", "Value": "04992e36-958e-476a-8824-06c7192c6eed" },
        { "SchemaColumnUId": "<UId колонки Name>", "ColumnName": "Name", "Value": "Первая запись на русском" }
      ]
    },
    {
      "Row": [
        { "SchemaColumnUId": "<UId колонки Id>", "ColumnName": "Id", "Value": "a1234567-890b-4d2f-1234-5678901234cd" },
        { "SchemaColumnUId": "<UId колонки Name>", "ColumnName": "Name", "Value": "Вторая запись на русском" }
      ]
    }
  ]
}
```
`data.en-US.json` — то же с английскими значениями (`First record in English`, `Second record in English`).

**Правила**:
- Локализуемые колонки (`Name`, `Description`) — ТОЛЬКО в `Localization/data.<culture>.json`, не в `data.json`.
- Нелокализуемые колонки (`Country`, числовые, булевы) — ТОЛЬКО в `data.json`.
- `Id` — и в `data.json`, и в каждом `Localization/data.<culture>.json` (для сопоставления строк).
- В каждой строке файлов `Localization/` — поле `ColumnName` рядом с `SchemaColumnUId`.

### Шаг 6: `filter.json` (необязателен)
```
Pkg/<Пакет>/Data/<Имя>/filter.json
```
Пустой файл или файл с одним переносом строки, как в образцах. Не обязателен: наборы `SysSettings_<Код>` и `SysSettingsValue_<Код>` без него загрузились, значение записалось (✅ подтверждено записью в CRM, `data.md`, «Общее»).

### Шаг 7: Обновить в BPMSoft
«Обновить из файловой системы» в CRM. Данные загрузятся в целевой объект согласно `InstallType`.

**Типичные ошибки при первом создании**:
- Нет `IsKey: true` у колонки `Id` — система не сопоставит записи при повторной установке.
- `InstallType: 1` для данных, которые должны обновляться при каждой установке (обычно нужен `0`).
- `ColumnUId` в `descriptor.json` не совпадает с `SchemaColumnUId` в `data.json` — проверь UId целевого объекта.
- Локализуемые колонки в основном `data.json` вместо `Localization/data.<culture>.json`.
- `ModifiedOnUtc` захардкожен и не совпадает с реальным временем — потом это мешает разбирать историю изменений.
- ✅ подтверждено записью в CRM: набор без `filter.json` загружается (`data.md`, «Общее»).

## ✅ Удалить набор данных целиком
✅ Удаление набора (папки или строк) не удаляет записи в БД. Их удаляет SQL-скрипт пакета (см. «Удалить записи данных — только SQL»).

1. Удалить рекурсивно папку `Pkg/<Пакет>/Data/<Имя>/` (вместе с её подпапкой `Localization/`, если была). Папку в `Resources/` искать не нужно: у Data её нет.
2. Открыть BPMSoft-CRM и нажать «Обновить из файловой системы».
3. Строки в целевой таблице остаются. Убери их SQL-скриптом пакета, иначе данные останутся в БД.

**ПЕРЕД удалением проверить зависимости**: убедиться, что никакие другие пакеты или конфигурация не ссылаются на набор и не полагаются на его строки.
