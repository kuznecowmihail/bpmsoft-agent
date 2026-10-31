# Исходный код (SourceCodeSchemaManager) — рецепты создания/редактирования

Общая механика ресурсов и локализации — см. `metadata-editing.md`. SourceCode использует плоский JSON (`metadata.json`), а не построчный diff-журнал (как Entity и большинство Process), поэтому правила diff-журнала и «последняя запись побеждает» здесь не применяются. Действуют общие правила про ресурсы, локализацию и `ModifiedOnUtc`.

Факты и модель metadata — `source-code.md`. Серверная логика объекта и слушатель `EntityEventListener` — `server-events-edit.md`. Задания по расписанию и фоновые задачи — `server-background-edit.md`. Темы файла: создание и изменение схемы, константы, вызов из процесса, слушатель событий приложения, подмена класса через `ClassFactory`, системная настройка, сообщение в браузер и уведомление в «колокольчике», удаление.

`ModifiedOnUtc` в `descriptor.json` ставь на текущий момент при создании и изменении схемы, формат `"\/Date(<миллисекунды>)\/"`, значение — `date +%s000` (`metadata-editing.md`).

## ✅ Создать схему исходного кода с нуля
✅ Подтверждено записью в CRM.

Новый сервис (новый класс или маршрут) до перезапуска приложения отвечает 404: `integration-api.md`, «Свой REST-сервис: адреса и ошибки». Новый метод в существующем сервисе вызывается сразу, см. «Изменить схему исходного кода».

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
    "CreatedInVersion": "<версия платформы>"
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
      "A5": "<Id пакета>",
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
      "B8": "<версия платформы>",
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
- ✅ `ServiceHelper.callService` всегда шлёт `POST` с телом `{}` (подтверждено в CRM): метод, который так вызывают, объявляй с `Method = "POST"` и `BodyStyle = WebMessageBodyStyle.Wrapped` — ответ придёт как `{<Метод>Result: …}`. Адреса, GET и ошибки — `integration-api.md`, «Свой REST-сервис: адреса и ошибки».

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
- ❌ `properties.json` без обёртки `"Properties"` — неверно: у схем обёртка есть.
- ❌ `HD1` как фиксированная константа — неверно: это UId родителя; `50e3acc0-...` почти у всех схем, у единичных — свои значения или поля нет.
- ❌ `using BPMSoft.Web` и пример `.cs`, придуманный целиком, — ошибка, он не из реального файла. Вложенное пространство `namespace BPMSoft.Configuration.<Пространство>` само по себе норма; у образцов `BaseService` из `BPMSoft.Web.Common`.

## ✅ Изменить схему исходного кода
✅ Подтверждено записью в CRM. Новый метод существующего сервиса вызывается с клиента сразу после «Обновить из файловой системы» и компиляции. `metadata.json` при правке кода не меняется (если не добавляются локализуемые строки).

## ✅ Константы серверной логики (статический класс)

**Подтверждено компиляцией и работой в CRM.** Серверный код (слушатели, помощники, сервисы) не хранит идентификаторы записей у себя — они лежат в отдельной SourceCode-схеме пакета со статическим классом. Внутри — по вложенному статическому классу на справочник: одна таблица — один класс.

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

- ✅ Имя класса не обязано совпадать с именем схемы: схема `<Имя>ServerConstants` с классом `TestConstants` скомпилировалась и работает. Это удобно, когда клиентский модуль констант уже занял короткое имя: имена схем в пакете должны быть разными, а класс и JS-модуль живут в разных пространствах имён.
- Клиентские и серверные константы не связаны: один и тот же идентификатор при необходимости записывается в обоих файлах, это единственное место, где он встречается в коде.

## ✅ Вызвать исходный код из процесса
✅ Подтверждено записью в CRM.
- Код процессов компилируется в пространство имён `BPMSoft.Core.Process`; `BPMSoft.Configuration` в стандартные `using` процесса не входит. Добавь его в `B3` процесса (формат — `process-flow-edit.md`, «Методы процесса (`BK32`), `using` (`B3`)»):
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
✅ Подтверждено записью в CRM.
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
- ✅ Не делай общий абстрактный базовый класс от `AppEventListenerBase` (подтверждено на реальных схемах проекта): платформа при каждом старте создаёт экземпляр каждого наследника `AppEventListenerBase` и на абстрактном пишет в `Error.log` `AppEventDispatcher OnAppEvent - Error creating an instance of the <Класс> type | System.MissingMethodException: Constructor on type … not found` (сотни строк в журналах). Общий код выноси в хелпер или в не наследующий `AppEventListenerBase` класс.
- `ClassFactory` — `BPMSoft.Core.Factories`: `Bind<IИнтерфейс, Реализация>()` при старте, `ClassFactory.Get<IИнтерфейс>()` в коде. Подмена существующей привязки — `ClassFactory.ReBind<...>()`.
- Системное подключение в `OnAppStart`: `((AppConnection)context.Application["AppConnection"]).SystemUserConnection`; права системного пользователя — `rights.md`, «Права в серверном коде».
- `OnAppStart` выполняется только при запуске приложения; компиляция его перезапускает сама (в логе `BPMSoft.WebHost.Application OnStart - Application started`).
- Задание по расписанию ставь из `OnAppStart`: `server-background-edit.md`, «Задание по расписанию на C#».
- Несколько типов (интерфейс, реализация, слушатель) в одном `.cs` схемы — допустимо.
- Время в логах стенда — UTC.

## ✅ Регистрация реализации без `OnAppStart`: `[DefaultBinding]`

**Подтверждено записью в CRM.** Атрибут на классе-реализации регистрирует его в `ClassFactory` при запуске приложения — слушатель приложения с `ClassFactory.Bind` не нужен:
```csharp
// using BPMSoft.Core.Factories;
public interface I<Сервис>
{
	string <Метод>();
}

[DefaultBinding(typeof(I<Сервис>))]
public class <Сервис> : I<Сервис>
{
	public string <Метод>() { … }
}
// вызов: ClassFactory.Get<I<Сервис>>().<Метод>();
```
Несколько реализаций одного интерфейса различают по имени: `[DefaultBinding(typeof(I<Сервис>), Name = "<Имя>")]` и `ClassFactory.Get<I<Сервис>>("<Имя>")` (в коде платформы так делают). ✅ Проверено: две реализации с `Name = "A"` и `Name = "B"` возвращаются по имени; `ClassFactory.Get<I<Сервис>>()` без имени, когда все привязки именованные, — `InstanceActivationException`.

## ✅ Подменить платформенный класс своим наследником (`ClassFactory.ReBind`)
✅ Подтверждено записью в CRM. После компиляции `OnAppStart` выполняет `ReBind`, и `ClassFactory.Get<OrderAmountHelper>(...)` возвращает наследника `BPMSoft.Configuration.TestOrderAmountHelper`.
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

- ✅ `Bind` своего интерфейса и сразу `ReBind` того же интерфейса на наследника в одном `OnAppStart` отдают наследника (подтверждено строкой в `Common.log`).

## ✅ Прочитать системную настройку
✅ Подтверждено записью в CRM: `BPMSoft.Core.Configuration.SysSettings.GetValue<string>(UserConnection, "<Код>", "<нет значения>")` возвращает значение настройки, созданной данными пакета (`data-edit.md`, «Системная настройка и её значение»). Третий аргумент — значение по умолчанию, если настройки нет. В `namespace BPMSoft.Configuration` пиши полное имя: `global::BPMSoft.Core.Configuration.SysSettings.GetValue<decimal>(UserConnection, "<Код>", 0m)` — проверено, вернуло значение дробной настройки. Псевдоним `using SysSettings = …` там даёт CS0576, см. `platform-api.md`, «Системные настройки, функциональности, соединения».

## ✅ Сообщение в браузер пользователю и уведомление в «колокольчике»
✅ Подтверждено записью в CRM. Ответственному в сети приходит окно с кнопкой «Открыть заявку», ответственному не в сети — уведомление в «колокольчике» со ссылкой на заявку.
- **Сервер** (`using BPMSoft.Messaging.Common;`, `using Newtonsoft.Json;`): адресат — Id пользователя `SysAdminUnit`; пользователи контакта — `EntitySchemaQuery` по `SysAdminUnit` с фильтрами `Contact` = Id контакта и `Active` = true. Отправка: `var channel = MsgChannelManager.Instance.FindItemByUId(userId);` (`null` — канала нет), затем `channel.PostMessage(new SimpleMessage { Id = userId, Body = JsonConvert.SerializeObject(new { ... }), Header = { Sender = "<УникальныйОтправитель>", BodyTypeName = "Info" } });`.
- «Открыта ли CRM у пользователя» одним методом платформа не даёт; в проекте может быть своя проверка — поищи в `Pkg` по `MsgChannelManager` или `CheckIfHasOpenPage`. ✅ Одной проверки `FindItemByUId(userId) == null` хватает (подтверждено в CRM): есть канал — показывается окно, нет — создаётся запись `Reminding`.
- **Клиент**: подписка в схеме, которая живёт всю сессию (здесь — замещение `MainHeaderSchema`): в `init` после `this.callParent(arguments)` — `this.BPMSoft.ServerChannel.on(this.BPMSoft.EventName.ON_MESSAGE, this.<обработчик>, this);`, в `destroy` — `this.BPMSoft.ServerChannel.un(...)` с теми же аргументами. Обработчик `function(scope, message)`: свои сообщения отбирай по `message.Header.Sender`, данные — `Ext.decode(message.Body, true)`.
- **Окно с кнопками**: `this.showConfirmationDialog(text, function(returnCode) { ... }, [{ className: "BPMSoft.Button", returnCode: "<код>", style: BPMSoft.controls.ButtonEnums.style.ORANGE, caption: <строка> }, { ..., style: BPMSoft.controls.ButtonEnums.style.DEFAULT, ... }])`. Открыть карточку записи — `NetworkUtilities.openEntityPage({ sandbox: this.sandbox, entitySchemaName: "<Объект>", entityId: <Id> })`, модуль `"NetworkUtilities"` — в зависимостях `define` и в аргументах функции.
- **Уведомление в «колокольчике»** — запись `Reminding` через `Entity`: `SetDefColumnValues()`, `AuthorId`, `ContactId` (получатель), `RemindTime` = `DateTime.UtcNow`, `NotificationTypeId` = `685e7149-c015-4a4d-b4a6-2e5625a6314c` («Уведомление»), `PopupTitle`, `SubjectCaption`, `SysEntitySchemaId` = `EntitySchemaManager.GetInstanceByName("<Объект>").UId`, `SubjectId` = Id записи (по клику открывается запись), затем `Save()`.
- `MsgChannelManager`, `SimpleMessage` и `ServerChannel` нет ни в XML-документации, ни в `Autogenerated` как описания API — образцы ищи в `Pkg`: отправка — по `MsgChannelManager.Instance`, уведомление — по `GetInstanceByName("Reminding")`.

## ✅ Удалить SourceCode-схему

Общий порядок — `metadata-editing.md`, «Удаление схемы». Специфика SourceCode:

1. Перед удалением проверить зависимости: никакой код не ссылается на схему через `using` с её пространством имён и не ссылается на её UId (поиск по `Pkg`).
2. Удалить рекурсивно две папки: `Pkg/<Пакет>/Schemas/<ИмяСхемы>/` и `Pkg/<Пакет>/Resources/<ИмяСхемы>.SourceCode/`.
3. Если в схеме есть задание по расписанию, сначала сними его: `server-background-edit.md`, «Удаление класса задания».
