# Исходный код (SourceCodeSchemaManager) — рецепты создания/редактирования

Общая механика ресурсов и локализации — см. `metadata-editing.md`. **Важное уточнение**: SourceCode использует ПЛОСКИЙ JSON формат (`metadata.json`), а НЕ построчный diff-журнал (как Entity/большинство Process) — значит правила «diff-журнала» и «последняя запись побеждает» из `metadata-editing.md` К НЕМУ НЕ ПРИМЕНЯЮТСЯ. Только общие правила про ресурсы, локализацию, `ModifiedOnUtc` применимы (см. `metadata-editing.md`).

**Не забывай про обязательное правило из `metadata-editing.md`: `ModifiedOnUtc` в `descriptor.json` должно обновляться при любом создании новой схемы на РЕАЛЬНЫЙ текущий момент времени в формате `"\/Date(<миллисекунды>)\/"` (получить можно через `date +%s000`).**

## ✅ Создать схему исходного кода с нуля
**Подтверждено 05.10.2026** на `TestSrcHelper` (класс-помощник с локализуемой строкой и логом) и `TestSrcService` (REST-сервис): после «Обновить из файловой системы» и компиляции дизайнер показал код и локализуемую строку, вызов сервиса из браузера вернул `{GreetResult: "Привет, тест S1! …"}`, строка помощника попала в `Common.log`.

Файлы: `Schemas/<Имя>/descriptor.json`, `properties.json`, `metadata.json`, `<Имя>.cs`; `Resources/<Имя>.SourceCode/resource.ru-RU.xml` и `resource.en-US.xml`.

### `descriptor.json`
```json
{
  "Descriptor": {
    "UId": "<новый GUID>",
    "Name": "TestSrcHelper",
    "ModifiedOnUtc": "\/Date(<date +%s000>)\/",
    "ManagerName": "SourceCodeSchemaManager",
    "Caption": "Test S1: помощник",
    "DependsOn": []
  }
}
```
Без `Parent`. `Caption` — любое читаемое название.

### `properties.json`
```json
{
  "Properties": {
    "CreatedInVersion": "1.9.0.17103"
  }
}
```

### `metadata.json` (плоский JSON)
```json
{
  "MetaData": {
    "Schema": {
      "ManagerName": "SourceCodeSchemaManager",
      "UId": "<UId из descriptor.json>",
      "A2": "TestSrcHelper",
      "A5": "<новый GUID>",
      "B1": [],
      "B2": [
        {
          "UId": "<новый GUID>",
          "A2": "TestGreetingTemplate",
          "A3": "<UId схемы>",
          "A4": "<UId схемы>",
          "A5": "<A5 схемы>"
        }
      ],
      "B3": [],
      "B6": "<UId пакета>",
      "B8": "1.9.0.17103",
      "HD1": "50e3acc0-26fc-4237-a095-849a1d534bd3"
    }
  }
}
```
- `B2` — локализуемые строки схемы, по записи на ключ. Без строк — `"B2": []`.
- `HD1` — UId родителя (`ParentSchemaUId`); бери `50e3acc0-26fc-4237-a095-849a1d534bd3`, как почти у всех схем исходного кода.

### `<Имя>.cs`
Помощник:
```csharp
namespace BPMSoft.Configuration
{
	using System;
	using BPMSoft.Common;
	using BPMSoft.Core;
	using global::Common.Logging;

	public class TestSrcHelper
	{
		private static readonly ILog _log = LogManager.GetLogger("Common");
		private readonly UserConnection _userConnection;

		public TestSrcHelper(UserConnection userConnection)
		{
			_userConnection = userConnection;
		}

		public string Greet(string name)
		{
			var template = new LocalizableString(_userConnection.Workspace.ResourceStorage,
				"TestSrcHelper", "LocalizableStrings.TestGreetingTemplate.Value").ToString();
			var result = string.Format(template, name, DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss"));
			_log.Info("TestSrcHelper: " + result);
			return result;
		}
	}
}
```
REST-сервис:
```csharp
namespace BPMSoft.Configuration
{
	using System.ServiceModel;
	using System.ServiceModel.Activation;
	using System.ServiceModel.Web;
	using BPMSoft.Web.Common;

	[ServiceContract]
	[AspNetCompatibilityRequirements(RequirementsMode = AspNetCompatibilityRequirementsMode.Required)]
	public class TestSrcService : BaseService
	{
		[OperationContract]
		[WebInvoke(Method = "POST", RequestFormat = WebMessageFormat.Json,
			BodyStyle = WebMessageBodyStyle.Wrapped, ResponseFormat = WebMessageFormat.Json)]
		public string Greet(string name)
		{
			return new TestSrcHelper(UserConnection).Greet(name);
		}
	}
}
```
- Пространство имён — `BPMSoft.Configuration` (так у образцов проекта); классы одного пространства видят друг друга без `using`.
- `LocalizableString` — в `BPMSoft.Common` (не в `BPMSoft.Core`): без `using BPMSoft.Common;` компиляция падает с CS0246 (проверено). При ошибке «тип не найден» ищи тип в `[app]/BPMSoft.*.xml` (`platform-api.md`) и бери пространство имён оттуда.
- Логгер проекта — `LogManager.GetLogger("Common")` из `global::Common.Logging`; строки видны в `[app]/Logs/<ГГГГ-ММ-ДД>/Common.log`.
- Вызов сервиса с клиента: `ServiceHelper.callService("<Сервис>", "<Метод>", function (r) { ... }, {<параметры>})` — ответ приходит как `{<Метод>Result: <значение>}`. Проверка из консоли браузера: `require(["ServiceHelper"], function (sh) { sh.callService("TestSrcService", "Greet", function (r) { console.log(r); }, { name: "тест" }); });`.
- ✅ `ServiceHelper.callService` всегда шлёт `POST` с телом `{}` (подтверждено в CRM, 09.10.2026): метод, который вызывают так, объявляй с `Method = "POST"` и `BodyStyle = WebMessageBodyStyle.Wrapped` — ответ придёт как `{<Метод>Result: …}`. Метод с `Method = "GET"` и `BodyStyle = WebMessageBodyStyle.Bare` открывается из адресной строки (`<адрес CRM>/0/rest/<Сервис>/<Метод>`, на части стендов без `/0`; ✅ 08.10.2026), но через `ServiceHelper` даёт 400 Bad Request. Исключение внутри метода тоже возвращается страницей «Request Error» — причину смотри в `Error.log`.
- ✅ Адрес своего REST-сервиса (13.10.2026, видно во вкладке сети встроенного браузера): на стенде .NET Core — `<адрес CRM>/rest/<Сервис>/<Метод>`, без `/0/`; на .NET Framework — 🧪 `<адрес CRM>/0/rest/<Сервис>/<Метод>`. Префикс смотри по адресу открытой CRM у пользователя (есть ли `/0/` в адресной строке).

### Ресурсы
`resource.ru-RU.xml` (и так же `resource.en-US.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<Resources Culture="ru-RU">
	<Group Type="String">
		<Items>
			<Item Name="Caption" Value="Test S1: помощник" />
			<Item Name="LocalizableStrings.TestGreetingTemplate.Value" Value="Привет, {0}! Исходный код Test S1 ответил в {1}." />
		</Items>
	</Group>
</Resources>
```
Строка — `LocalizableStrings.<Ключ из B2>.Value`. Дизайнер показывает её в разделе «Локализуемые строки».

### Опровергнуто
- `properties.json` без обёртки `"Properties"` — неверно, у всех схем проекта есть обёртка.
- «`HD1` — фиксированная константа» — неверно: это UId родителя; `50e3acc0-...` почти у всех схем, у единичных — свои значения или поля нет.
- Пример `.cs` с `namespace BPMSoft.Configuration.<Пакет>` и `using BPMSoft.Web` — не из реального файла; у образцов `BaseService` из `BPMSoft.Web.Common`.

## Где писать серверную логику объекта
- Новую серверную логику объекта (проверки и запреты при сохранении и удалении, заполнение колонок, создание связанных записей, журналы изменений) пиши в слушателе событий объекта — разделы ниже. Это решение по умолчанию: слушатель проще читать, ревьюить и отлаживать.
- Процесс событий объекта (вкладка «События», `EG1` в `metadata.json` объекта, `entity-edit.md`) умей читать: в проекте там может быть существующая логика, учитывай её, чтобы не задвоить поведение. Новую логику туда не добавляй, даже если пользователь пишет «при сохранении» или «события объекта». Делай процесс событий, только если пользователь прямо просит именно его.
- Тексты для пользователя (сообщения об ошибках, значения по умолчанию вроде «Без темы», названия создаваемых записей) — только локализуемые строки схемы на ru-RU и en-US (рецепт ниже: `LocalizableString`). Константы в коде допустимы лишь для технических имён: колонки, коды системных настроек, имена схем.

## ✅ Слушатель событий объекта (`EntityEventListener`)
**Подтверждено 05.10.2026** на `TestSrcEntityEventListener` (объект `TestSrcEntity`): запись, созданная из кода, сохранилась с заметкой, которую заполнил слушатель перед сохранением; строка слушателя попала в `Common.log`.
```csharp
namespace BPMSoft.Configuration
{
	using BPMSoft.Core.Entities;
	using BPMSoft.Core.Entities.Events;
	using global::Common.Logging;

	[EntityEventListener(SchemaName = "TestSrcEntity")]
	public class TestSrcEntityEventListener : BaseEntityEventListener
	{
		private static readonly ILog _log = LogManager.GetLogger("Common");

		public override void OnSaving(object sender, EntityBeforeEventArgs e)
		{
			base.OnSaving(sender, e);
			var entity = (Entity)sender;
			var name = entity.GetTypedColumnValue<string>("Name");
			entity.SetColumnValue("Note", "Слушатель S2: " + name);
			_log.Info("TestSrcEntityEventListener.OnSaving: " + name);
		}
	}
}
```
- Файлы схемы — как у любой схемы исходного кода (выше), `B2: []`, если строк нет.
- `BaseEntityEventListener` и атрибут `EntityEventListener` — пространство имён `BPMSoft.Core.Entities.Events`. Переопределяемые методы: `OnSaving`, `OnSaved`, `OnInserting`, `OnInserted`, `OnUpdating`, `OnUpdated`, `OnDeleting`, `OnDeleted` (до события — `EntityBeforeEventArgs`, после — `EntityAfterEventArgs`); всегда вызывай `base.<Метод>(sender, e)`.
- ✅ **Порядок событий** (подтверждено пользователем, 11.10.2026; одинаков для слушателя и процесса событий объекта): изменение — `OnSaving` → `OnUpdating` → `OnUpdated` → `OnSaved`; добавление — `OnSaving` → `OnInserting` → `OnInserted` → `OnSaved`.
- ✅ **Где запрещать.** Запрет — исключение в событии «до»: в `OnSaving`, если проверка нужна при любом сохранении (и добавлении, и изменении); в `OnUpdating` — только при изменении; в `OnInserting` — только при добавлении. Исключение отменяет сохранение. Журнал изменений пиши в событиях «после» (`OnUpdated`, `OnInserted`, `OnSaved`), чтобы при отменённом сохранении он не появлялся.
- Не ветвись по `StoringState` внутри `OnSaving`, если правило касается одного случая: проверку только при изменении пиши в `OnUpdating`, значение по умолчанию только для новой записи — в `OnInserting`. `OnSaving` оставь для правил «при любом сохранении».
- Изменение колонки в `OnSaving`/`OnInserting` попадает в ту же запись без отдельного `Save()`.
- В `OnSaved`/`OnInserted`/`OnUpdated` запись уже записана: `SetColumnValue` в БД не попадёт (по опыту пользователя; для скрипта события объекта ✅ проверено 05.10.2026). Дообновить — запросом `Update` по `Id` или заново получить запись и вызвать `Save()` (повторно запустит события — не допускай рекурсии).
- Слушатель срабатывает на сохранение через приложение (`Entity.Save()`, карточка, процесс), не на прямой SQL.
- В проекте может быть свой базовый слушатель с типизированным `Entity` — поищи наследников `BaseEntityEventListener` в `Pkg`; стандартный `BaseEntityEventListener` работает без зависимостей от проектного кода.

✅ **Запрет изменения и удаления, значение по умолчанию** (06.10.2026, `TestTicketCommentEventListener`, объект `TestTicketComment`):
- `OnUpdating` / `OnDeleting(object sender, EntityBeforeEventArgs e)` — исключение отменяет операцию, пользователь видит его текст: `throw new InvalidOperationException(message);`. Сначала `base.OnUpdating(sender, e)`.
- `OnInserting` — заполнение колонки, если пусто: `entity.SetColumnValue("AuthorId", entity.UserConnection.CurrentUser.ContactId)`.
- Текст ошибки — локализуемая строка самой схемы исходного кода (ресурсы `Resources/<Схема>.SourceCode/resource.<культура>.xml`): `new LocalizableString(userConnection.Workspace.ResourceStorage, "<Схема>", "LocalizableStrings.<Имя>.Value").ToString()`.
- Значение из БД до изменения читается запросом: `new Select(userConnection).Column("AuthorId").From("<Объект>").Where("Id").IsEqual(Column.Parameter(entity.PrimaryColumnValue)) as Select`, затем `ExecuteScalar<Guid>()` (`using BPMSoft.Core.DB;`).

✅ **Создать связанную запись после вставки** (07.10.2026, `TestTicketEventListener`: у новой заявки с приоритетом «Высокий» появляется задача ответственному, видна в детали «Активности» карточки заявки):
- В `OnInserted(object sender, EntityAfterEventArgs e)` (после `base.OnInserted`): `var schema = userConnection.EntitySchemaManager.GetInstanceByName("Activity"); var activity = schema.CreateEntity(userConnection); activity.SetDefColumnValues();`, затем `SetColumnValue("Title", …)`, `("OwnerId", …)`, `("StartDate", …)`, `("DueDate", …)`, `("<Колонка связи>Id", entity.PrimaryColumnValue)` и `activity.Save(false)`.
- Только для новой записи — именно `OnInserted`, а не `OnSaved`; в `OnSaving` проверка «новая ли запись» — `entity.StoringState == StoringObjectState.New`.
- 🧪 Время: код ставил `StartDate` из `userConnection.CurrentUser.GetCurrentDateTime()`; у пользователя с часовым поясом UTC значения совпали с `CreatedOn`. Нужен ли `DateTime.UtcNow` при другом поясе профиля — не проверено.
- ✅ Изменилась ли колонка в `OnSaving` (подтверждено в CRM, 08.10.2026): `entity.GetTypedOldColumnValue<DateTime>("<Колонка>")` против `entity.GetTypedColumnValue<DateTime>("<Колонка>")`; «сейчас» пользователя — `UserConnection.CurrentUser.GetCurrentDateTime()` (так же в `RemindingSchema.Base.cs`); отмена сохранения — `throw new InvalidOperationException(<текст>)`. При поясе профиля, отличном от UTC, сравнение не проверялось. ✅ (11.10.2026) Если правило зависит от флага, а флаг и колонку меняют в одном сохранении (сняли флаг и сдвинули срок), проверяй и старое, и новое значение флага: `GetTypedOldColumnValue<bool>` возвращает значение до сохранения.
- ✅ Запись истории через `Entity` (подтверждено в CRM, 08.10.2026): `CreateEntity` → `SetDefColumnValues()` → `SetColumnValue(...)` → `Save(false)` — значения по умолчанию колонок («Текущие дата и время», «Текущий контакт») подставляются сами.
- ✅ **Справочные значения задачи** (подтверждено в CRM, 12.10.2026; UId базовых записей платформы на проверенном стенде — перед использованием сверь запросом к БД): в `ActivityCategory` две записи «Звонок» — для типа активности «Задача» (`03df85bf-6b19-4dea-8463-d5d49b80bb28`, `ActivityTypeId` = «Задача» `fbe0acdc-cfc0-df11-b00f-001d60e938c6`) и для типа «Звонок» (`e52bd583-7825-e011-8165-00155d043204`); задаче ставь категорию её типа. Приоритет «Высокий» (`ActivityPriority`) — `d625a9fc-7ee6-df11-971b-001d60e938c6`. Срок через час: `DueDate` = начало `.AddHours(1)` от `CurrentUser.GetCurrentDateTime()` — записалось ровно на час позже начала.

## ✅ Изменить схему исходного кода
**Подтверждено 05.10.2026** на `TestSrcService`: в класс добавлен второй метод сервиса (`CreateRecord`), обновлён `ModifiedOnUtc` в `descriptor.json`; после «Обновить из файловой системы» и компиляции новый метод сразу вызывается с клиента. `metadata.json` при правке кода не меняется (если не добавляются локализуемые строки).

## ✅ Константы серверной логики (статический класс)

**Подтверждено компиляцией и работой в CRM (14.10.2026).** Серверный код (слушатели, помощники, сервисы) не хранит идентификаторы записей у себя — они лежат в отдельной SourceCode-схеме пакета со статическим классом. Внутри — по вложенному статическому классу на справочник: одна таблица — один класс.

```csharp
namespace BPMSoft.Configuration
{
	using System;

	/// <summary>
	/// Идентификаторы записей справочников. Один вложенный класс — одна таблица.
	/// </summary>
	public static class TestConstants
	{
		/// <summary>
		/// Справочник «<Справочник>».
		/// </summary>
		public static class TestSource
		{
			/// <summary>
			/// <Запись>.
			/// </summary>
			public static readonly Guid First = new Guid("<UId записи>");
		}
	}
}
```
Использование: `entity.SetColumnValue("<Колонка>Id", TestConstants.TestSource.First);`.

- ✅ Имя класса не обязано совпадать с именем схемы (14.10.2026): схема `<Имя>ServerConstants` с классом `TestConstants` скомпилировалась и работает. Это удобно, когда клиентский модуль констант уже занял короткое имя: имена схем в пакете должны быть разными, а класс и JS-модуль живут в разных пространствах имён.
- Клиентские и серверные константы не связаны: один и тот же идентификатор при необходимости записывается в обоих файлах, это единственное место, где он встречается в коде.

## ✅ Вызвать исходный код из процесса
**Подтверждено 05.10.2026** на процессе `TestProcSrcCall`: задание-сценарий создало `TestSrcHelper` и вызвало его метод, затем сохранило запись `TestSrcEntity` — в `Common.log` строки помощника и слушателя событий подряд.
- Код процессов компилируется в пространство имён `BPMSoft.Core.Process`; `BPMSoft.Configuration` в стандартные `using` процесса не входит. Добавь его в `B3` процесса (формат — `process-edit.md`, «Методы процесса (`BK32`), `using` (`B3`)»):
```json
"B3": [{"UId": "<новый GUID>", "A2": "BPMSoft.Configuration", "A3": "<UId процесса>", "A4": "<UId процесса>", "A5": "<A5 процесса>", "GF1": "null"}]
```
- Код задания-сценария (`CH1`):
```csharp
var greeting = new TestSrcHelper(UserConnection).Greet("процесс S3");
var entity = UserConnection.EntitySchemaManager.GetInstanceByName("TestSrcEntity").CreateEntity(UserConnection);
entity.SetDefColumnValues();
entity.SetColumnValue("Name", "S3: " + greeting);
entity.Save();
return true;
```
- Процесс собирай по рецепту «Создать процесс с нуля» (`process-edit.md`); после обновления — компиляция.

## ✅ Слушатель событий приложения (`AppEventListenerBase`) и регистрация в `ClassFactory`
**Подтверждено 05.10.2026** на `TestSrcAppListener`: после «Обновить из файловой системы» и компиляции приложение перезапустилось само, `OnAppStart` записал строку в `Common.log` и зарегистрировал `ITestGreeter`; после повторного входа пользователя сработал `OnSessionStart`; сервис получил реализацию через `ClassFactory.Get<ITestGreeter>()` и вернул её ответ.
```csharp
namespace BPMSoft.Configuration
{
	using System;
	using BPMSoft.Core.Factories;
	using BPMSoft.Web.Common;
	using global::Common.Logging;

	public interface ITestGreeter
	{
		string Hello(string name);
	}

	public class TestGreeter : ITestGreeter
	{
		public string Hello(string name)
		{
			return "ClassFactory S4: привет, " + name + "!";
		}
	}

	public class TestSrcAppListener : AppEventListenerBase
	{
		private static readonly ILog _log = LogManager.GetLogger("Common");

		public override void OnAppStart(AppEventContext context)
		{
			base.OnAppStart(context);
			try
			{
				ClassFactory.Bind<ITestGreeter, TestGreeter>();
				_log.Info("TestSrcAppListener.OnAppStart: ITestGreeter зарегистрирован");
			}
			catch (Exception ex)
			{
				_log.Error("TestSrcAppListener.OnAppStart: ошибка регистрации", ex);
			}
		}

		public override void OnSessionStart(AppEventContext context)
		{
			base.OnSessionStart(context);
			_log.Info("TestSrcAppListener.OnSessionStart");
		}
	}
}
```
- `AppEventListenerBase` — `BPMSoft.Web.Common`; методы `OnAppStart`, `OnAppEnd`, `OnSessionStart`, `OnSessionEnd`. Регистрировать слушатель не нужно: платформа (`AppEventLoader`) сама находит в сборке конфигурации все классы, реализующие `IAppEventListener`.
- `ClassFactory` — `BPMSoft.Core.Factories`: `Bind<IИнтерфейс, Реализация>()` при старте, `ClassFactory.Get<IИнтерфейс>()` в коде. Подмена существующей привязки — `ClassFactory.ReBind<...>()`.
- Системное подключение в `OnAppStart`: `((AppConnection)context.Application["AppConnection"]).SystemUserConnection` (образец — любой наследник `AppEventListenerBase` в `Pkg`).
- `OnAppStart` выполняется только при запуске приложения; компиляция его перезапускает сама (в логе `BPMSoft.WebHost.Application OnStart - Application started`).
- Несколько типов (интерфейс, реализация, слушатель) в одном `.cs` схемы — допустимо.
- Время в логах стенда — UTC.

## ✅ Подменить платформенный класс своим наследником (`ClassFactory.ReBind`)
**Подтверждено 05.10.2026** на `TestOrderAmountHelper`: после компиляции `OnAppStart` выполнил `ReBind`, и `ClassFactory.Get<OrderAmountHelper>(...)` стал выдавать `BPMSoft.Configuration.TestOrderAmountHelper` (строки в `Common.log`: подмена при старте и создание наследника).
1. Найди класс, который платформа получает через `ClassFactory.Get<Класс>(...)` (поиск `ClassFactory.Get<` в `[app]/BPMSoft.Configuration/Autogenerated/Src`), и проверь по всему `Pkg`, что его ещё никто не подменяет (`ReBind<Класс,`) — иначе подмены конфликтуют.
2. Наследник — отдельная схема исходного кода; конструктор с теми же параметрами, что у базового (имена параметров важны: `ClassFactory.Get` передаёт их через `new ConstructorArgument("<имя>", значение)`):
```csharp
namespace BPMSoft.Configuration
{
	using System;
	using BPMSoft.Configuration.Passport;
	using BPMSoft.Core;
	using global::Common.Logging;

	public class TestOrderAmountHelper : OrderAmountHelper
	{
		private static readonly ILog _log = LogManager.GetLogger("Common");

		public TestOrderAmountHelper(UserConnection userConnection) : base(userConnection)
		{
			_log.Info("TestOrderAmountHelper: создан вместо OrderAmountHelper");
		}

		public override void UpdateAmountsByOrderId(Guid orderId)
		{
			_log.Info("TestOrderAmountHelper.UpdateAmountsByOrderId: " + orderId);
			base.UpdateAmountsByOrderId(orderId);
		}
	}
}
```
3. Регистрация — в `OnAppStart` слушателя событий приложения (раздел выше): `ClassFactory.ReBind<OrderAmountHelper, TestOrderAmountHelper>();`. Для именованных привязок — `ReBind<T, TImpl>(name)`.
4. Переопределяй только `virtual`-методы и вызывай `base.<Метод>(...)`, если не заменяешь логику намеренно. Пространство имён базового класса бери из его файла в `Autogenerated/Src` (у `OrderAmountHelper` — `BPMSoft.Configuration.Passport`).
5. `ConstructorArgument` — `BPMSoft.Core.Factories`. Проверка подмены: `ClassFactory.Get<Класс>(new ConstructorArgument("userConnection", UserConnection)).GetType().FullName`.

- ✅ `Bind` своего интерфейса и сразу `ReBind` того же интерфейса на наследника в одном `OnAppStart` отдают наследника (подтверждено строкой в `Common.log`, 09.10.2026).

## ✅ Прочитать системную настройку
**Подтверждено 05.10.2026** (`TestSrcService.ReadSetting`): `BPMSoft.Core.Configuration.SysSettings.GetValue<string>(UserConnection, "TestSrcSetting", "<нет значения>")` вернул значение настройки, созданной данными пакета (`data-edit.md`, «Системная настройка и её значение»). Третий аргумент — значение по умолчанию, если настройки нет. Псевдоним `using SysSettings = BPMSoft.Core.Configuration.SysSettings;` можно объявлять только в своём вложенном пространстве имён (так в реальном образце проекта: `namespace BPMSoft.Configuration.<Пакет>`). ✅ Внутри `namespace BPMSoft.Configuration { ... }` он не компилируется: там есть сгенерированный класс объекта `SysSettings` — ошибка CS0576 «Namespace 'BPMSoft.Configuration' contains a definition conflicting with alias 'SysSettings'» (06.10.2026, `TestDiscountService`). В `BPMSoft.Configuration` пиши полное имя: `global::BPMSoft.Core.Configuration.SysSettings.GetValue<decimal>(UserConnection, "<Код>", 0m)` — проверено, вернуло значение дробной настройки.

## ✅ Сообщение в браузер пользователю и уведомление в «колокольчике»
**Подтверждено 07.10.2026** на `TestTicketEscalationNotifier` (вызов из задания-сценария процесса эскалации заявки) и замещении `MainHeaderSchema`: ответственному в сети приходит окно с кнопкой «Открыть заявку», ответственному не в сети — уведомление в «колокольчике» со ссылкой на заявку.
- **Сервер** (`using BPMSoft.Messaging.Common;`, `using Newtonsoft.Json;`): адресат — Id пользователя `SysAdminUnit`; пользователи контакта — `EntitySchemaQuery` по `SysAdminUnit` с фильтрами `Contact` = Id контакта и `Active` = true. Отправка: `var channel = MsgChannelManager.Instance.FindItemByUId(userId);` (`null` — канала нет), затем `channel.PostMessage(new SimpleMessage { Id = userId, Body = JsonConvert.SerializeObject(new { ... }), Header = { Sender = "<УникальныйОтправитель>", BodyTypeName = "Info" } });`.
- «Открыта ли CRM у пользователя» одним методом платформа не даёт; в проекте может быть своя проверка — поищи в `Pkg` по `MsgChannelManager` или `CheckIfHasOpenPage`. ✅ Одной проверки `FindItemByUId(userId) == null` хватает (подтверждено в CRM, 09.10.2026): есть канал — показывается окно, нет — создаётся запись `Reminding`.
- **Клиент**: подписка в схеме, которая живёт всю сессию (здесь — замещение `MainHeaderSchema`): в `init` после `this.callParent(arguments)` — `this.BPMSoft.ServerChannel.on(this.BPMSoft.EventName.ON_MESSAGE, this.<обработчик>, this);`, в `destroy` — `this.BPMSoft.ServerChannel.un(...)` с теми же аргументами. Обработчик `function(scope, message)`: свои сообщения отбирай по `message.Header.Sender`, данные — `Ext.decode(message.Body, true)`.
- **Окно с кнопками**: `this.showConfirmationDialog(text, function(returnCode) { ... }, [{ className: "BPMSoft.Button", returnCode: "<код>", style: BPMSoft.controls.ButtonEnums.style.ORANGE, caption: <строка> }, { ..., style: BPMSoft.controls.ButtonEnums.style.DEFAULT, ... }])`. Открыть карточку записи — `NetworkUtilities.openEntityPage({ sandbox: this.sandbox, entitySchemaName: "<Объект>", entityId: <Id> })`, модуль `"NetworkUtilities"` — в зависимостях `define` и в аргументах функции.
- **Уведомление в «колокольчике»** — запись `Reminding` через `Entity`: `SetDefColumnValues()`, `AuthorId`, `ContactId` (получатель), `RemindTime` = `DateTime.UtcNow`, `NotificationTypeId` = `685e7149-c015-4a4d-b4a6-2e5625a6314c` («Уведомление»), `PopupTitle`, `SubjectCaption`, `SysEntitySchemaId` = `EntitySchemaManager.GetInstanceByName("<Объект>").UId`, `SubjectId` = Id записи (по клику открывается запись), затем `Save()`.
- `MsgChannelManager`, `SimpleMessage` и `ServerChannel` нет ни в XML-документации, ни в `Autogenerated` как описания API — образцы ищи в `Pkg`: отправка — по `MsgChannelManager.Instance`, уведомление — по `GetInstanceByName("Reminding")`.

## ✅ Удалить SourceCode-схему целиком

Процедура та же, что и для любого типа схемы (см. `entity-edit.md`, раздел «Удалить объект»):

1. Удалить рекурсивно две папки:
   - `Pkg/<Пакет>/Schemas/<ИмяСхемы>/` (сама схема)
   - `Pkg/<Пакет>/Resources/<ИмяСхемы>.SourceCode/` (ресурсы)

2. Открыть BPMSoft-CRM и нажать "Обновить из файловой системы"

3. Схема пропадает из runtime

**ПЕРЕД удалением проверить зависимости** — убедиться, что никакие другие схемы/код не ссылаются на удаляемую SourceCode-схему через `using`-директиву с пространством имён этого кода или на её UId.
