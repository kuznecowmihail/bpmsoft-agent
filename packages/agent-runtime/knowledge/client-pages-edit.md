# Клиентские схемы: карточки, разделы, мини-карточки, детали — рецепты

Часть рецептов из `client-schemas-edit.md` (там — общее для всех: обязательный шаг — полная иерархия родителя, константы, миксины, патчи, стили). Здесь: новая карточка и её замещение, атрибуты, методы и правила, кнопки, деталь, раздел, мини-карточка. Общая механика — `metadata-editing.md`. ✅ — проверено записью в CRM, 🧪 — не проверено.

## ✅ Создать новую карточку (Page) с нуля
**Подтверждено**: карточка `TestColumnsPage` (наследник `BaseModulePageV2`, объект `TestColumns`), написанная вручную, после «Обновить из файловой системы» и Ctrl+F5 открылась в CRM без ошибок, все поля, вкладка, группа, строки и значения по умолчанию на месте. Перед записью выполни «Обязательный шаг» из `client-schemas-edit.md` — имена контейнеров родителя берутся из модели вёрстки.

**Файлы** (`Pkg/<Пакет>/`):
1. `Schemas/<Имя>/descriptor.json`: `UId` (новый GUID), `Name`, `ModifiedOnUtc`, `Parent` = `{UId, Name}` родителя (канонический UId, см. `client-schemas-edit.md`, правило 7; `BaseModulePageV2` = `d62293c0-7f14-44b1-b547-735fb40499cd`), `ManagerName: "ClientUnitSchemaManager"`, `Caption`, `DependsOn: []`. Без `ExtendParent`.
2. `Schemas/<Имя>/properties.json`: `{"Properties": {"CreatedInVersion": "7.18.5.1500", "SchemaType": "EditViewModelSchema"}}`.
3. `Schemas/<Имя>/metadata.json` — только свои строки и штампы:
```
= MetaData.Schema.UId "<UId схемы>"
= MetaData.Schema.A2 "<Имя>"
= MetaData.Schema.A5 "<A5 как у соседних схем пакета>"
+ MetaData.Schema.B2 {"UId": "<GUID строки>", "A2": "<КлючСтроки>", "A3": "<UId схемы>", "A4": "<UId схемы>", "A5": "<A5 как у соседних схем пакета>"}
~ MetaData.Schema.B2 ["<GUID строки>"]
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "7.18.5.1500"
= MetaData.Schema.HD1 "<UId родителя>"
```
В `~ B2` — только свои строки: унаследованные строки родителя остаются (✅ в дизайнере видны и свои, и все родительские). `HD1` = UId родителя (см. `client-schemas.md`).

**Если родитель — своя схема из `Pkg`** (а не из `conf/content`), добавь в конец `metadata.json` наследника две строки (✅ 05.10.2026, `TestDupChildPage`; так у всех таких схем проекта):
```
- MetaData.Schema.B7
+ MetaData.Schema.B7 false
```
Без них `diff` родителя применяется дважды: в консоли «Дубль элемента … удален» на каждый элемент родителя, вкладки наследника пустые. Карточку-наследника можно открыть без регистрации: `#CardModuleV2/<Имя>/edit/<Id записи>`.
4. `Schemas/<Имя>/<Имя>.js`:
```
define("<Имя>", ["BusinessRuleModule", "<Имя>Resources"], function(BusinessRuleModule, resources) {
	return {
		entitySchemaName: "<Объект>",
		attributes: {},
		rules: {},
		modules: /**SCHEMA_MODULES*/{}/**SCHEMA_MODULES*/,
		details: /**SCHEMA_DETAILS*/{}/**SCHEMA_DETAILS*/,
		businessRules: /**SCHEMA_BUSINESS_RULES*/{}/**SCHEMA_BUSINESS_RULES*/,
		methods: {},
		dataModels: /**SCHEMA_DATA_MODELS*/{}/**SCHEMA_DATA_MODELS*/,
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});
```
Зависимости `BusinessRuleModule` и `<Имя>Resources` нужны, только если используешь `rules` и `resources.localizableStrings`.
5. `Resources/<Имя>.ClientUnit/resource.ru-RU.xml` и `resource.en-US.xml`: `<Item Name="Caption" .../>` и по строке на каждую запись `B2`: `<Item Name="LocalizableStrings.<КлючСтроки>.Value" Value="<Текст>" />`.

**Вёрстка у наследника `BaseModulePageV2`** (✅): поля шапки — `insert` в `"parentName": "Header"`, `"propertyName": "items"`, `layout` без `layoutName`; вкладка — `insert` в `"parentName": "Tabs"`, `"propertyName": "tabs"`, `values: {caption: {bindTo: "Resources.Strings.<Ключ>"}, items: [], order: 0}`; группа — `itemType: 15` в `items` вкладки; сетка — `itemType: 0` в `items` группы; поля сетки — `layout` с `"layoutName": "<имя сетки>"`, `bindTo` = имя колонки; кнопка — `insert` в `"parentName": "LeftContainer"` с `itemType: BPMSoft.ViewItemType.BUTTON`, `caption`, `click: {bindTo: "<метод>"}`. Заголовки полей колонок объекта берутся из объекта; у виртуального атрибута задай `caption: {bindTo: "Resources.Strings.<Ключ>"}`.

**Проверить без регистрации**: `<адрес CRM>/0/Nui/ViewModule.aspx#CardModuleV2/<Имя>/add` (или `/edit/<Id записи>`). Чтобы карточка открывалась из раздела и по ссылкам — `registration-edit.md`.

## ✅ Атрибуты, методы, правила, валидация и кнопка на карточке
**Подтверждено** на `TestColumnsPage`:
- **Виртуальный атрибут с пересчётом**: `attributes: {"<Имя>": {dataValueType: BPMSoft.DataValueType.FLOAT, type: BPMSoft.ViewModelColumnType.VIRTUAL_COLUMN, value: 0, dependencies: [{columns: ["<Колонка>"], methodName: "<метод>"}]}}` — метод вызывается при изменении колонки.
- **Переопределение метода родителя** с `this.callParent(arguments)` (проверено на `onEntityInitialized`).
- **Валидация поля**: переопредели `setValidationConfig` (сначала `this.callParent(arguments)`), внутри `this.addColumnValidator("<Колонка>", this.<валидатор>)`; валидатор вызывается как `validator.call(this, value, column)` и возвращает `{invalidMessage: "<текст или пустая строка>"}`. Сообщение показывается под полем, сохранение блокируется.
- ⚠️ **Свой валидатор не работает у обязательного поля** (✅ подтверждено в CRM и по коду платформы, 14.10.2026): `validateColumn` запускает сначала стандартные проверки (`getDefaultValidators` — `typeValidator`, `rangeValidator`, `requiredValidator`), потом твои из `validationConfig`, и останавливается на первой непройденной. У пустого обязательного поля (признак обязательности или правило REQUIRED) первым срабатывает `requiredValidator`, и свой валидатор уже не вызывается.
- ✅ **Свой текст для обязательного поля** (подтверждено в CRM, 14.10.2026): переопредели `requiredValidator(value, column)`, возьми результат родителя через `this.callParent(arguments)` и, если `invalidMessage` не пуст и нужна именно твоя колонка (`column.name` или `column.columnPath`), замени его своей локализуемой строкой. Текст появится и под полем, и в окне при сохранении (шаблон платформы «Поле "<Подпись>": <текст>»). Саму обязательность задавай как обычно — правилом REQUIRED или признаком колонки.
- **Правила** (`rules`, `businessRules`, `businessRulesMultiplyActions`): рецепты — `client-rules-edit.md`, коды и применение платформой — `client-rules.md`. Пример `rules` — `client-rules-edit.md`, «`rules`: обязательность, видимость, доступность».
- **Локализуемая строка в коде**: `resources.localizableStrings.<Ключ>` (модуль `<Имя>Resources` в зависимостях) или `this.get("Resources.Strings.<Ключ>")` — оба работают.
- **Кнопка**: обработчик — метод из `methods`, `this.showInformationDialog(<текст>)` показывает сообщение. Стиль выделенной кнопки — см. «Кнопка карточки в совмещённом режиме».
- **Где искать базовые методы модели**: `setValidationConfig`, `addColumnValidator`, `showInformationDialog`, `validateColumn` определены не в схемах-конфигах, а в классах `conf/content/BaseSchemaViewModel.js` и `[app]/Resources/ui/BPMSoft/data/models/base-view-model.js`. Скрипт иерархии их не видит и помечает переопределение как «новый» — перед переопределением такого метода проверь его в этих двух файлах (сигнатура, нужен ли `callParent`).
- ✅ **Автономер** (подтверждено в CRM, 08.10.2026): в карточке `getIncrementColumn: function() { return "<Колонка>"; }` и вызов `this.setIncrementCode()` в `onEntityInitialized` до `callParent` (образец — `InvoicePageV2` в `conf/content`). Нужны системные настройки `<Объект>CodeMask` (маска для `string.Format`, например `ЗАЯ-{0:00000}`) и `<Объект>LastNumber` (`data-edit.md`); у значения `LastNumber` в наборе — `IsForceUpdate: false`, чтобы обновление пакета не сбрасывало счётчик. Номер выдаёт сервис `SysSettingsService.GetIncrementValueVsMask`; при `UseDBSequence=true` (`BPMSoft.WebHost.dll.config`) вместо настройки берётся последовательность БД.
- ✅ **Автономер на мини-карточке** (08.10.2026): у `BaseMiniPage` нет `setIncrementCode` (он есть только у `BasePageV2`) — при добавлении вызови `SysSettingsService.GetIncrementValueVsMask` сам. `isNewMode` на мини-карточке совпадает с `isAddMode`.
- ✅ **Переименовать вкладку** (08.10.2026): достаточно поменять `LocalizableStrings.<Ключ>.Value` в обоих `resource.*.xml` и `ModifiedOnUtc` схемы; `.js` и `metadata.json` не трогать.
- ✅ **Обязательность по флажку** (08.10.2026): правило `REQUIRED` с условием `EQUAL` атрибута-флажка и константы `true`.
- ✅ **Подсказка у поля** (подтверждено в CRM, 15.10.2026): в описании поля в `diff` — `"tip": {"content": {"bindTo": "Resources.Strings.<Ключ>"}}`; строку `<Ключ>` заведи в `metadata.json` карточки и в ресурсах ru-RU и en-US. Без `displayMode` у подписи появляется значок «?», текст — при наведении. Образец платформы — `conf/content/AccountPageV2.js`.
- Платформенная проверка обязательного поля (`requiredValidator` в `Resources/ui/BPMSoft/data/models/base-view-model.js`) обрезает пробелы у строки: значение из одних пробелов считается пустым, свой валидатор для этого не нужен (подтверждено по коду платформы).

## ✅ Замещение (override) существующей карточки
**Подтверждено**: новое замещение `ProductPageV2` (раньше не замещалась нигде), написанное вручную, работает в CRM — и в отдельной карточке, и в совмещённом режиме (карточка открыта из реестра раздела).

**Файлы** (`Pkg/<Пакет>/`):
1. `descriptor.json`: `Name` = имя замещаемой схемы, `Parent` = `{UId: <канонический UId>, Name: <то же имя>}`, `ExtendParent: true`. Канонический UId схемы из `conf/content` — `schemaUId` первого слоя (для `ProductPageV2` — `0daec87e-a84d-44bc-9dd0-c90b8d1baa33`), см. «Обязательный шаг».
2. `properties.json`: тот же `SchemaType`, что у родителя (`EditViewModelSchema`).
3. `metadata.json` — только дельта пакета, без `A2` и без `HD1` (как у override объекта):
```
= MetaData.Schema.UId "<UId замещения>"
= MetaData.Schema.A5 "<A5 как у соседних схем пакета>"
+ MetaData.Schema.B2 {"UId": "<GUID>", "A2": "<Ключ>", "A3": "<UId замещения>", "A4": "<UId замещения>", "A5": "<A5 как у соседних схем пакета>"}
~ MetaData.Schema.B2 ["<GUID>"]
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "7.18.5.1500"
= MetaData.Schema.B7 true
```
**`= MetaData.Schema.B7 true` обязательна** — это признак замещения; без неё клиент может собрать схему без базовых слоёв (см. `client-schemas.md`, `B7`). Designer дополнительно пишет `= MetaData.Schema.HD1 "<UId родителя>"`, `- MetaData.Schema.HD12`, строки `= MetaData.Schema.B2.["<UId>"].A4 ...` для унаследованных строк и копирует в ресурсы несколько строк родителя — это не обязательно (рабочие замещения проекта без `HD1`). Версия `CreatedInVersion`/`B8`: текущий Designer стенда пишет `1.9.0.17103`, в старых файлах — `7.18.5.1500`; принимаются обе.
Строки родителя при этом сохраняются (все заголовки вкладок и полей родителя на месте).
4. `.js`: `define("<Имя>", [...], function(...) { return { entitySchemaName, attributes, methods, diff, ... }; });` — только то, что меняет или добавляет замещение.
5. Ресурсы — только свои строки, без `Caption` схемы.

**Что проверено в замещении:**
- `merge` элемента родителя по `name` — указывай только меняемые свойства (новый `caption` поля).
- `remove` элемента родителя — `{"operation": "remove", "name": "<Элемент>"}`.
- **Порядок вкладок задаётся свойством `order`, а не позицией**: `move` вкладки с `"index": 0` видимый порядок НЕ изменил. Чтобы переставить вкладки, сделай `merge` с новым `"order"` КАЖДОЙ вкладке (как делает Designer). Текущие `order` вкладок видны в слоях родителя.
- 🧪 `move` обычного элемента (не вкладки) записью не проверен.
- Частичное переопределение атрибута родителя: `"Unit": {"isRequired": false}` — снимает обязательность, остальные свойства атрибута (например `dependencies`) остаются от родителя.
- Переопределение `getActions` с `this.callParent(arguments)` и `actionMenuItems.addItem(this.getButtonMenuItem({"Caption": ..., "Tag": "<метод>"}))` — пункт добавляется в конец «Действий», по клику вызывается метод с именем из `Tag`. Разделитель — `this.getButtonMenuItem({"Type": "BPMSoft.MenuSeparator"})`.
- **Совмещённый режим** (карточка открыта из реестра раздела): действия карточки отрисовывает раздел, и привязка `"Caption": {"bindTo": "Resources.Strings.<Ключ>"}` ищет строку в модели раздела — у раздела её нет, текст пустой. Решение ✅: передавать готовый текст — `"Caption": resources.localizableStrings.<Ключ>` (модуль `<Имя>Resources` в зависимостях `define`). Другой вариант — добавить ту же строку в схему раздела (проверим при замещении раздела).

## ✅ Новая деталь-реестр и подключение её к карточке
**Подтверждено**: деталь `TestColumnsDetail` (наследник `BaseGridDetailV2`, объект `TestColumns`) на карточке контакта показывает записи, связанные по `TestContact`, кнопка на панели детали работает.

**Схема детали** (`Pkg/<Пакет>/Schemas/<Деталь>/`):
- `descriptor.json`: `Parent` = `{UId: "01eb38ee-668a-42f0-999d-c2534f979089", Name: "BaseGridDetailV2"}`, без `ExtendParent`.
- `properties.json`: `"SchemaType": "GridDetailViewModelSchema"`.
- `metadata.json`: как у новой карточки (`UId`, `A2`, `A5`, свои `B2` + `~ B2`, `B6`, `B8`, `HD1` = UId родителя).
- `.js`: `define("<Деталь>", ["<Деталь>Resources"], function(resources) { return { entitySchemaName: "<Объект детали>", details: {}, methods: {...}, diff: [...] }; });`. Кнопка на панели детали — `insert` в `"parentName": "Detail"`, `"propertyName": "tools"` с `itemType: BPMSoft.ViewItemType.BUTTON`. Записи детали — `this.get("Collection")`.

**Подключение к карточке** (в схеме или замещении карточки):
- `details: {"<Ключ>": {"schemaName": "<Деталь>", "entitySchemaName": "<Объект детали>", "filter": {"detailColumn": "<lookup-колонка объекта детали на мастер>", "masterColumn": "Id"}}}`.
- В `diff`: `{"operation": "insert", "name": "<Ключ>", "values": {"itemType": 2, "markerValue": "added-detail"}, "parentName": "<Вкладка>", "propertyName": "items", "index": N}`.
- **Заголовок детали на карточке** — строка карточки с именем `<Ключ>DetailCaptionOnPage` (так её ищет `BaseEntityPage.getDetailInfo`): запись `B2` в `metadata.json` карточки + `LocalizableStrings.<Ключ>DetailCaptionOnPage.Value` в её ресурсах. Иначе берётся строка `Caption` самой детали.
- Регистрация детали (`SysDetail`) — `registration-edit.md`.

## ✅ Правка существующего замещения (боевого файла)
**Подтверждено** на `ContactPageV2` (добавлены деталь в `details`, элемент в `diff`, строка в `B2` и ресурсы):
- Перед правкой зафиксируй исходное состояние: если `Pkg` — git-репозиторий, сравнивай и откатывай через `git diff` / `git checkout -- <файл>`; если нет — попроси пользователя сделать копию схемы и её ресурсов (запись вне `Pkg` агенту запрещена).
- **Окончания строк**: файлы, сохранённые Designer, бывают в CRLF (`ContactPageV2.js` — CRLF, его `metadata.json` и ресурсы — LF). Определи окончание строк файла и вставляй в том же формате; якоря для поиска строй с ним же.
- Вставляй только свои фрагменты (свой ключ в `details`, свой элемент первым в `diff`, свою запись `+ B2` перед `~ B2` и её UId в конец списка `~ B2`), обнови `ModifiedOnUtc`. Затем сверь с копией: в `diff` должны быть только твои строки.
- Верхним слоем схемы может быть другой пакет: слой пакета, который ты правишь, остаётся в цепочке и работает.

## ✅ Замещение (override) существующей детали
**Подтверждено**: новое замещение `ContactAddressDetailV2` (деталь «Адреса» на карточке контакта) работает.
- Файлы — как у замещения карточки (`ExtendParent: true`, `Parent` = `{UId: <канонический UId>, Name: <то же имя>}`; для `ContactAddressDetailV2` — `e11ebfda-be27-4b0f-b01c-7a82a244b00e`), но `"SchemaType": "GridDetailViewModelSchema"`. `metadata.json` без `A2` и `HD1`, но с обязательной `= MetaData.Schema.B7 true`. ✅ Базовый слой подключается (стек `["ContactAddressDetailV2UIv2", "ContactAddressDetailV2"]`) — проверено после добавления `B7`; до этого база не подключалась.
- Переопределение `initDefaultCaption` (метод `BaseDetailV2`) с `this.callParent(arguments)` и дописыванием текста к `this.get("Caption")` меняет заголовок детали на всех страницах, где она подключена.
- Новая кнопка на панели — `insert` в `"parentName": "Detail"`, `"propertyName": "tools"`; записи — `this.get("Collection")` (`getCount()`, `getByIndex(i)`, у записи `get("<Колонка>")`).
- `remove` колонки реестра родителя (`<Колонка>ListedGridColumn` в `DataGridListedConfig`) — операция находит элемент; видимый эффект есть только у пользователей без сохранённой настройки колонок детали (иначе реестр строится по профилю).

## ✅ Новый раздел (Section) с нуля
**Подтверждено**: раздел `TestColumnsSection` (наследник `BaseSectionV2`, объект `TestColumns`) после регистрации (`registration-edit.md`) появился в меню рабочего места, реестр, действие раздела, открытие и добавление записи через карточку работают.
- `descriptor.json`: `Parent` = `{UId: "7912fb69-4fee-429f-8b23-93943c35d66d", Name: "BaseSectionV2"}`, без `ExtendParent`.
- `properties.json`: `"SchemaType": "ModuleViewModelSchema"`.
- `metadata.json`: как у новой карточки (`UId`, `A2`, `A5`, свои `B2` + `~ B2`, `B6`, `B8`, `HD1` = UId родителя).
- `.js`: `define("<Раздел>", ["<Раздел>Resources"], function(resources) { return { entitySchemaName: "<Объект>", attributes: {}, details: {}, methods: {}, diff: [] }; });` — пустой раздел уже работает (так устроены и реальные разделы). Колонки реестра задаются профилем пользователя, а не схемой.
- **Действие раздела**: переопредели `getSectionActions` с `this.callParent(arguments)`, добавь `actions.addItem(this.getButtonMenuItem({"Caption": resources.localizableStrings.<Ключ>, "Click": {"bindTo": "<метод>"}}))`. Записи реестра — `this.getGridData()` (`getCount()`).
- Без регистрации раздел открывается только по URL `ViewModule.aspx#SectionModuleV2/<Раздел>/`.

## ✅ Кнопка карточки в совмещённом режиме (карточка открыта из реестра)
**Подтверждено** на `TestColumnsPage` + `TestColumnsSection` (исходный кейс — практика пользователя). В совмещённом режиме верхняя панель кнопок принадлежит РАЗДЕЛУ: кнопка, вставленная только в `LeftContainer` карточки, видна лишь при отдельном открытии карточки (после перезагрузки страницы). Решение — кнопка в обеих схемах:
- **Карточка**: атрибут видимости `"<Кнопка>Visible": {dataValueType: BPMSoft.DataValueType.BOOLEAN, type: BPMSoft.ViewModelColumnType.VIRTUAL_COLUMN, value: false}`; в `onEntityInitialized` после `callParent` — `this.set("<Кнопка>Visible", <значение>)` и `this.publishPropertyValueToSection("<Кнопка>Visible", <значение>)` (метод `BasePageV2`: публикует `CardChanged` с `{key, value}`); кнопка в `LeftContainer` с `"visible": {"bindTo": "<Кнопка>Visible"}` и `"click": {"bindTo": "<метод карточки>"}`.
- **Раздел**: тот же атрибут `<Кнопка>Visible` (его значение ставит `BaseDataView.initCardChangedHandler` по сообщению `CardChanged`); кнопка — `insert` в `"parentName": "CombinedModeActionButtonsCardLeftContainer"`, `"propertyName": "items"` с `"click": {"bindTo": "onCardAction"}`, `"tag": "<метод карточки>"` (`onCardAction` отправляет `OnCardAction` в песочницу карточки, и там вызывается метод с именем из `tag`), `"visible": {"bindTo": "<Кнопка>Visible"}`, `"classes": {"textClass": "actions-button-margin-right"}`.
- **Строки для совмещённого режима нужны и в разделе**: заголовок кнопки раздела — строка `B2` и ресурсы самой схемы раздела (у раздела нет строк карточки). То же относится к действиям карточки с `bindTo: "Resources.Strings..."` — либо строка в разделе, либо готовый текст `resources.localizableStrings.<Ключ>` (см. «Замещение карточки»).
- Стиль выделенной кнопки — `BPMSoft.controls.ButtonEnums.style.ORANGE` (`GREEN` в BPMSoft заменён на `ORANGE`).
- ✅ **Пункт «Действия» по условию** (07.10.2026, `TestTicketPage`: «Закрыть заявку» пропадает у закрытой заявки и в отдельной карточке, и при открытии из реестра): `getActions` добавляет пункт только при выполнении условия, а после изменения условия (в `onEntityInitialized` и после смены нужного поля) вызывается `this.initActionButtonMenu()` — метод `BasePageV2` заново собирает меню и публикует `GetCardActions`, раздел пересобирает свою копию (`BaseDataView.initActionButtonMenu` → `cloneBaseViewModel`). Работает, только если меню пересобирается после загрузки записи: проверка поля в `getActions` без `initActionButtonMenu()` не срабатывает — при первой сборке меню данных записи ещё нет. ❌ Опровергнуто (08.10.2026): «скрыть уже скопированный разделом пункт сменой атрибута карточки нельзя» — можно, см. следующий пункт.
- ✅ **Пункт «Действия» по условию через `Visible`** (подтверждено в CRM, 08.10.2026, в отдельной карточке и при открытии из реестра) — основной способ: пункт добавляется в `getActions` всегда, с `"Visible": {"bindTo": "<Признак>"}`; признак — виртуальный логический атрибут и в карточке, и в разделе; карточка пересчитывает его в `onEntityInitialized` и при смене поля (`dependencies`) и передаёт в раздел `this.publishPropertyValueToSection("<Признак>", <значение>)`. Меню не пересобирается. Подпись пункта — готовая строка `resources.localizableStrings.<Ключ>`: у раздела своих строк карточки нет.

⚠️ **Кнопка действия над записью — всегда в двух схемах** (подтверждено 10.10.2026: кнопка только в разделе пропадает после Ctrl+F5 и при переходе по прямой ссылке на запись — карточка открывается отдельно): на карточке в `LeftContainer` (отдельное открытие) и в разделе в `CombinedModeActionButtonsCardLeftContainer` (совмещённый режим), видимость — общим признаком через `publishPropertyValueToSection`. Вариант «только в разделе» пользователю не предлагай. Кнопка для реестра без открытой записи — отдельно, в `SeparateModeActionButtonsLeftContainer`. Подписи кнопок и тексты сообщений — локализуемые строки в обеих схемах.

## ✅ Замещение (override) существующего раздела
**Подтверждено**: новое замещение `ProductSectionV2` (раздел «Продукты») работает.
- Файлы — как у замещения карточки (`ExtendParent: true`, `Parent` = `{UId: <канонический UId>, Name: <то же имя>}`; для `ProductSectionV2` — `f067c01f-590c-48b3-ae22-48e56534cc66`), `"SchemaType": "ModuleViewModelSchema"`, `metadata.json` без `A2` и `HD1`, с обязательной `= MetaData.Schema.B7 true`.
- **Контейнеры верхней панели раздела** (модель вёрстки `BaseDataViewNUI`): режим реестра — `SeparateModeActionButtonsLeftContainer` (`AddFolderButton`, `SeparateModeAddRecordButton`, `SeparateModeActionsButton`) и `SeparateModeActionButtonsRightContainer`; совмещённый режим — `CombinedModeActionButtonsCardLeftContainer` (кнопки карточки: `SaveRecordButton`, `CloseButton`, `CombinedModeActionsButton` и т.д.) и `CombinedModeActionButtonsCardRightContainer`.
- Кнопка в панели реестра — `insert` в `SeparateModeActionButtonsLeftContainer`, `"propertyName": "items"`, обработчик — метод раздела.
- `merge` кнопки родителя (`SeparateModeAddRecordButton` + `"hint": {"bindTo": "Resources.Strings.<Ключ>"}`) — добавляет свойство, не ломая кнопку.
- `getSectionActions` с `callParent`: в разделе заголовок пункта можно привязать `"Caption": {"bindTo": "Resources.Strings.<Ключ>"}` к строке самого раздела — работает.
- **Кнопка раздела, вызывающая метод замещения карточки**: `insert` в `CombinedModeActionButtonsCardLeftContainer` с `"click": {"bindTo": "onCardAction"}`, `"tag": "<метод из замещения карточки>"` — метод карточки выполняется (проверено: раздел `ProductSectionV2` → метод `onTestProductInfoClick` из замещения `ProductPageV2`). Без атрибута видимости кнопка видна всегда, когда карточка открыта в совмещённом режиме.

## ✅ Замещение (override) мини-карточки
**Подтверждено**: замещение `LeadMiniPage` (база — один слой пакета `Lead`, ` a6bcff3c-0159-4547-b143-0b69cf303bd2`): `merge` подписи поля родителя (`Account`), `insert` поля объекта (`Commentary`) и виртуального поля (`TestMark`) в контейнер `MiniPage` с `"isMiniPageModelItem": true` и `layout` `{column, row, colSpan}`, переопределение `onEntityInitialized` с `callParent` — работают в режиме просмотра при наведении. Файлы — как у замещения карточки (`SchemaType: EditViewModelSchema`, `= MetaData.Schema.B7 true` обязательна). Мини-карточка откроется, только если зарегистрирована в `SysModuleEdit` (см. `registration-edit.md`). `"visible": {"bindTo": "isNotViewMode"}` у элемента — показывать только в режиме редактирования.

## ✅ Новая мини-карточка (MiniPage) с нуля
**Подтверждено**: `TestColumnsMiniPage` (объект `TestColumns`) после регистрации открывается при наведении на ссылку записи в реестре раздела (просмотр), по «Добавить» в разделе (добавление) и по карандашу (редактирование).
- `descriptor.json`: `Parent` = `{UId: "8e06a577-08e4-424e-bd89-798a34e1b928", Name: "BaseMiniPage"}`, без `ExtendParent`; `properties.json`: `"SchemaType": "EditViewModelSchema"`; `metadata.json` — как у новой карточки (`UId`, `A2`, `A5`, `B6`, `B8`, `HD1` = `8e06a577-…`; строк `B2` может не быть).
- `.js`: атрибут `"MiniPageModes": {"value": [BPMSoft.ConfigurationEnums.CardOperation.VIEW, BPMSoft.ConfigurationEnums.CardOperation.ADD, BPMSoft.ConfigurationEnums.CardOperation.EDIT]}`; поля — `insert` в `"parentName": "MiniPage"`, `"propertyName": "items"` с `"bindTo": "<Колонка>"`, `"isMiniPageModelItem": true`, `"layout": {"column": 0, "row": N, "colSpan": 24}`; поле только для добавления и редактирования — `"visible": {"bindTo": "isNotViewMode"}`.
- **Обязательные колонки**, которых нет на мини-карточке, в режиме добавления платформа показывает сама (контейнер `RequiredColumnsContainer` из `BaseMiniPageNUI`) — проверено: «Дата старта» появилась автоматически.
- Регистрация — `MiniPageSchemaUId` и `MiniPageModes` в строке `SysModuleEdit` объекта (`registration-edit.md`).
- Проверка цепочки: `BPMSoft.configuration.Structures["<МиниКарточка>"]` → слои `BaseMiniPage…` + свой.
