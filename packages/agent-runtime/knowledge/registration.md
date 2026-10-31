# Регистрация разделов, карточек, мини-карточек и деталей (данные `SysModule*`, `SysDetail`) — подтверждённая модель

## ✅ Структура записей (прочитано на реальных данных)
Одной клиентской схемы мало: платформа находит разделы, карточки и детали по записям в системных таблицах. Эти записи переносятся Data-наборами пакета (формат — `data.md`). Структура сверена на полном комплекте реального раздела и сканом всех таких наборов проекта: каждая UId-колонка ниже указывает на схему нужного типа (`CardSchemaUId` → `EditViewModelSchema` в большинстве наборов, `SectionSchemaUId` → `ModuleViewModelSchema`, `DetailSchemaUId` → `GridDetailViewModelSchema` в большинстве наборов).

| Data-набор (имя по соглашению мастера) | Таблица | Что связывает |
|---|---|---|
| `SysModuleEntity_SysModuleEntityManager_<Объект>` | `SysModuleEntity` | `Id` — запись «объект раздела»; `SysEntitySchemaUId` = UId Entity-схемы; `TypeColumnUId` = колонка типа (для карточек по типу) или `"null"` |
| `SysModule_SectionManager_<Объект>` | `SysModule` | раздел: `Code`, `SectionSchemaUId` = UId схемы раздела, `SysModuleEntity` → запись выше, `SectionModuleSchemaUId` = `df58589e-26a6-44d1-b8d4-edf1734d02b4`, `CardModuleUId` = `4e1670dc-10db-4217-929a-669f906e5d75` (одинаковы у разделов; вероятно модули SectionModuleV2/CardModuleV2 — не проверено), `FolderMode`, `Image32` (UId картинки из `SysImage`); локализация `Caption`, `ModuleHeader` |
| `SysModuleEdit_SysModuleEditManager_<Объект>` | `SysModuleEdit` | карточка объекта: `CardSchemaUId` = UId схемы карточки, `MiniPageSchemaUId` = UId мини-карточки или `"null"`, `MiniPageModes`, `SysModuleEntity` → запись выше, `ActionKindName`, `TypeColumnValue` (значение типа для карточек по типу), `Position`, `UseModuleDetails`; локализация `PageCaption`, `ActionKindCaption` |
| `SysDetail_DetailManager_<Объект детали>` | `SysDetail` | деталь: `DetailSchemaUId` = UId схемы детали, `EntitySchemaUId` = UId объекта детали; локализация `Caption` |
| `SysModuleInWorkplace_<...>` | `SysModuleInWorkplace` | раздел в рабочем месте (меню): `SysModule` → раздел, `SysWorkplace` → рабочее место, `Position` |

Что из этого следует:
- **Новый раздел** регистрируется записями `SysModuleEntity` + `SysModule` + `SysModuleEdit` (его карточка) + `SysModuleInWorkplace` (чтобы появился в меню рабочего места).
- **Новая карточка объекта** открывается из разделов и по ссылкам только через запись `SysModuleEdit`; без неё — только по URL `ViewModule.aspx#CardModuleV2/<Схема>/add` или `/edit/<Id>`.
- **Новая мини-карточка** — поле `MiniPageSchemaUId` в записи `SysModuleEdit` объекта.
- **Новая деталь** — запись `SysDetail` (по ней деталь видна в мастере деталей и дизайнере страниц); на страницу деталь подключается отдельно: `details: {}` и элемент в `diff`.
- Рецепт записи — ✅ в `registration-edit.md` (раздел, карточка, мини-карточка, деталь подтверждены записью).

## ✅ Мини-карточка и карточки по типам (прочитано на данных проекта)
- **Мини-карточка задаётся строкой страницы редактирования `SysModuleEdit`**, а не объектом: `MiniPageSchemaUId` = канонический UId схемы мини-карточки и `MiniPageModes`. Если у строки `MiniPageSchemaUId = "null"` или режимы пустые — мини-карточка не открывается, даже если схема мини-карточки есть и настроена.
- **`MiniPageModes`** — три позиции через `;` в порядке `add;edit;view` (добавление; редактирование; просмотр при наведении); пустая позиция — режим выключен; `";;"` или `""` — мини-карточка выключена. В реальном проекте чаще всего мини-карточка выключена (`;;` или `""`), реже — `;;view`, `add;edit;view`, `add;;view`.
- **Карточки по типам**: у одного объекта (запись `SysModuleEntity`, колонка типа — `TypeColumnUId`) бывает несколько строк `SysModuleEdit` — по одной на значение типа (`TypeColumnValue` = Id записи справочника типов) и строка по умолчанию (`TypeColumnValue = "null"`). Карточка и мини-карточка настраиваются **для каждой строки (типа) отдельно**. Пример — лид (`SysModuleEntity` `8a46f91f-312e-4f4b-9e04-2701a0b80b9b`): строка по умолчанию `SysModuleEdit_LeadPageV2` (`LeadPageV2`) и по строке на каждый тип лида со своей карточкой; типы — Data `LeadType`.
- **`IsForceUpdate`**: значение колонки в уже установленной строке обновляется, только если у колонки в `descriptor.json` набора `IsForceUpdate: true` (`data.md`, «IsForceUpdate»). В наборах лида у `MiniPageSchemaUId`/`MiniPageModes` — `true`; в наборе, скопированном с другого раздела, у `MiniPageSchemaUId` может быть `false` (перед включением мини-карточки поменять на `true`).
- ✅ Одна и та же строка (по `Id`) в данных нескольких пакетов (подтверждено записью в CRM, наборы с одним `Id` в пакете и в зависящем от него пакете): побеждает набор, который установился последним, и только если у его колонок `IsForceUpdate: true` — без него существующая строка не меняется. Порядок зависимостей не защищает: набор «нижнего» пакета, установленный позже (свежий `ModifiedOnUtc`), снова перезаписывает строку. Если оба набора изменены в одном «Обновить из файловой системы», последним ставится пакет, который зависит от другого. Строк залоченных пакетов в Pkg нет.

## ✅ Печатные формы: где зарегистрированы
- `SysModuleReport` — печатная форма раздела: `Caption`, `SysModuleId` (раздел), `TypeId` (справочник `SysModuleReportType`: `8bc259ef-4276-4906-b7a6-23dc59be7fe2` — MS Word, `8def0f6d-b075-41dd-bcad-ca660c29f2e2` — FastReport, `32f72c9c-72c7-44e0-8c84-34c9ed17ca50` — DevExpress), `ShowInSection`, `ShowInCard`, `ConvertInPDF`, `File` и `FileName` (шаблон), `SysReportSchemaUId`, `TypeColumnValue`, `MacrosSettings`.
- Таблицы данных Word-шаблона — `SysModuleReportTable` (`SysModuleReportId`, `ObjectId`, `ReferenceColumn`, `Filter`, `ObjectColumnPath`…); FastReport — `FastReportTemplate` (`Data`) и `FastReportDataSource` (`TemplateId`, `Name`, `TypeId`, `Data`).
- 🧪 Создание печатной формы файлами пакета не проверялось: шаблон Word готовят в дизайнере печатных форм с плагином MS Word — это делает пользователь.

## ✅ Справочник в разделе «Справочники»
- Одна строка таблицы `Lookup` (`SysEntitySchemaUId` — объект, `SysPageSchemaUId` — `"null"` для редактирования в реестре или UId своей страницы), название — в `Localization`. Рецепт — `registration-edit.md`. Таблицы `LookupInFolder`/`LookupFolder` (папки справочников) не проверены.

## Не проверено пока
- Точное значение констант `SectionModuleSchemaUId`/`CardModuleUId` и `UseModuleDetails`.
- Нужна ли запись `SysDetail`, чтобы деталь работала на странице в runtime (или только для мастера деталей).
