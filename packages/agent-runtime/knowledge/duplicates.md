# Поиск дублей — факты

Правила дублей, проверка при сохранении карточки и массовый поиск. Проверено на стенде 25.10.2026 (PostgreSQL, .NET 8).

## ✅ Правила
- Таблица `DuplicatesRule`: `Name`, `ObjectId` (UId объекта), `IsActive`, `UseAtSave` (проверять при сохранении карточки), `RuleBody` (JSON условий), `ProcedureName` (процедура поиска в БД), `SearchObjectId`.
- `RuleBody` — список условий: колонка объекта или средство связи заданного типа, например `{"filters": [{"schemaName": "Contact", "columnName": "Name"}, {"schemaName": "ContactCommunication", "type": "<UId типа средства связи>", "rootSchemaColumns": ["Phone", "MobilePhone"]}]}`.
- Базовые правила: `Contact` — 6 (ФИО, телефон, email, сайт и их сочетания; `UseAtSave` — только «по ФИО»), `Account` — 5, `Lead` — 17 («похожие лиды»). У правил контакта и контрагента `ProcedureName` — `tsp_Find<Объект>DuplicateBy…`; на PostgreSQL эти процедуры есть как функции.

## ✅ Проверка при сохранении карточки
- При выключенной функции `FindDuplicatesOnSave` (на стенде выключена) карточка вызывает `SearchDuplicatesService`: `POST <CRM>/rest/SearchDuplicatesService/FindContactDuplicates` (для контрагента — `FindAccountDuplicates`) с телом `{"request": {"Id": "<Id записи или пустой GUID>", "Name": "<ФИО>", "Communication": []}}`. Ответ `{"FindContactDuplicatesResult": [<Id найденных записей>]}` — проверено: два контакта с одинаковым ФИО нашлись по правилу «по ФИО».
- Адрес `/ServiceModel/SearchDuplicatesService.svc/…` на стенде .NET 8 отвечает 404 — используй `/rest/…`.
- При включённой `FindDuplicatesOnSave` карточка вызывает `POST <CRM>/rest/DeduplicationService/FindDuplicatesOnSave` (`{"schemaName": "<Объект>", "request": {…}}`); при выключенной функции он возвращает пустой список.
- 🧪 Своё правило для своего объекта: нужна процедура поиска в БД.

## 🧪 Массовый поиск и объединение
- Новый механизм (`DeduplicationService`: `FindEntityDuplicatesAsync`, `MergeEntityDuplicatesAsync`, `GetDeduplicationResults`) работает через внешний сервис дедупликации: системная настройка `DeduplicationWebApiUrl`, функция `Deduplication`. На стенде настройка пуста, функция выключена — не проверено.
