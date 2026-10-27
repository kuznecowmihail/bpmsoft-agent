# Правила клиентских страниц — рецепты

Как написать или изменить бизнес-правило карточки файлами. Коды, форматы и то, как платформа применяет правила, — `client-rules.md`. Общая механика клиентских схем и обязательная иерархия родителя — `client-schemas-edit.md`, карточка целиком — `client-pages-edit.md`. ✅ — проверено записью в CRM, 🧪 — не проверено.

## Какую секцию выбрать
- **Новое правило в своём коде** — `rules` с константами `BusinessRuleModule.enums` (читается, проверено записью). Зависимость `BusinessRuleModule` — в `define`.
- **Правка правила, созданного дизайнером** — в его секции (`businessRules` или `businessRulesMultiplyActions`), в её формате и между маркерами. Не переноси его в `rules`.
- **Отключить правило родителя** — в наследнике, в той секции, где оно объявлено у родителя (рецепт ниже).
- Перед записью собери иерархию (`client-schemas-edit.md`): скрипт выводит имена правил всех слоёв (`<Колонка>.<Правило>`, у `businessRulesMultiplyActions` — Id). Не создавай второе правило с тем же свойством на ту же колонку — сработает только одно (`client-rules.md`); добавь условие в существующее.

## ✅ `rules`: обязательность, видимость, доступность
**Подтверждено** на тестовой карточке (REQUIRED + GREATER, VISIBLE + IS_NOT_NULL):
```js
rules: {
	"<Колонка>": {
		"<ИмяПравила>": {
			ruleType: BusinessRuleModule.enums.RuleType.BINDPARAMETER,
			property: BusinessRuleModule.enums.Property.REQUIRED, // VISIBLE | ENABLED | READONLY
			logical: BPMSoft.LogicalOperatorType.AND,
			conditions: [{
				leftExpression: {type: BusinessRuleModule.enums.ValueType.ATTRIBUTE, attribute: "<Колонка>"},
				comparisonType: BPMSoft.ComparisonType.GREATER, // EQUAL | IS_NOT_NULL | …
				rightExpression: {type: BusinessRuleModule.enums.ValueType.CONSTANT, value: <значение>}
			}]
		}
	}
},
```
У `IS_NOT_NULL`/`IS_NULL` нет `rightExpression`. Ключ правила может быть именем вкладки, группы или детали из `diff` — тогда работает только `VISIBLE`. Свойство справочной колонки в условии — `attributePath`; системная настройка — `type: SYSSETTING, value: "<Код>"` (только кешируемые); текущий пользователь — `type: SYSVALUE, value: "CurrentUser"` (🧪).

## ✅ `rules`: фильтр справочного поля (`FILTRATION`)
**Подтверждено записью в CRM (21.10.2026).**
```js
"<Колонка справочника>": {
	"<ИмяПравила>": {
		ruleType: BusinessRuleModule.enums.RuleType.FILTRATION,
		autocomplete: false,
		baseAttributePatch: "<Колонка справочного объекта>",
		comparisonType: BPMSoft.ComparisonType.EQUAL,
		type: BusinessRuleModule.enums.ValueType.CONSTANT,
		value: <значение>
	}
}
```
Фильтр действует и в окне выбора, и в выпадающем списке. Уже заполненное значение, которое не проходит фильтр, остаётся в поле. Id записи в `value` выноси в клиентский модуль констант (`client-schemas-edit.md`). Фильтр по другому полю карточки — `type: BusinessRuleModule.enums.ValueType.ATTRIBUTE, attribute: "<Колонка карточки>"` и `autoClean: true` (очистить поле при смене значения), 🧪 не проверено.

## ✅ `rules`: заполнить колонку по условию (`POPULATE_ATTRIBUTE`)
**Подтверждено записью в CRM (27.10.2026)**: значение справочной колонки с `attributePath` (колонка справочника подгружается сама) записывается в колонку-цель при смене колонки из условий. ⚠️ При открытии существующей записи правило не срабатывает — колонка-цель остаётся как в БД, пока не изменится колонка из условий. Работает только при включённой функции `PopulateBusinessRuleAction` — проверь её в БД (`crm-db.md`, таблицы `Feature` и `AdminUnitFeatureState`) до записи; иначе заполняй колонку методом по `dependencies` атрибута (`client-pages-edit.md`).
```js
"<Колонка-цель>": {
	"<ИмяПравила>": {
		ruleType: BusinessRuleModule.enums.RuleType.POPULATE_ATTRIBUTE,
		populatingAttributeSource: {expression: {type: BusinessRuleModule.enums.ValueType.ATTRIBUTE, attribute: "<Справочная колонка>", attributePath: "<Колонка справочника>"}},
		logical: BPMSoft.LogicalOperatorType.AND,
		conditions: [{leftExpression: {type: BusinessRuleModule.enums.ValueType.ATTRIBUTE, attribute: "<Справочная колонка>"}, comparisonType: BPMSoft.ComparisonType.IS_NOT_NULL}]
	}
}
```
Колонку-цель не ставь в условия.

## ✅ `businessRules`: правило в формате дизайнера
**Подтверждено записью в CRM (27.10.2026)** для BINDPARAMETER (REQUIRED по значению справочника); FILTRATION и POPULATE_ATTRIBUTE в этой секции — формат по реальным схемам, запись 🧪. Пиши, только если в схеме уже есть правила дизайнера в этой секции или пользователь просит правило, которое потом будет править в дизайнере.
- Между маркерами `/**SCHEMA_BUSINESS_RULES*/` — обычный JSON: ключи в кавычках, только числовые коды (`client-rules.md`), без констант и функций.
- Ключ правила и `uId` — один новый Guid в нижнем регистре; `enabled: true`, `removed: false`.
- У константы-справочника в `rightExpression` — `"dataValueType": 10` (GUID), у булевой — 12.
- Шаблоны BINDPARAMETER, FILTRATION, POPULATE_ATTRIBUTE — в `client-rules.md`, раздел «Форматы».

## ✅ `businessRulesMultiplyActions`: одно условие — несколько действий
**Подтверждено записью в CRM (27.10.2026)**: два действия (VISIBLE и REQUIRED) на дереве «условие И (группа ИЛИ из двух IS_NOT_NULL)» — оба действия пересчитываются при открытии карточки и при каждой смене колонок из условий. Подходит, когда одно и то же условие (с группами И/ИЛИ) управляет несколькими полями.
- Шаблон — `client-rules.md`, раздел «Форматы». Ключ правила = `businessRuleTree.id` — новый Guid; `"businessRulesMultiplyActions": true` в **каждом** правиле секции (без него наследование слоёв сломается); `name` — на `ru-RU` и `en-US`.
- `actions` — по элементу на колонку и свойство: `{"ruleType": 0, "property": <код>, "columnName": "<Колонка>", "expressionColumnType": "ColumnBusinessRuleExpression"}`.
- Условие — `{"id": "<Guid>", "type": "condition", "conditions": {...}}`, вложенная группа — `{"id": "<Guid>", "type": "group", "logicalOperator": "&" | "|", "childRuleTree": [...]}`.
- В выражении колонки — `"expressionType": "ColumnBusinessRuleExpression"`, `"metaPath": "<UId колонки объекта>"` (из `metadata.json` объекта или `crm-db.md`), `"dataValueType"`, у справочника ещё `"entitySchemaName": "<Справочник>"`; у константы — `"expressionType": "ConstantBusinessRuleExpression"`, `"dataValueType"`, `"value"` (у справочника ещё `"entitySchemaName"`). Без `metaPath` правило по коду платформы работает (🧪), но дизайнер может не показать колонку.

## Отключить правило родителя
Формат — ✅ на реальных схемах проекта; первый способ ✅ подтверждён записью в CRM (27.10.2026) на правиле `rules` родителя-своей карточки: метод обязательности колонки у наследника не создаётся.
- Правило из `rules` или `businessRules` родителя — в наследнике в `businessRules` под той же колонкой и тем же именем: `"<ИмяПравила>": {"uId": "<новый Guid>", "removed": true}`. Либо в `rules` наследника: `"<ИмяПравила>": {enabled: false}` (🧪).
- Правило `businessRulesMultiplyActions` родителя — в наследнике то же Id с `"businessRulesMultiplyActions": true, "enabled": false` (правило заменяется целиком, по коду генератора). 🧪
