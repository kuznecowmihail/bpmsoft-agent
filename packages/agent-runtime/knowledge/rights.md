# Права доступа: по операциям, по записям, по колонкам, системные операции — факты

Рецепты — `rights-edit.md`. Флаги «По операциям», «По колонкам», «По записям» у объекта (`D15`, `D16`, `D17`) — `entity.md`. Проверка прав в коде — `platform-api.md`.

✅ — подтверждено на стенде (21.10.2026): обычный пользователь из роли «Все сотрудники» и системный администратор, запросы через DataService под каждым из них.

## Администрирование по операциям
- ✅ Включение: `"D15": true` в `metadata.json` объекта и `"AdministratedByOperations": "True"` в `properties.json`; обновление и компиляция. Отдельной таблицы не создаётся: права лежат в общей `SysEntitySchemaOperationRight`.
- ✅ `SysEntitySchemaOperationRight` (UId объекта `f028c2c5-facc-4109-8cfa-75b2b6620527`, родитель `SysBaseSchemaOperationRight`): `SubjectSchemaUId` (UId объекта), `SysAdminUnit` (пользователь или роль), `CanRead`, `CanAppend`, `CanEdit`, `CanDelete` (логические), `Position`.
- ✅ Без строк прав у объекта обычный пользователь: чтение — `success: true` и 0 строк (без ошибки, данные просто пустые); добавление, изменение, удаление — ошибка «Недостаточно прав для добавления записи в объект "<Объект>"» (для изменения и удаления — «…изменения записи в объекте…», «…удаления записи в объекте…»; в OData — HTTP 500).
- ✅ Права загружаются данными пакета и действуют сразу, без компиляции и перезапуска (`rights-edit.md`).
- ✅ Администраторы обходят права по операциям системными операциями `CanSelectEverything`, `CanInsertEverything`, `CanUpdateEverything`, `CanDeleteEverything` («Просмотр / Добавление / Изменение / Удаление любых данных»); на стенде они выданы ролям «Системные администраторы», Administrator, Developer, `CanSelectEverything` — ещё «Аудитор ИБ».
- ✅ Флаги в коде (`SchemaOperationRightLevels`): `None` 0, `CanRead` 1, `CanAppend` 2, `CanEdit` 4, `CanDelete` 8, `All` 15.

## Администрирование по записям
- ✅ Включение: `"D17": true` в `metadata.json` объекта и `"AdministratedByRecords": "True"` в `properties.json`. Таблица прав `Sys<Объект>Right` создаётся уже при «Обновить из файловой системы», до компиляции.
- ✅ Колонки `Sys<Объект>Right`: `RecordId`, `SysAdminUnitId` (пользователь или роль), `Operation`, `RightLevel`, `Position`, `SourceId`.
- ✅ `Operation`: 0 — чтение, 1 — изменение, 2 — удаление. `RightLevel`: 0 — запрещено, 1 — разрешено, 2 — разрешено с правом передачи (справочник `SysEntitySchemaRecOprRightLvl`).
- ✅ `SourceId` → `SysEntitySchemaRecRightSource`: `Author` `4220cfba-0514-44ce-add0-109b54b52084` (права автора), `Default` `f41e0268-e324-4228-9e9e-5cb7cc906398` (по правилу по умолчанию), `Manual` `8a248a03-e9a5-df11-9989-485b39c18470` (выдано вручную или из кода), `Owner` `66ea17f7-df1d-4058-91ca-09a2057deae8`.
- ✅ После включения у существующих записей строк прав нет: обычный пользователь не видит ни одной записи, системный администратор видит все.
- ✅ Новая запись, созданная через сущность (карточка, `Entity.Save`, OData), получает права автора: чтение, изменение и удаление с уровнем 2, источник `Author`.
- ✅ Запись, вставленная запросом `Insert` (без событий объекта, с пустым `CreatedBy`), не получает строк прав ни при создании, ни при актуализации — её видят только администраторы. При администрировании по записям создавай записи через сущность или выдавай права явно.
- ✅ Выключение (`D17` убран, `AdministratedByRecords` = `"False"`, обновление и компиляция) сразу возвращает обычным пользователям все записи. Таблица `Sys<Объект>Right`, её строки и правила в `SysEntitySchemaRecordDefRight` остаются в БД; удаление набора данных или скрипта из пакета их не удаляет — убирай SQL-скриптом.

## Права по умолчанию (правила раздачи по автору)
- ✅ Таблица `SysEntitySchemaRecordDefRight`: `SubjectSchemaUId` (UId объекта), `AuthorSysAdminUnitId` (роль автора записи), `GranteeSysAdminUnitId` (кому выдать), `Operation`, `RightLevel`, `Position` — коды как выше. В интерфейсе — «Раздача прав в зависимости от автора записи» в настройке прав объекта.
- ✅ Правило применяется к записи, у которой автор (`CreatedBy`) состоит в роли `AuthorSysAdminUnitId`; права выдаются с источником `Default`.
- ❌ Привязать правило данными пакета нельзя: колонки `Operation` и `RightLevel` объявлены справочниками, а в БД — числа. Значение числом даёт `InvalidCastException: Unable to cast object of type 'System.Int64' to type 'System.String'`, строкой — «Данные для колонки "Operation" … имеют не корректный формат»; тип колонки «Целое число» в наборе — те же ошибки. Правило задают SQL-скриптом пакета (`rights-edit.md`).
- ✅ Актуализация прав по записям (кнопка «Актуализировать права по записям» в настройке прав объекта) — процесс `ObjectRecordRightsActualizationProcess` с параметром `EntitySchemaUId`. Раздаёт права автора и права по правилам всем записям с заполненным `CreatedBy`. Вызов: `POST <CRM>/ServiceModel/ProcessEngineService.svc/RunProcess`, тело `{"schemaName": "ObjectRecordRightsActualizationProcess", "parameterValues": [{"name": "EntitySchemaUId", "value": "<UId объекта>"}]}`; из C# — `ProcessExecutor.Execute("ObjectRecordRightsActualizationProcess", <параметры>)` (🧪 из C# не проверено). Процесс асинхронный: завершение видно в журнале процессов (`processes.md`).

## Права на запись из кода
- ✅ `UserConnection.DBSecurityEngine.SetEntitySchemaRecordRightLevel(<Id пользователя или роли>, "<Объект>", <Id записи>, EntitySchemaRecordRightOperation.Read, EntitySchemaRecordRightLevel.Allow)` (`using BPMSoft.Core.Configuration;`) — добавляет строку прав с источником `Manual`, возвращает её Id. Значения: `EntitySchemaRecordRightOperation.Read|Edit|Delete`, `EntitySchemaRecordRightLevel.Deny|Allow|AllowAndGrant`. Последний необязательный параметр `useDenyRecordRights` = `true`.
- ✅ `DBSecurityEngine.GetEntitySchemaRecordRightLevel("<Объект>", <Id записи>)` — права текущего пользователя; перегрузка `(<Id пользователя>, "<Объект>", <Id записи>)` — для другого пользователя. Результат — флаги `SchemaRecordRightLevels`: `None`, `CanRead`, `CanEdit`, `CanDelete`, `All` и др. Системный администратор получает `All`.

## Системные операции
- ✅ `SysAdminOperation` (наследник `BaseCodeLookup`): `Code` (колонка `2aec9cef-232e-413a-9a5a-9ddde2e8a2af`), локализуемые `Name`/`Description`, `UseSystemOperationRestrictions`, `SysFolder`. UId объекта — `c8fd2fd0-1f44-48c7-84e4-045250b9a638`.
- ✅ `SysAdminOperationGrantee`: `SysAdminOperation`, `SysAdminUnit` (пользователь или роль), `CanExecute` (булево), `Position`. UId объекта — `3987bdc6-38bb-4b41-bcf7-90bb3995117a`.
- ✅ Новую операцию без строк в `SysAdminOperationGrantee` не может выполнить никто, в том числе системный администратор: `GetCanExecuteOperation` → `false`, `CheckCanExecuteOperation` → `SecurityException` «Текущий пользователь не имеет прав на запуск администрируемой операции с кодом "<Код>"». Выдай операцию нужным ролям, включая администраторов.
- ✅ Выдача применяется сразу после загрузки данных, без перезапуска.
- ✅ Проверка для другого пользователя или роли: `DBSecurityEngine.GetCanExecuteOperation("<Код>", <Id пользователя или роли>)`.

## Администрирование по колонкам
- ✅ Включение: `"D16": true` в `metadata.json` и `"AdministratedByColumns": "True"` в `properties.json`; обновление и компиляция.
- ✅ **Права на колонки — белый список.** После включения все несистемные колонки объекта закрыты для всех, кроме администраторов: без строк в `SysEntitySchemaColumnRight` обычный пользователь получает пустые значения всех колонок (видны только `Id` и системные, например `CreatedOn`); реестр показывает строки с пустыми ячейками. Открывай каждую нужную колонку явно (уровень 2 — чтение и изменение). Изменения строк прав действуют сразу, без компиляции и перезапуска.
- ✅ Таблица `SysEntitySchemaColumnRight`: `SubjectSchemaUId` (UId объекта), `SubjectColumnUId` (UId колонки из `metadata.json` объекта), `SysAdminUnitId`, `RightLevel`, `Position`. Своего объекта-схемы у таблицы нет, есть только представление `VwSysEntitySchemaColumnRight`; привязка данных через представление 🧪 не проверялась. Проверенный путь — SQL-скрипт (`rights-edit.md`).
- ✅ `RightLevel` (`EntitySchemaColumnRightLevel`): 0 — нет доступа, 1 — только чтение, 2 — чтение и изменение (3 — `All`).
- ✅ Чтение колонки без доступа проходит без ошибки, значение подменяется пустым: DataService отдаёт `""`, OData — значение по умолчанию типа (для даты `0001-01-01T00:00:00Z`). Внешняя интеграция примет его за настоящее значение — предупреждай об этом.
- ✅ Изменение колонки с уровнем 0 или 1 — ошибка «Недостаточно прав для изменения значения колонки "<Заголовок колонки>" объекта "<Заголовок объекта>"» (в OData — HTTP 500), значение в БД не меняется.
- ✅ Системный администратор видит и меняет такие колонки, даже если состоит в роли с ограничением.
- ✅ Карточка Classic UI поля не скрывает и не блокирует: закрытое поле показывается пустым, поле «только чтение» — со значением; оба доступны для ввода. При сохранении с изменённым запрещённым полем — окно «Недостаточно прав для изменения значения колонки "<Заголовок>" объекта "<Заголовок>"», запись не сохраняется. Реестр показывает колонку без доступа пустой.
- ✅ Если пользователь меняет только разрешённые поля, сохранение проходит, и закрытая колонка в БД не затирается пустым значением (карточка отправляет только изменённые колонки).
