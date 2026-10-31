# Клиентские схемы: модули, запросы данных, проверки, реестры — рецепты

Часть рецептов из `client-schemas-edit.md` (там — общее для всех: обязательный шаг — полная иерархия родителя, константы, миксины, патчи, стили). Здесь: модуль и обмен сообщениями, фильтр справочника, клиентский ESQ и агрегаты, проверки на карточке, колонки реестра, редактируемая деталь, сохранение без закрытия и окна. Общая механика — `metadata-editing.md`. ✅ — проверено записью в CRM, 🧪 — не проверено.

## ✅ Новый модуль (Module) и встраивание в карточку с обменом сообщениями
**Подтверждено**: модуль загружается в карточку, получает параметр, принимает сообщение от карточки и отправляет ей своё.
- **Файлы модуля**: `descriptor.json` без `Parent`; `properties.json`: `"SchemaType": "Module"`; `metadata.json` — **формат B** (обычный JSON): `{"MetaData": {"Schema": {"ManagerName": "ClientUnitSchemaManager", "UId", "A2", "A5", "B1": [], "B2": [{"UId", "A2": "<Ключ>", "A3", "A4", "A5"}], "B3": [], "B6": "<UId пакета>", "B8", "HD1": "50e3acc0-26fc-4237-a095-849a1d534bd3", "HD4": 1, "HD6": "null", "HD5": [], "HD7": [], "HD8": [], "HD11": [], "HD20": [], "HD21": []}}}`; ресурсы — `Caption` + строки.
- **`.js` модуля**: `define("<Модуль>", ["<Модуль>Resources"], function(resources) { Ext.define("BPMSoft.configuration.<Модуль>", { extend: "BPMSoft.BaseModule", alternateClassName: "BPMSoft.<Модуль>", messages: {...}, init: function() { this.callParent(arguments); this.sandbox.registerMessages(this.messages); this.sandbox.subscribe("<Сообщение>", this.<метод>, this, [this.sandbox.id]); }, render: function(renderTo) { this.callParent(arguments); /* DOM в renderTo */ } }); return BPMSoft.<Модуль>; });`. Параметры загрузки — `this.parameters`. `renderTo` приводи к DOM: `Ext.isString(renderTo) ? Ext.getDom(renderTo) : (renderTo.dom || renderTo)`.
- **Встраивание в карточку** (образец — любая карточка проекта, где модуль грузится через `sandbox.loadModule` в контейнер из `diff`): в `diff` контейнер `{"id": "<Контейнер>", "selectors": {"wrapEl": "#<Контейнер>"}, "itemType": BPMSoft.ViewItemType.CONTAINER, "items": [], "afterrender": {"bindTo": "<загрузчик>"}, "afterrerender": {"bindTo": "<загрузчик>"}}`; загрузчик: `if (!this.get("IsEntityInitialized") || !Ext.get("<Контейнер>")) return; this.sandbox.loadModule("<Модуль>", {renderTo: "<Контейнер>", id: <id модуля>, keepAlive: false, parameters: {...}});` и вызов загрузчика ещё в `onEntityInitialized`. `id` модуля — `this.sandbox.id + "_<Модуль>"`.
- ✅ **Модуль в контейнере на вкладке** (подтверждено в CRM): при уходе с вкладки и возврате платформа перерисовывает её содержимое через `reRender` (`[app]/Resources/ui/BPMSoft/controls/component/component.js`), старый DOM с модулем выбрасывается, а у контейнера срабатывает `afterrerender`, не повторный `afterrender`. Загрузчик только на `afterrender` (или однократный `sandbox.loadModule` в `onEntityInitialized`) оставляет вкладку пустой. Рабочий вариант: один обработчик на `afterrender` и `afterrerender` контейнера, в нём `var renderTo = Ext.get("<Контейнер>"); if (!renderTo) return; this.sandbox.unloadModule(<id модуля>, renderTo); this.sandbox.loadModule("<Модуль>", {id: <id модуля>, renderTo: renderTo, parameters: {...}});`. Состояние модуля (прокрутка, ввод) при возврате сбрасывается. 🧪 Нужен ли `unloadModule` перед `loadModule`, отдельно не проверялось.
- ✅ **Несколько модулей на карточке** (подтверждено в CRM): у каждого контейнера свой загрузчик, который грузит только свой модуль и один раз. Повторный `sandbox.loadModule` того же модуля с тем же `id` пересоздаёт экземпляр и обрывает его незавершённый запрос — на экране остаётся заглушка («…»). Не вызывай загрузку всех модулей из `afterrender` каждого контейнера.
- **Сообщения PTP** (объявить в `messages` обеих сторон с `mode: BPMSoft.MessageMode.PTP` и нужным `direction`): карточка → модуль — `this.sandbox.publish("<Сообщение>", <данные>, [<id модуля>])`, модуль подписан с тегом `[this.sandbox.id]`; модуль → карточка — модуль публикует с тегом `[this.sandbox.id]`, карточка подписывается в `init` (после `callParent`) с тегом `[<id модуля>]`. Правила доставки PTP — «Сохранение без закрытия, окна, ModalBox, sandbox».
- ✅ **Адресное PTP-сообщение карточке конкретной записи** (подтверждено записью в CRM: модуль → замещение `BasePageV2`, карточка обновилась по сообщению): отправитель — `this.sandbox.publish("<Сообщение>", { entityId, entitySchemaName }, ["<entitySchemaName>_<id в нижнем регистре>"])`; карточка подписывается не в `init`, а в `onEntityInitialized` (после `callParent`), только при `this.isEditMode()`, с тегом `<entitySchemaName>_<PrimaryColumnValue>`; если тег сменился (другая запись в совмещённом режиме), старую подписку снимает `this.sandbox.unsubscribePtp("<Сообщение>", [<старый тег>])`, тег хранится в свойстве схемы. Перечитать поля и детали, как кнопка «Обновить данные», — `this.reloadEntity()`.
- ✅ PTP вызывает только первого подходящего подписчика — «Сохранение без закрытия, окна, ModalBox, sandbox» (там же: `null`, если подходящих нет). 🧪 По коду ядра (`[app]/conf/content/BasePageV2.js`, `bootstrap.js`) не проверялось: повторная подписка того же модуля с тем же тегом заменяет старую — запись, открытая в двух живых карточках, обновится в одной. `reloadEntity` вызывает `initEntity`, затем `onEntityInitialized`, затем `updateDetails`; в совмещённом режиме смена строки меняет `PrimaryColumnValue` и вызывает `reloadEntity`, модуль карточки не пересоздаётся.
- ✅ Два экземпляра одного модуля на одной карточке получают сообщение, если карточка публикует его отдельно на id каждого экземпляра (подтверждено в CRM). 🧪 Одним вызовом с массивом из двух тегов, по коду ядра, дойдёт только до первого: `publishPtpMessage` в `bootstrap.js` останавливается на первом совпавшем теге.
- ✅ Второй способ встраивания (подтверждено в CRM) — блок `modules: {}` + элемент `diff` с `itemType: BPMSoft.ViewItemType.MODULE` (см. `client-schemas.md`): модуль загрузился и обновлялся вместе с контейнером. ⚠️ Уточнение (подтверждено в CRM): запись `modules` только с `config.schemaName` (без `moduleName`) грузится модулем по умолчанию `BaseSchemaModuleV2` (`defaultModuleName` и `loadModule` в `[app]/conf/content/BaseSchemaViewModel.js`), который ждёт схему с вёрсткой (view model) и запрашивает `/<Модуль>Structure.js`; для схемы `SchemaType: Module` (`extend: "BPMSoft.BaseModule"`) это 404, модуль не появляется. Для такой схемы надёжный способ — `sandbox.loadModule` в контейнер (выше); 🧪 вариант с `"moduleName": "<Модуль>"` в записи `modules` не проверялся.

## ✅ Фильтр выпадающего списка справочника на карточке

**Подтверждено в CRM.** Чтобы ограничить список значений простого справочника на карточке, переопредели `getLookupQuery` схемы: для своей колонки добавь в запрос фильтр по `Id` (список разрешённых записей из модуля констант), для остальных колонок верни `this.callParent(arguments)`. Без условия видны все значения справочника, с условием — только перечисленные. Очистку уже выбранного недопустимого значения делай отдельно, в обработчике изменения управляющей колонки.

## ✅ Клиентский ESQ и запросы данных (JS)

**Подтверждено записью в CRM**, результаты сверены с SQL. Нужен, когда данные требуются прямо на странице (счётчик, проверка, подсказка). Массовую или важную логику держи на сервере.
- Запрос: `var esq = Ext.create("BPMSoft.EntitySchemaQuery", {rootSchemaName: "<Объект>"});`, колонки — `esq.addColumn("<Путь>", "<Псевдоним>")`.
- Список: `esq.getEntityCollection(function(result) { … }, this)`. Проверь `result.success`, затем `result.collection.getCount()`, `getByIndex(i)`, `each(function(item) { item.get("<Псевдоним>"); })`.
- Одна запись: `esq.getEntity(<Id>, function(result) { var entity = result.entity; }, this)`. ✅ `const {success, entity} = await esq.getEntityAsync(<Id>)`; для несуществующего Id — `success: true`, `entity: null` (без исключения).
- Справочная колонка в результате — объект `{value, displayValue, primaryImageValue, …}`, а не Guid.
- Фильтр по значению: `esq.filters.add("<ключ>", BPMSoft.createColumnFilterWithParameter(BPMSoft.ComparisonType.EQUAL, "<Колонка>", <значение>))` или `esq.filters.addItem(<фильтр>)`. Справочная колонка — имя без `Id`, значение — Guid.
- `IN`: `BPMSoft.createColumnInFilterWithParameters("<Колонка>", [<Id>, …], BPMSoft.DataValueType.GUID)`.
- Пусто: `BPMSoft.createColumnIsNullFilter("<Колонка>")`.
- Группа «ИЛИ»: `var group = Ext.create("BPMSoft.FilterGroup"); group.logicalOperation = BPMSoft.LogicalOperatorType.OR; group.addItem(<фильтр>);`, затем `esq.filters.addItem(group)`.
- Есть связанные записи: `BPMSoft.createExistsFilter("[<Деталь>:<Колонка связи>].Id")` (или `esq.createExistsFilter(…)`). Нет связанных записей: `esq.createNotExistsFilter(…)`. Условие на запись детали: `filter.subFilters.addItem(BPMSoft.createColumnFilterWithParameter(BPMSoft.ComparisonType.EQUAL, "<Колонка детали>", <значение>))`.
- Количество записей детали у каждой записи: `esq.addAggregationSchemaColumn("[<Деталь>:<Колонка связи>].Id", BPMSoft.AggregationType.COUNT, "<Псевдоним>", BPMSoft.AggregationEvalType.ALL)`. В документации Creatio встречается `addAggregationSchemaColumnFunctionColumn` — в BPMSoft такого метода нет.
- Колонка отображения объекта: `esq.addMacrosColumn(BPMSoft.QueryMacrosType.PRIMARY_DISPLAY_COLUMN, "<Псевдоним>")`.
- ✅ Системная настройка на клиенте: `BPMSoft.SysSettings.querySysSettingsItem("<Код>", function(value) { … }, this)` — у кешируемой настройки колбэк вызывается сразу (синхронно), у некешируемой — после запроса к серверу, поэтому значение используй только внутри колбэка. `await BPMSoft.SysSettings.querySysSettingsItemAsync("<Код>")` — значение; `querySysSettings(["<Код1>", "<Код2>"], function(values) { values.<Код1> … }, this)` — объект «код → значение»; `getCachedSysSetting("<Код>")` — только из кеша. `postPersonalSysSettingsValue("<Код>", <значение>, callback)` пишет персональное значение и сразу обновляет кеш; `postSysSettingsValue` — общее. Значение настройки типа «Защищённый текст» клиенту не отдаётся. Кеш и права — `data-edit.md`, «Системная настройка».
- ✅ Регистр строк (через `DataService`, тот же JSON, что строит клиентский ESQ): `BPMSoft.ComparisonType.EQUAL` (3) и `CONTAIN` (11) на PostgreSQL регистр **не учитывают** («консультация» находит «Консультация»).
- ✅ `addMacrosColumn(macrosType, alias)` — только `BPMSoft.QueryMacrosType.PRIMARY_COLUMN` (34) и `PRIMARY_DISPLAY_COLUMN` (35); макросы дат и пользователя (`CURRENT_USER`, `CURRENT_USER_CONTACT`, `TODAY`) колонкой — `NotSupportedException`, они работают в фильтрах (проверено: `CreatedBy` = `CURRENT_USER_CONTACT` даёт записи текущего пользователя).
- ✅ `addDatePartFunctionColumn("<Колонка даты>", BPMSoft.DatePartType.MONTH, alias)` — число (месяц, `DAY` 1, `WEEK` 2, `MONTH` 3, `YEAR` 4, `WEEK_DAY` 5, `HOUR` 6); `addParameterColumn(<значение>, BPMSoft.DataValueType.TEXT, alias)` — одинаковое значение в каждой строке; `esq.rowCount = N` — не больше N строк; `esq.isDistinct = true` — без повторов.
- ✅ Условие бизнес-правила по системной настройке (`ValueType.SYSSETTING`) читает только `BPMSoft.SysSettings.cachedSettings` (по коду `BusinessRulesApplierV2`): у некешируемой настройки (`IsCacheable: false`) значение `undefined` и ошибка в консоли `InvalidSysSetting`. Для таких настроек — `querySysSettingsItem` в коде страницы.
- По коду `ServiceHelper`: `callService({serviceName, methodName, data, callback, scope, timeout})` — форма с тайм-аутом; колбэк получает `(ответ, success)`: при успехе — разобранный JSON, при ошибке — сырой ответ (`status`, `responseText`). `callServiceAsync` возвращает Promise, который не отклоняется — проверяй ответ. `callCoreService({serviceName, methodName, data}, callback)` — для `.svc`-сервисов ядра (`/0/ServiceModel/<Сервис>.svc/<Метод>`).
- Вставка: `var insert = Ext.create("BPMSoft.InsertQuery", {rootSchemaName: "<Объект>"}); insert.setParameterValue("<Колонка>", <значение>, BPMSoft.DataValueType.TEXT);` Справочная колонка — имя без `Id`, тип `BPMSoft.DataValueType.GUID`.
- Удаление: `var del = Ext.create("BPMSoft.DeleteQuery", {rootSchemaName: "<Объект>"}); del.filters.addItem(del.createColumnFilterWithParameter(BPMSoft.ComparisonType.EQUAL, "<Колонка>", <значение>));`.
- Выполнение: `query.execute(function(response) { … }, this)`. Пакет запросов: `var batch = Ext.create("BPMSoft.BatchQuery"); batch.add(<запрос>); batch.execute(function(response) { … }, this);`.
- Ответ пакета: `{queryResults: [{id, rowsAffected, success, …}], success}`, у вставки `id` — Id новой записи. Ответ `DeleteQuery`: `{rowsAffected, success}`.
- ✅ `InsertQuery`, `UpdateQuery`, `DeleteQuery` идут через сущность: слушатели объекта срабатывают, журнал изменений пишется (`integration-api.md`). `addParameterColumn` и `addDatePartFunctionColumn` — ✅ (выше, в «Клиентский ESQ и запросы данных (JS)»); агрегат с условием — ✅ ниже, «Агрегат с условием в клиентском ESQ».

## ✅ Карточка: проверка по БД, значения и фильтр детали, сортировка списка, сообщения

**Подтверждено записью в CRM.**
- Фильтр справочного поля правилом `FILTRATION` в `rules` (✅) и коды `BusinessRuleModule.enums` — `client-rules-edit.md`, `client-rules.md`.
- Сортировка справочного поля: атрибут `"<Колонка>": {lookupListConfig: {orders: [{columnPath: "Name", direction: BPMSoft.OrderDirection.DESC}]}}`. Действует только в выпадающем списке поля (подсказки при вводе: `getLookupQuery` → `applyColumnsOrderToLookupQuery` в `BasePageV2.js`). Окно выбора справочника строит свой запрос и порядок не меняет — проверено.
- Проверка по БД перед сохранением — переопредели `asyncValidate`:
  ```js
  asyncValidate: function(callback, scope) {
  	this.callParent([function(response) {
  		if (!this.validateResponse(response)) {
  			return;
  		}
  		var esq = Ext.create("BPMSoft.EntitySchemaQuery", {rootSchemaName: "<Объект>"});
  		esq.addColumn("Id");
  		esq.filters.addItem(BPMSoft.createColumnFilterWithParameter(
  			BPMSoft.ComparisonType.EQUAL, "<Колонка>", this.get("<Колонка>")));
  		esq.filters.addItem(BPMSoft.createColumnFilterWithParameter(
  			BPMSoft.ComparisonType.NOT_EQUAL, "Id", this.get("Id")));
  		esq.getEntityCollection(function(result) {
  			if (result.success && result.collection.getCount() > 0) {
  				callback.call(scope, {success: false, message: resources.localizableStrings.<Строка>});
  				return;
  			}
  			callback.call(scope, response);
  		}, this);
  	}, this]);
  }
  ```
  Карточка не сохраняется и показывает `message` в окне. Синхронные проверки полей — `setValidationConfig` (`client-pages-edit.md`, раздел «Атрибуты, методы, правила, валидация и кнопка на карточке»).
- Деталь в `details`: `"defaultValues": {"<Колонка детали>": {"masterColumn": "<Колонка карточки>"}, "<Колонка>": {"value": <значение>}}` — значения подставляются в новую запись детали (проверено на редактируемой детали: строка добавления заполнена, запись сохранилась с этими значениями). `"filterMethod": "<метод карточки>"` — метод возвращает `BPMSoft.FilterGroup` и полностью заменяет `filter`, поэтому связь с карточкой добавь в группу сам: `group.addItem(BPMSoft.createColumnFilterWithParameter(BPMSoft.ComparisonType.EQUAL, "<Колонка связи>", this.get("Id")))`. Есть `BPMSoft.ComparisonType.NOT_START_WITH`.
- Сообщение, не объявленное в `messages`, не уходит (исключение — см. «Сохранение без закрытия, окна, ModalBox, sandbox»). Объявляй каждое сообщение.
- Окно «Да/Нет» — `showConfirmationDialog`, см. «Сохранение без закрытия, окна, ModalBox, sandbox» (там же `returnCode`). Свои кнопки — `source-code-edit.md`.

## ✅ Колонки реестра нового раздела по умолчанию
**Подтверждено записью в CRM**: без настройки новый раздел показывает в реестре только отображаемую колонку объекта — `BaseDataView.getDefaultSectionGridProfile` передаёт в `DefaultProfileHelper.getEntityProfile` только её. Свой набор колонок по умолчанию (для пользователей без сохранённой настройки колонок) задаётся переопределением этого метода в схеме раздела; совмещённый режим (вертикальный реестр) остаётся родительским.
```javascript
define("<Объект>Section", ["DefaultProfileHelper"], function(DefaultProfileHelper) {
	return {
		entitySchemaName: "<Объект>",
		methods: {
			getDefaultSectionGridProfile: function() {
				var entitySchema = this.getGridEntitySchema();
				var profilePropertyName = this.getDataGridName();
				if (Ext.isEmpty(entitySchema) || Ext.isEmpty(profilePropertyName) ||
						profilePropertyName.indexOf(this.verticalProfileKeySuffix) > -1) {
					return this.callParent(arguments);
				}
				var columns = [];
				BPMSoft.each(["<Колонка1>", "<Колонка2>"], function(columnName) {
					var column = entitySchema.columns[columnName];
					if (column) {
						columns.push({name: column.name, caption: column.caption,
							dataValueType: column.dataValueType, columnPath: column.name});
					}
				}, this);
				if (columns.length === 0) {
					return this.callParent(arguments);
				}
				var defProfile = DefaultProfileHelper.getEntityProfile("", this.getGridEntitySchemaName(),
					BPMSoft.GridType.LISTED, columns);
				return defProfile && defProfile.DataGrid;
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});
```
Пользователь, уже сохранивший свою настройку колонок, видит её, а не профиль по умолчанию.

## ✅ Редактируемая деталь (ConfigurationGrid)
**Подтверждено записью в CRM** (деталь-наследник `BaseGridDetailV2`): строки добавляются, правятся и удаляются прямо в реестре детали. Образцы — детали проекта с тем же родителем.
- Зависимости `define`: `"ConfigurationGridUtilitiesV2"`, `"ConfigurationGridGenerator"`, `"ConfigurationGrid"` (и `"DefaultProfileHelper"`, если задаёте колонки по умолчанию); блок `mixins: {ConfigurationGridUtilitiesV2: "BPMSoft.ConfigurationGridUtilitiesV2"}`; атрибут `"IsEditable"` (`BOOLEAN`, `VIRTUAL_COLUMN`, `value: true`).
- `diff` — `merge` элемента `DataGrid` со значениями: `"className": "BPMSoft.ConfigurationGrid"`, `"generator": "ConfigurationGridGenerator.generatePartial"`, `"generateControlsConfig": {"bindTo": "generateActiveRowControlsConfig"}`, `"changeRow": {"bindTo": "changeRow"}`, `"unSelectRow": {"bindTo": "unSelectRow"}`, `"onGridClick": {"bindTo": "onGridClick"}`, `"initActiveRowKeyMap": {"bindTo": "initActiveRowKeyMap"}`, `"activeRowAction": {"bindTo": "onActiveRowAction"}`, `"multiSelect": {"bindTo": "MultiSelect"}` и `"activeRowActions"` — кнопки `BPMSoft.Button` со стилем `TRANSPARENT` и `tag` `save` / `cancel` / `remove` (`imageConfig` — `Resources.Images.SaveIcon` / `CancelIcon` / `RemoveIcon`).
- Методы миксина, объявленного в самой схеме, переопределяются вызовом `this.mixins.ConfigurationGridUtilitiesV2.<метод>.apply(this, arguments)`, а не `callParent` (так `generateActiveRowControlsConfig`, `getCellControlsConfig`, `onActiveRowAction`). Методы базовых схем и их миксинов (`checkCanDelete` из `GridUtilities`, `addGridDataColumns`, `initQuerySorting`) — через `this.callParent(arguments)`.
- Ячейку только для чтения задаёт `getCellControlsConfig(entitySchemaColumn)`: получить `config` из миксина и поставить `config.enabled = false`. Чтобы решать по строке (например, «чужая запись»), запомните id в `generateActiveRowControlsConfig(id)` и берите строку из `this.getGridData().get(id)`.
- Запрет удаления — `checkCanDelete(items, callback, scope)`: проверить строки, при отказе `this.showInformationDialog(<текст>)` и `return`, иначе `this.callParent(arguments)`.
- Колонки детали по умолчанию — переопределение `generateEntityProfile`: `DefaultProfileHelper.getEntityProfile(this.getProfileKey(), entitySchema.name, BPMSoft.GridType.LISTED, columns)` (у раздела то же делает `getDefaultSectionGridProfile`, см. выше). Колонки, нужные коду при любой настройке пользователя, добавляйте в запрос в `addGridDataColumns(esq)` (`esq.addColumn("<Колонка>")`).
- Если у записи нет своей карточки, пункты меню «Копировать» и «Изменить» убираются: `getCopyRecordMenuItem: BPMSoft.emptyFn`, `getEditRecordMenuItem: BPMSoft.emptyFn`.
- Запреты на клиенте — только удобство; настоящую защиту дублируйте слушателем на сервере (см. `server-events-edit.md`, «Слушатель событий объекта»).

## ✅ Деталь только для просмотра
**Подтверждено записью в CRM** (наследник `BaseGridDetailV2`): на детали нет добавления, изменения, копирования и удаления, двойной щелчок запись не открывает.
- `diff`: `{"operation": "remove", "name": "AddRecordButton"}` и `{"operation": "remove", "name": "AddTypedRecordButton"}`.
- Методы: `getAddRecordButtonVisible` → `false`; `addRecordOperationsMenuItems: BPMSoft.emptyFn`; `getEditRecordMenuItem`, `getCopyRecordMenuItem`, `getDeleteRecordMenuItem` → `null`; `editRecord: BPMSoft.emptyFn` (двойной щелчок).
- Колонки по умолчанию — `generateEntityProfile`, как у редактируемой детали выше.
- ✅ Сортировка по умолчанию (новые сверху; подтверждено в CRM) — `initQuerySorting(esq)`: после `this.callParent(arguments)`, если ни у одной колонки нет `orderDirection`, взять колонку (`esq.columns.get("<Колонка>")` или `esq.addColumn("<Колонка>")`) и задать `orderPosition = 0`, `orderDirection = BPMSoft.OrderDirection.DESC`.
- Регистрация `SysDetail` и подключение к карточке — как у любой детали.

## ✅ Сохранение без закрытия, окна, ModalBox, sandbox
- `this.save({isSilent: true, callback: function(response, config) { … }, scope: this})` — карточка остаётся открытой; вызываются `onSaved(response, config)` (в `config` — `isSilent: true`) и затем колбэк в `scope`; после сохранения `IsChanged` = `false`, новая запись переходит в режим редактирования. Без `isSilent` (`BasePageV2.onSaved`): карточка **новой** записи закрывается, карточка существующей остаётся открытой. В своём `onSaved` всегда вызывай `this.callParent(arguments)`.
- `this.showInformationDialog("<Текст>", function(returnCode) { … }, {style: BPMSoft.MessageBoxStyles.BLUE})` — окно с «ОК», колбэк получает `"ok"`, `this` — страница.
- `this.showConfirmationDialog("<Текст>", function(returnCode) { if (returnCode === BPMSoft.MessageBoxButtons.YES.returnCode) { … } }, [BPMSoft.MessageBoxButtons.YES.returnCode, BPMSoft.MessageBoxButtons.NO.returnCode], {defaultButton: 0})` — кнопки «Да»/«Нет», `returnCode` — `"yes"`/`"no"`.
- `ModalBox` (модуль `"ModalBox"` в зависимостях `define`): `var container = ModalBox.show({widthPixels: 420, heightPixels: 160}, function() { /* закрыто */ }, this)` возвращает DOM-элемент — в него рендери содержимое; `ModalBox.close()` закрывает окно и вызывает колбэк закрытия; `ModalBox.setSize(w, h)`.
- ✅ Слои `z-index` клиентского ядра (подтверждено по коду платформы, `[app]/Resources/ui/combined/all-combined.css`, `[app]/Resources/ui/ExtJs/extjs-base-debug.js`): подсказка `.tip` — 10000, меню `.menu` — 3000, окно сообщения `.ts-messagebox-box` — 2500, маска загрузки `.ts-mask-container` — 1020; плавающие окна ExtJS — от 19000 и выше (`Ext.ZIndexManager.zBase` 9000, каждое новое окно `+= 10000`). Своё модальное окно поверх маски, но под меню и подсказками — между 1020 и 2500.
- Своя страница в модальном окне: схема-наследник `BaseModalBoxPage`, открытие — `this.sandbox.loadModule("ModalBoxSchemaModule", {id: this.sandbox.id + "_<Имя>", instanceConfig: {moduleInfo: {schemaName: "<Схема страницы>", <свои параметры>}}})`; параметры `moduleInfo` доступны странице; закрывается её методом `close` (кнопка-крестик есть в `BaseModalBoxPage`) и при смене адреса.
- Sandbox (по коду `bootstrap.js` и вызовам в CRM):
  - сообщение, не объявленное в `messages` (или после `this.sandbox.unRegisterMessages(["<Имя>"])`), — исключение «Message <Имя> is not defined in …» и при `publish`, и при `subscribe`;
  - направление: `PUBLISH` — подписка бросает исключение «cannot be subscribe»; `SUBSCRIBE` — публикация бросает «cannot be publish»; `BIDIRECTIONAL` — можно и то и другое;
  - `BROADCAST` доставляется всем подписчикам, включая сам модуль-отправитель; `publish` возвращает `true`, а не результат обработчика;
  - `PTP` вызывает первого подходящего подписчика и возвращает **результат его обработчика**; нет подходящего — `null`;
  - теги: публикация без тегов доходит только до подписок без тегов; с тегами — до подписок, у которых есть хотя бы один такой тег (`publish("<Имя>", args, ["<тег>"])`, `subscribe("<Имя>", handler, this, ["<тег>"])`);
  - ⚠️ третий аргумент `subscribe` — объект `scope`. Если передать не объект (например, `window` или строку), платформа примет его за теги — подписка молча перестанет получать сообщения без тегов;
  - сообщения можно объявить и в коде: `this.sandbox.registerMessages({"<Имя>": {mode: BPMSoft.MessageMode.PTP, direction: BPMSoft.MessageDirectionType.BIDIRECTIONAL}})`.

## ✅ Агрегат с условием в клиентском ESQ
```js
var esq = Ext.create("BPMSoft.EntitySchemaQuery", {rootSchemaName: "<Объект>"});
esq.addColumn("Name");
var subFilters = Ext.create("BPMSoft.FilterGroup");
subFilters.addItem(BPMSoft.createColumnFilterWithParameter(BPMSoft.ComparisonType.EQUAL, "<Колонка связанного объекта>", <значение>));
var column = Ext.create("BPMSoft.AggregationQueryColumn", {
	columnPath: "[<Связанный объект>:<Колонка-ссылка>].Id",
	aggregationType: BPMSoft.AggregationType.COUNT,
	subFilters: subFilters
});
esq.columns.add("<Псевдоним>", column);
```
- Пути в `subFilters` — от связанного объекта (`[<Связанный объект>:…]`), не от корня запроса. Результат совпал с SQL (`count(*) FILTER (WHERE …)`). Так же работает `BPMSoft.SubQueryColumn`.
- ❌ Условие в `expression.subFilters` колонки из `esq.addAggregationSchemaColumn(...)` (`FunctionQueryColumn`) **игнорируется** — запрос считает без условия; условие задавай в `BPMSoft.AggregationQueryColumn`, как ниже.
- Подзапрос в фильтре: `Ext.create("BPMSoft.CompareFilter", {comparisonType: …, leftExpression: Ext.create("BPMSoft.SubQueryExpression", {columnPath: "[<Объект>:<Колонка>].Id", aggregationType: BPMSoft.AggregationType.COUNT}), rightExpression: Ext.create("BPMSoft.ParameterExpression", {parameterValue: <число>})})` (по коду платформы).
