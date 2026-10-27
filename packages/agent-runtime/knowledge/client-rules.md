# Правила клиентских страниц: факты

Бизнес-правила карточки задаются в `.js` страницы тремя секциями. Платформа применяет их только у страниц (Page/MiniPage, `EDIT_VIEW_MODEL_SCHEMA`); у Section/Module/Detail секции игнорируются (`client-schemas-hierarchy.md`). В `metadata.json` правил нет — только в `.js` (✅ на реальных схемах проекта). Рецепты записи — `client-rules-edit.md`.

| Секция | Кто пишет | Маркеры в `.js` | Ключи |
|---|---|---|---|
| `rules` | разработчик, константы `BusinessRuleModule.enums` | без маркеров | `<Колонка>` → `<ИмяПравила>` → правило |
| `businessRules` | дизайнер страницы, числовые коды | `/**SCHEMA_BUSINESS_RULES*/{}/**SCHEMA_BUSINESS_RULES*/` | `<Колонка>` → `<uId правила>` → правило с тем же `uId` |
| `businessRulesMultiplyActions` | мастер бизнес-правил с несколькими действиями и группами условий | `/**SCHEMA_ANGULAR_BUSINESS_RULES*/{}/**SCHEMA_ANGULAR_BUSINESS_RULES*/` | `<Id правила>` → правило (Id = `businessRuleTree.id`) |

## ✅ Как платформа применяет правила (по коду `conf/content/ViewModelGeneratorV2.js` и `BusinessRulesApplierV2.js`)
- **Наследование слоёв** (генератор модели): `rules` и `businessRules` сливаются по колонке, затем по имени правила — свойства наследника поверх родительских. `businessRulesMultiplyActions` сливается плоско по Id правила: правило наследника с тем же Id заменяет родительское целиком. Плоское слияние включается, только если у первого правила слоя `businessRulesMultiplyActions: true` — ставь флаг в каждом правиле секции.
- **При открытии карточки** (`applyRules`): `rules` и `businessRules` объединяются по колонке и имени правила — правило из `businessRules` с тем же именем, что в `rules` (в том числе родительских), перекрывает его свойства. Затем добавляются правила `businessRulesMultiplyActions` с `enabled: true` и без `removed: true`. Правило `rules`/`businessRules` пропускается при `removed: true` или `enabled: false`.
- **Цель правила** — колонка-ключ (`columnName`): элемент `diff` с `bindTo` или `name`, равным ключу. У поля работают все свойства; у вкладки, группы, контейнера, детали и модуля — только `VISIBLE` (у вкладки — через видимость в коллекции вкладок, при скрытии активной вкладки выбирается первая видимая).
- **Свойство** превращается в метод модели (`<префикс><Колонка><visible|enabled|isRequired|readonly>`) и привязку `{bindTo: <метод>}` у элемента и его подписи (у `READONLY` подпись не трогается); `REQUIRED` ещё ставит `column.isRequired`. ⚠️ Два правила BINDPARAMETER на одну колонку и одно свойство создают метод с одним именем — работает только последнее, условия не объединяются. Порядок: `rules` + `businessRules`, затем `businessRulesMultiplyActions`. Нужно несколько условий — пиши их в одно правило.
- **Условия** `rules`/`businessRules`: массив `conditions`, объединение по `logical` (`BPMSoft.LogicalOperatorType`: `AND` 0, `OR` 1). У `businessRulesMultiplyActions` — дерево `businessRuleTree`: группа `{type: "group", logicalOperator: "&" | "|", childRuleTree: [...]}`, элемент-условие `{type: "condition", conditions: {comparisonType, leftExpression, rightExpression}}`, вложенные группы — любой глубины.
- **Выражение** (`type` = `BusinessRuleModule.enums.ValueType`): `CONSTANT` 0 — `value`; `ATTRIBUTE` 1 и `PARAMETER` 5 — `attribute` и необязательный `attributePath` (колонка справочника, платформа сама добавит её в `lookupListConfig.columns`); справочник без `attributePath` сравнивается по Id (`value`); `SYSSETTING` 2 — `value` = код настройки, только кешируемые (`client-logic-edit.md`); `SYSVALUE` 3 — `value` = имя системного значения (встречаются `CurrentUser`, `CurrentFunctionalRoles`, `CurrentOrganizationalRoles`), через `getSysDefaultValue`; `CARDSTATE` 4 — режим карточки `this.action` (🧪 значения `add`/`edit`/`copy` не проверены); `FORMULA` 6 — только источник `POPULATE_ATTRIBUTE` (`formula`, считает сервер). Булев тип приводится к `Boolean`, дата — к числу. `dataValueType` в выражении — код `BPMSoft.DataValueType` (`crm-db.md`); без него берётся тип колонки.
- **`comparisonType`** — `BPMSoft.ComparisonType` (`Resources/ui/BPMSoft/core/enums/sysenums.js`): `BETWEEN` 0, `IS_NULL` 1, `IS_NOT_NULL` 2, `EQUAL` 3, `NOT_EQUAL` 4, `LESS` 5, `LESS_OR_EQUAL` 6, `GREATER` 7, `GREATER_OR_EQUAL` 8, `START_WITH` 9, `NOT_START_WITH` 10, `CONTAIN` 11, `NOT_CONTAIN` 12, `END_WITH` 13, `NOT_END_WITH` 14. У `IS_NULL`/`IS_NOT_NULL` нет `rightExpression`.
- **Коды `BusinessRuleModule.enums`** (`conf/content/BusinessRuleModule.js`; в `businessRules` и `businessRulesMultiplyActions` дизайнер пишет числа): `Property` — `VISIBLE` 0, `ENABLED` 1, `REQUIRED` 2, `READONLY` 3 (`property: 1` — доступность, а не обязательность); `RuleType` — `DISABLED` -1, `BINDPARAMETER` 0, `FILTRATION` 1, `AUTOCOMPLETE` 2, `POPULATE_ATTRIBUTE` 3; `ValueType` — выше; `AutocompleteType` — `ASIS` 0, `VALUE` 1, `DISPLAYVALUE` 2.

## ✅ Типы правил (по коду `BusinessRulesApplierV2.js`)
- **`BINDPARAMETER` 0** — видимость, доступность, обязательность, только чтение: `property`, `conditions`, `logical`. Без `conditions` или `property` — исключение `InvalidFormatException` при открытии карточки.
- **`FILTRATION` 1** — фильтр справочной колонки-ключа: `baseAttributePatch` — колонка справочного объекта, по которой фильтруем; `comparisonType` обязателен (без него исключение); значение — `type` + `value` или `attribute` (+ `attributePath`), `dataValueType`. Пустое значение — фильтр не накладывается. `autocomplete: true` — при выборе записи в колонке-ключе заполнить `attribute` значением её `baseAttributePatch`; `autoClean: true` — при смене `attribute` очистить колонку-ключ.
- **`AUTOCOMPLETE` 2** — заполнение колонки по выбранной справочной записи (`attribute`, `baseAttributePatch`, `autocompleteType`).
- **`POPULATE_ATTRIBUTE` 3** — записать значение в колонку-ключ, когда условия выполнены: `populatingAttributeSource: {expression: {type, attribute, attributePath | value | formula}}`, `conditions`, `logical`. Работает только при включённой функции `PopulateBusinessRuleAction` (`BPMSoft.Features`), иначе молча пропускается. Колонка-цель не может стоять в условиях (ошибка `ConditionFieldIsPresentedInActionError` в консоли). Срабатывает при изменении колонок из условий и при заполнении значений по умолчанию (новая запись); при открытии существующей записи — нет (✅ 27.10.2026); пустой источник даёт значение по умолчанию типа (`false`, 0, `""`, `null`).
- **`DISABLED` -1** — правило не применяется.

## ✅ Форматы (на реальных схемах проекта)
`businessRules` — правило дизайнера:
```js
businessRules: /**SCHEMA_BUSINESS_RULES*/{
	"<Колонка>": {
		"<uId>": {
			"uId": "<uId>",
			"enabled": true,
			"removed": false,
			"ruleType": 0,
			"property": 2,
			"logical": 0,
			"conditions": [{
				"comparisonType": 3,
				"leftExpression": {"type": 1, "attribute": "<Справочная колонка>", "attributePath": "<Колонка справочника>"},
				"rightExpression": {"type": 0, "value": "<Id записи>", "dataValueType": 10}
			}]
		}
	}
}/**SCHEMA_BUSINESS_RULES*/,
```
Отключение правила родителя — в наследнике то же имя под той же колонкой: `"<Колонка>": {"<ИмяПравила родителя>": {"uId": "<новый Guid>", "removed": true}}`. Встречается и для правил из `rules` родителя (по имени, например `FiltrationContactByAccount`), и для правил дизайнера (по `uId`).
Правило `POPULATE_ATTRIBUTE`: `{"uId", "enabled": true, "removed": false, "ruleType": 3, "populatingAttributeSource": {"expression": {"type": 1, "attribute": "<Справочная колонка>", "attributePath": "<Колонка справочника>"}}, "logical": 0, "conditions": [{"comparisonType": 2, "leftExpression": {"type": 1, "attribute": "<Справочная колонка>"}}]}`. Правило `FILTRATION`: `{"uId", "enabled": true, "removed": false, "ruleType": 1, "baseAttributePatch": "<Колонка справочника>", "comparisonType": 3, "autoClean": true, "autocomplete": false, "type": 1, "attribute": "<Колонка карточки>"}`.

`businessRulesMultiplyActions` — правило с деревом условий и списком действий:
```js
businessRulesMultiplyActions: /**SCHEMA_ANGULAR_BUSINESS_RULES*/{
	"<Id правила>": {
		"businessRulesMultiplyActions": true,
		"name": [{"cultureName": "en-US", "value": "<Название>"}, {"cultureName": "ru-RU", "value": "<Название>"}],
		"enabled": true,
		"removed": false,
		"businessRuleTree": {
			"id": "<Id правила>",
			"type": "group",
			"logicalOperator": "&",
			"actions": [
				{"ruleType": 0, "property": 0, "columnName": "<Колонка>", "expressionColumnType": "ColumnBusinessRuleExpression"}
			],
			"childRuleTree": [
				{
					"id": "<Guid условия>",
					"type": "condition",
					"conditions": {
						"comparisonType": 3,
						"leftExpression": {"type": 1, "expressionType": "ColumnBusinessRuleExpression", "dataValueType": 12, "metaPath": "<UId колонки объекта>", "attribute": "<Колонка>"},
						"rightExpression": {"type": 0, "expressionType": "ConstantBusinessRuleExpression", "dataValueType": 12, "value": true}
					}
				},
				{"id": "<Guid группы>", "type": "group", "logicalOperator": "|", "childRuleTree": [ /* условия */ ]}
			]
		}
	}
}/**SCHEMA_ANGULAR_BUSINESS_RULES*/,
```
Название правила — прямо в `name` на двух языках, в ресурсы не выносится. У справочного выражения дизайнер добавляет `"entitySchemaName": "<Справочник>"`, у вложенных условий — `"selected": false, "groupOptions": false`, у действия — `"invalid": false`. Применение правила (`BusinessRulesApplierV2`) читает только `type`, `attribute`, `attributePath`, `value`, `dataValueType`, `comparisonType`, `logicalOperator`, `childRuleTree`, `actions`; `metaPath`, `expressionType`, `entitySchemaName` нужны дизайнеру для показа правила. Каждое действие применяется как отдельное правило со своими `ruleType`, `property`, `columnName` и общими условиями дерева; в проектах встречались только `ruleType` 0 со свойствами `VISIBLE` и `REQUIRED`.
