# Клиентские схемы: типы Section, Page, MiniPage, Detail, Module, Mixin и патч класса — факты

Признаки каждого типа по файлам схемы. Общее для всех типов (`metadata.json`, `SchemaType`, `Parent`/`ExtendParent`, `modules`, `details`, ресурсы) — в `client-schemas.md`; рецепты — в `client-schemas-edit.md`, `client-pages-edit.md`, `client-logic-edit.md`.

`details`, `rules`, `businessRules` и `businessRulesMultiplyActions` генератор применяет только у Page/MiniPage (см. `client-schemas-hierarchy.md`, «Как объединяются секции конфига между слоями»).

## Section (`SchemaType: ModuleViewModelSchema`)
- `.js`: `define("<Name>", [зависимости], function(...) { return { entitySchemaName: "<Entity>", attributes: {...}, details: {...}, mixins: {...}, messages: {...}, methods: {...}, diff: [...] }; });`
- `entitySchemaName` — связывает раздел с объектом (Entity), к которому он относится (например `"Lead"`, `"Contact"`).
- `attributes` — виртуальные (клиентские, не хранящиеся в БД) колонки: `{dataValueType: BPMSoft.DataValueType.X, type: BPMSoft.ViewModelColumnType.VIRTUAL_COLUMN, value: <дефолт>}`.
- `diff` — массив операций над деревом визуальных элементов раздела: `{"operation": "insert"|"merge"|"move"|"remove", "name": "<ИмяЭлемента>", "parentName": "<ИмяКонтейнера>", "propertyName": "items", "index": N, "values": {...}}` — то же самое, что показывает Designer при визуальном редактировании кнопок/полей раздела.

## Page (`SchemaType: EditViewModelSchema`)
- `.js`: та же форма, что у Section (`return { entitySchemaName, attributes, mixins, messages, businessRules, methods, dataModels, diff }`).
- `businessRules` — лежит прямо в `.js`, не в `metadata.json`; формат правил — `client-rules.md`.
- `diff.values.layout` — `{colSpan, rowSpan, column, row}` — координаты элемента на сетке страницы.

## MiniPage (тот же `SchemaType`, что и Page — различается только Parent-цепочкой)
- ❌ Признак MiniPage — `"layoutName": "MiniPage"` / `"isMiniPageModelItem": true` в элементах `diff`: неверно, у нескольких мини-карточек проекта с непустым `diff` этих признаков нет вообще (проверено на реальных `*MiniPage`-схемах). Это опциональное соглашение при вставке элемента в существующий контейнер `"MiniPage"` (см. ниже) — не структурный признак типа схемы.
- **Подтверждённый правильный признак**: MiniPage-схемы наследуются (`descriptor.json.Parent`) — прямо или через цепочку `ExtendParent`-переопределений — от фиксированной платформенной схемы с именем `"BaseMiniPage"` и ПОСТОЯННЫМ UId `"8e06a577-08e4-424e-bd89-798a34e1b928"` (совпадает во ВСЕХ проверенных реальных примерах, где `Parent` указывает на неё напрямую). У схем с собственным `ExtendParent: true` (например `ActivityMiniPage`, `AccountMiniPage`, `DayInCalendarMiniPage`) `Parent` указывает на себя же (обычный паттерн переопределения через пакеты) — конечный предок по цепочке классов всё равно `BaseMiniPage`, но это не видно напрямую в одном `descriptor.json`.
- Базовая страница (`BaseMiniPage`) определяет именованный контейнер `"MiniPage"` в своей вёрстке — поэтому у схем, наследующихся от неё напрямую, `diff`-элементы часто используют `"parentName": "MiniPage"` (подтверждено на реальной мини-карточке) и/или `"layoutName": "MiniPage"` внутри `values.layout` (подтверждено на `ContactMiniPage.js`, `ActivityMiniPage.js`) — это ссылка на конкретный именованный контейнер базовой страницы, а не общий признак типа.
- Методы миникарточки переопределяют специфичные для миникарточек хуки (например `setupMiniPageViewModeAttributes`, судя по `@inheritdoc BPMSoft.ContactMiniPage#setupMiniPageViewModeAttributes` в `ContactMiniPage.js`) — эти хуки не встречались в обычных Page/Section.
- Базовая абстрактная миникарточка (`BaseMiniPage`) может не иметь `entitySchemaName` вообще (не привязана к конкретному объекту) — в отличие от конкретной `ContactMiniPage` (`entitySchemaName: "Contact"`).
- **Мини-карточка открывается, только если зарегистрирована** в строке `SysModuleEdit` страницы редактирования объекта (для нужного типа): `MiniPageSchemaUId` + `MiniPageModes` — см. `registration.md` («Мини-карточка и карточки по типам»).

## Detail (`SchemaType: GridDetailViewModelSchema`)
- **Подтверждено на реальных деталях**: у Detail-схем `SchemaType` — ОТДЕЛЬНОЕ, уникальное значение `"GridDetailViewModelSchema"`, не совпадающее ни с одним другим типом — в отличие от Page/MiniPage или Module/Mixin, `SchemaType` один этот факт уже однозначно определяет тип схемы.
- `.js`: та же базовая форма, что у Section/Page (`return { entitySchemaName, attributes, details, methods, diff }`) — `attributes` не обязателен (встречаются детали без него).
- `descriptor.json.Parent` указывает на БАЗОВЫЙ ПЛАТФОРМЕННЫЙ класс детали по имени (например `FileDetailV2` или `BaseGridDetailV2`), а не на схему с тем же именем — для новой детали `ExtendParent` нет; у замещения существующей детали `ExtendParent: true` (`client-pages-edit.md`, «Замещение (override) существующей детали»). Это тот же паттерн "отдельная схема, наследующая от другой именованной схемы", что и у новых карточек, — подтверждено на реальных деталях.
- `diff` для элементов панели инструментов детали использует `"parentName": "Detail"`, `"propertyName": "tools"` — отличается от `propertyName: "items"`, используемого для элементов карточки/раздела (Section/Page/MiniPage).
- Комментарии `@inheritdoc` в методах (например `BPMSoft.Configuration.BaseDetailV2#updateDetail`, `BPMSoft.FileDetailV2#onRender`, `BPMSoft.BaseGridDetailV2#onRender`) называют те же базовые классы, что и `descriptor.json.Parent.Name` — подтверждает, что `Parent` в дескрипторе — это реальный класс реализации детали, а не просто справочное поле.

## Module (`SchemaType: Module`, без `.mixins.` в namespace класса)
- `.js`: `define("<Name>", [зависимости], function(...) { Ext.define("BPMSoft.configuration.<Name>", { extend: "BPMSoft.BaseModule"` (или `"BPMSoft.BaseNestedModule"`) `, alternateClassName: "BPMSoft.<Name>", ...методы и свойства... }); return BPMSoft.<Name>; });` — **подтверждено на примерах**: класс явно расширяет базовый модуль (`extend`), реализует жизненный цикл (`init`/`render`/`destroy`), и модуль возвращает КЛАСС (не экземпляр) через `return BPMSoft.<Name>;`.
- Модуль встраивается в другую схему через её блок `modules: {}`: ключ совпадает с `name` diff-элемента `itemType: MODULE` (см. `client-schemas.md`, «`modules: {}` — встраивание Module-схемы в вёрстку»). Но `config.schemaName` работает только для схем с вёрсткой. Для `SchemaType: Module` на `BPMSoft.BaseModule` это 404 — такой модуль грузи через `sandbox.loadModule`, см. `client-logic-edit.md`, «Новый модуль (Module) и встраивание в карточку с обменом сообщениями».

## Mixin (`SchemaType: Module`, класс в `BPMSoft.configuration.mixins.*`)

Миксин — класс без `extend` и без `override`, который подмешивается в другую схему через её блок `mixins: {}`.
- `.js`: `define("<Name>", [зависимости], function(...) { Ext.define("BPMSoft.configuration.mixins.<Name>", { alternateClassName: "BPMSoft.<Name>", ...методы... }); return Ext.create("BPMSoft.<Name>"); });` (или без явного `return` — встречаются оба варианта: с `return Ext.create(...)` и без возврата).
- Не имеет ни `extend`, ни `override` — не наследует и не патчит базовый класс, а предназначен для явного подмешивания в другую схему через её блок `mixins: {}`.
- `alternateClassName` мискина — это ТОЧНО та строка, которую другие схемы указывают в своём блоке `mixins: { <ЛокальноеИмя>: "BPMSoft.<Name>" }` (подтверждено сопоставлением на реальном замещении раздела).
- Использование методов мискина из хост-схемы — через `this.mixins.<ЛокальноеИмя>.<метод>.call(this, ...)` (подтверждено на нескольких реальных схемах).

- Слои `z-index` клиентского ядра — `client-logic-edit.md`, «Сохранение без закрытия, окна, ModalBox, sandbox».

## Патч существующего класса (`Ext override`) — отдельный вид схемы, не миксин
- Схема `SchemaType: Module`, без `Parent`; в `.js` — `Ext.define("<ИмяКлассаПатча>", { override: "<полное имя патчимого класса>", <методы> })`. Методы патча заменяют методы класса на месте (механизм Ext.js `override`); `this.callParent(arguments)` внутри вызывает исходный метод.
- **Пространство имён класса патча — по патчимому классу, а не `.mixins.`**: в реальном проекте патчи объявлены в `BPMSoft.configuration.*`, в корне `BPMSoft.*`, в `BPMSoft.configuration.mixins.*` (в основном патчи самих миксинов), `BPMSoft.controls.*`, `BPMSoft.utilities.*`, `BPMSoft.data.filters.*`. Примеры: патч `BPMSoft.controls.Grid` объявлен как `BPMSoft.configuration.<Имя>`, патч утилиты — как `BPMSoft.utilities.<Имя>`. Исключение — патч модуля `BPMSoft.SummaryModule`, объявленный в `.mixins.`.
- **Загрузка**: патч применяется, только когда его модуль загружен — его имя должно стоять в зависимостях `define` схемы, которая точно загружается (в проекте такой патч подключён зависимостью замещения `BaseSectionV2`). В зависимостях самого патча — модуль патчимого класса, чтобы класс был определён раньше.
- ❌ ~~«override-миксин — подвид миксина, применяется автоматически самим фактом присутствия в пакете»~~ — неверно: это не миксин (не подмешивается через `mixins`), и сам по себе он не загружается.
