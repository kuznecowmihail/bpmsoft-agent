# Права доступа — рецепты

Факты и коды — `rights.md`.

## ✅ Включить администрирование по записям у своего объекта
**Подтверждено записью в CRM (21.10.2026).**
- `metadata.json` объекта: `"D17": true` (в построчном формате — строка `= MetaData.Schema.D17 true`); `properties.json`: `"AdministratedByRecords": "True"`; `ModifiedOnUtc` в `descriptor.json`.
- «Обновить из файловой системы» создаёт таблицу `Sys<Объект>Right`, затем компиляция.
- Предупреди пользователя: у существующих записей прав нет — обычные пользователи перестанут их видеть, пока права не актуализированы (рецепт ниже).
- Выключить: убери `D17`, верни `"AdministratedByRecords": "False"`, обнови и скомпилируй. Строки прав, правила и системные операции, загруженные данными, остаются в БД — удаляй их SQL (`DELETE` из `SysAdminOperationGrantee`, `SysAdminOperationLcz`, `SysAdminOperation`, `SysEntitySchemaRecordDefRight`) с подтверждением пользователя.

## ✅ Права по умолчанию — SQL-скриптом пакета
**Подтверждено записью в CRM (21.10.2026).** Данными пакета это не привязать (`rights.md`). Скрипт по `sql-script-edit.md`, `InstallType: 1`, PostgreSQL; идемпотентный:
```sql
DO $$
DECLARE
	schemaUId UUID := '<UId объекта>';
	authorUnit UUID := '<Id роли автора>';     -- например «Все сотрудники» a29a3ba5-4b0d-de11-9a51-005056c00008
	granteeUnit UUID := '<Id роли получателя>';
BEGIN
	DELETE FROM "SysEntitySchemaRecordDefRight"
		WHERE "SubjectSchemaUId" = schemaUId
		AND "AuthorSysAdminUnitId" = authorUnit
		AND "GranteeSysAdminUnitId" = granteeUnit;
	INSERT INTO "SysEntitySchemaRecordDefRight"
		("AuthorSysAdminUnitId", "GranteeSysAdminUnitId", "Operation", "RightLevel", "Position", "SubjectSchemaUId")
	VALUES
		(authorUnit, granteeUnit, 0, 1, 0, schemaUId),  -- чтение, разрешено
		(authorUnit, granteeUnit, 1, 1, 0, schemaUId);  -- изменение, разрешено
END $$;
```
- Правило действует для новых записей. Для существующих — актуализация (ниже).
- Id ролей бери из `SysAdminUnit` проекта запросом к БД, а не из примеров.

## ✅ Актуализировать права существующих записей
- Штатно: пользователь нажимает «Актуализировать права по записям» в настройке прав объекта или агент запускает процесс `ObjectRecordRightsActualizationProcess` с параметром `EntitySchemaUId` (`rights.md`). Права получают записи с заполненным `CreatedBy`.
- 🧪 SQL-вариант в том же скрипте (применяется на проектах, на стенде не проверялся): `INSERT INTO "Sys<Объект>Right" ("SysAdminUnitId", "RecordId", "Operation", "RightLevel", "Position", "SourceId") SELECT d."GranteeSysAdminUnitId", t."Id", d."Operation", d."RightLevel", d."Position", 'f41e0268-e324-4228-9e9e-5cb7cc906398' FROM "<Объект>" t CROSS JOIN "SysEntitySchemaRecordDefRight" d WHERE d."SubjectSchemaUId" = schemaUId AND EXISTS (SELECT NULL FROM "SysUserInRole" r WHERE r."SysUserId" = t."CreatedById" AND r."SysRoleId" = d."AuthorSysAdminUnitId")`. `SourceId` — источник `Default` (`f41e0268-…`), а не Id роли: иначе штатная актуализация не распознает такие строки. Перед вставкой удаляй прежние строки этого правила или добавь `NOT EXISTS`, чтобы скрипт был идемпотентным.

## ✅ Выдать право на запись из кода
```csharp
// using BPMSoft.Core.Configuration;
UserConnection.DBSecurityEngine.SetEntitySchemaRecordRightLevel(<Id пользователя или роли>, "<Объект>", <Id записи>,
	EntitySchemaRecordRightOperation.Read, EntitySchemaRecordRightLevel.Allow);
```
Проверка: `UserConnection.DBSecurityEngine.GetEntitySchemaRecordRightLevel(<Id пользователя>, "<Объект>", <Id записи>)` → `CanRead`.

## ✅ Системная операция и её выдача — данными пакета
**Подтверждено записью в CRM (21.10.2026).** Два набора данных по `data-edit.md`:
- `SysAdminOperation_<Код>` — объект `SysAdminOperation` (`c8fd2fd0-1f44-48c7-84e4-045250b9a638`). Колонки: `Id` (`ae0e45ca-c495-4fe7-a39d-3ab7278e1617`, ключ), `Code` (`2aec9cef-232e-413a-9a5a-9ddde2e8a2af`, тип `ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd`), `UseSystemOperationRestrictions` (`ea5c0817-d558-42ef-a5f9-9379560f16f1`, логическое, `false`). `Name` (`736c30a7-c0ec-4fa9-b034-2552b319b633`) — только в `Localization/data.ru-RU.json` и `data.en-US.json`.
- `SysAdminOperationGrantee_<Код>` — объект `SysAdminOperationGrantee` (`3987bdc6-38bb-4b41-bcf7-90bb3995117a`). Колонки: `Id` (ключ), `SysAdminOperation` (`a64eb826-4dc1-45fb-a5ac-d768275eb719`, справочник, `DisplayValue` — название операции), `SysAdminUnit` (`423b165f-9759-437b-b532-95ef1b78063b`, справочник, `DisplayValue` — название роли), `CanExecute` (`e1f978af-3b07-4c9f-a422-c6170cd1b1a4`, `true`), `Position` (`9d032101-3db5-4bba-ab16-294104cd15ad`, целое, `0` числом).
- Без выдачи операцию не выполнит никто, даже администратор: выдай её и роли «Системные администраторы», если они должны её выполнять.
- В коде: `UserConnection.DBSecurityEngine.CheckCanExecuteOperation("<Код>")` в начале метода сервиса — исключение с понятным текстом, если прав нет; на клиенте — кнопку прячь по результату проверки (сервис или `RightUtilities` 🧪).
