# Интеграции: вход извне, CSRF, OData, DataService, свои REST-сервисы

Входящие вызовы CRM из внешних систем и исходящие HTTP-вызовы из своего кода. Исходящий REST-сервис (ServiceSchemaManager) и элемент «Вызвать веб-сервис» — `web-service.md`, `web-service-edit.md`; свой REST-сервис в исходном коде (`BaseService`) — `source-code-edit.md`.

✅ — подтверждено вызовами на стенде .NET 8 (21.10.2026). На .NET Framework адреса начинаются с `/0/` (по документации, 🧪).

## Вход и CSRF
- ✅ `POST <CRM>/ServiceModel/AuthService.svc/Login`, тело `{"UserName": "<логин>", "UserPassword": "<пароль>"}`, `Content-Type: application/json`. Успех — `"Code": 0`. Неверный пароль — тоже HTTP 200, но `"Code": 1` и текст в `Message`: проверяй `Code`, а не код HTTP.
- ✅ Ответ ставит cookie `BPMSESSIONID`, `.ASPXAUTH`, `CsrfToken`, `BPMCSRF` — передавай все в следующих запросах.
- ✅ Для POST, PATCH, DELETE (OData, DataService, `/rest/`) нужен заголовок `BPMCSRF: <значение cookie BPMCSRF>`, без него — HTTP 403.
- ✅ Без входа: OData — 403 «Current user does not have sufficient permissions to use OData.»; `/rest/<Класс>/<Метод>` — 302 (перенаправление на вход).
- Учётные данные не пиши в код и схемы; для внешней системы — отдельный пользователь с минимальными правами.

## OData 4
- ✅ Адрес — `<CRM>/odata/<Объект>`; `/0/odata` на .NET 8 — 404.
- ✅ Чтение: `GET /odata/<Объект>?$select=<Колонка1>,<Колонка2>&$filter=<Колонка> eq '<значение>'&$top=N`; связанный объект — `$expand=<Справочная колонка>($select=<Колонка>)`. Ответ — `{"@odata.context": …, "value": [ … ]}`.
- ✅ Создать: `POST /odata/<Объект>` с JSON колонок (справочная — `<Колонка>Id`) → 201 и созданная запись с `Id`. Изменить: `PATCH /odata/<Объект>(<Id>)` → 204. Удалить: `DELETE /odata/<Объект>(<Id>)` → 204.
- ✅ Запись через OData идёт через сущность: события объекта и слушатели срабатывают.
- ✅ Файлы записи (содержимое через `/Data`) — `files.md`, «Файл через OData».
- ✅ Количество (24.10.2026): `GET /odata/<Объект>/$count?$filter=<условие>` — число текстом (`text/plain`, в начале BOM); `$count=true` в обычном запросе добавляет `"@odata.count"`. `$orderby`, `$skip`, `$top` — обычная постраничность (`$top` — размер страницы, в отличие от `RowCount` в ESQ).
- ✅ `GET /odata/$metadata` — описание всех объектов (XML).
- ✅ Пакет запросов (24.10.2026): `POST /odata/$batch`, `Content-Type: application/json`, тело `{"requests": [{"id": "1", "method": "POST", "url": "<Объект>", "headers": {"Content-Type": "application/json;odata.metadata=minimal"}, "body": {<колонки>}}, {"id": "2", "method": "GET", "url": "<Объект>?$filter=<условие>"}]}` → `{"responses": [{"id", "status", "headers", "body"}]}`. ✅ `atomicityGroup` записи не откатывает (24.10.2026): в группе из двух `POST` второй упал (неизвестная колонка), первый остался в БД, а в ответе — только ошибка второго (`status: 500`, без тела).
- ✅ `DELETE /odata/Activity(<Id>)` не удаляет участников активности: строки `ActivityParticipant` остались и не дали удалить контакт-участника (`violates foreign key constraint … on table "ActivityParticipant"`, HTTP 500). Удаляй их отдельно (`DELETE /odata/ActivityParticipant(<Id>)`).

## DataService
- ✅ `POST /DataService/json/SyncReply/SelectQuery`, `InsertQuery`, `UpdateQuery`, `DeleteQuery`, `BatchQuery` (22.10.2026; на .NET 8 работают и с префиксом `/0/`). Тела: вставка — `{"rootSchemaName": "<Объект>", "operationType": 1, "columnValues": {"items": {"<Колонка>": {"expressionType": 2, "parameter": {"dataValueType": <тип>, "value": <значение>}}}}}` → `{"id": "<Id>", "success": true}`; изменение — `"operationType": 2`, `columnValues` и `filters` (как у `SelectQuery`); удаление — `"operationType": 3` и `filters`; пакет — `{"items": [{"__type": "BPMSoft.Nui.ServiceModel.DataContract.InsertQuery", …тело запроса…}, …]}` → `{"queryResults": [ … ], "hasErrors": false}` (для других запросов — `UpdateQuery`, `DeleteQuery`, `SelectQuery` в `__type`).
- ✅ Дата и время в `InsertQuery`/`UpdateQuery` (подтверждено записью в CRM, 23.10.2026): `dataValueType` `7` (дата и время), значение — JSON-строка внутри строки: `"value": "\"2026-10-23T10:00:00\""`. Без внутренних кавычек сервис отвечает `ArgumentNullException: Value cannot be null. (Parameter 'value')` (`Parameter.GetDateTimeValue` разбирает значение как JSON).
- ✅ Запросы `DataService` идут через сущность: срабатывают слушатели объекта (`OnInserted`, `OnUpdated`, `OnDeleted`), пишется журнал изменений, действуют права по записям. Клиентский ESQ (`InsertQuery`, `UpdateQuery`, `DeleteQuery` в JS) шлёт те же запросы.
- ✅ Ключи тела — **camelCase**. Ключи в PascalCase (`RootSchemaName`, `Columns`) сервер молча игнорирует и возвращает только `Id`.
  ```json
  {"rootSchemaName": "<Объект>", "operationType": 0, "rowCount": 10,
   "columns": {"items": {"<Колонка>": {"expression": {"expressionType": 0, "columnPath": "<Колонка>"}}}},
   "filters": {"filterType": 6, "items": {"<Ключ>": {"filterType": 1, "comparisonType": 3,
     "leftExpression": {"expressionType": 0, "columnPath": "<Колонка>"},
     "rightExpression": {"expressionType": 2, "parameter": {"dataValueType": 1, "value": "<значение>"}}}}}}
  ```
- ✅ Коды: `filterType` 6 — группа, 1 — сравнение; `comparisonType` 3 — равно; `expressionType` 0 — колонка, 2 — параметр; `dataValueType` 1 — текст (остальные коды — `crm-db.md`, «Типы данных: GUID и коды»). Ответ: `{"rowConfig": …, "rows": [ … ], "rowsAffected": N, "success": true}`.
- Для внешних интеграций проще OData; DataService использует сам клиент CRM.

## Свой REST-сервис: адреса и ошибки
- ✅ Адрес — `<CRM>/rest/<Класс>/<Метод>`. `/ServiceModel/<Класс>.svc/<Метод>` для своего сервиса — 404, пока класс не зарегистрирован как анонимный (ниже).
- ✅ Свой префикс — атрибуты `BPMSoft.Web.Common.ServiceRouting` на классе: `[DefaultServiceRoute]` и `[ServiceRoute("<префикс>")]` вместе — сервис отвечает и по `/rest/<Класс>/…`, и по `/<префикс>/rest/<Класс>/…`. `[SspServiceRoute]` — для портала (🧪).
- ✅ GET с параметрами: `[WebInvoke(Method = "GET", UriTemplate = "<Метод>?<параметр>={<параметр>}", BodyStyle = WebMessageBodyStyle.Bare, ResponseFormat = WebMessageFormat.Json)]`, параметры метода — `string`.
- ✅ Свой код HTTP: `throw new WebFaultException<string>("<текст>", HttpStatusCode.<Код>)` (`using System.Net; using System.ServiceModel.Web;`) — клиент получает этот код и строку JSON в теле.
- ✅ Необработанное исключение в методе — HTTP 400 с HTML-страницей «Request Error», не 500 и не JSON. Для понятного ответа лови исключения и возвращай `WebFaultException` или объект-ответ с полями `success` и описанием ошибки.
- ✅ Новый сервис после компиляции отвечает 404 до перезапуска приложения (`platform-api.md`).
- ✅ Ответ REST-метода объектом (07.10.2026, `TestTicketStatsService`): классы с `[DataContract]`, свойства с `[DataMember(Name = "<имя в JSON>")]` (`using System.Runtime.Serialization;`); при `BodyStyle = WebMessageBodyStyle.Wrapped` клиент получает `{"<Метод>Result": {<поля по Name>}}`, `List<T>` — массивом объектов.

## Анонимный сервис (.NET 8)
- ✅ Регистрация — не в `Pkg`: файл `[app]/appsettings.json`, раздел `ConfigurationServices` → `AnonymousRoutes`, запись `"BPMSoft.Configuration.<Класс>": ["/ServiceModel/<Класс>.svc"]` (ключ — полное имя класса с пространством имён), затем перезапуск приложения. Файл правит пользователь или администратор стенда: агент даёт готовую строку и инструкцию. При обновлении платформы файл может быть перезаписан — запись нужно сохранить.
- ✅ Вызов без входа — `<CRM>/ServiceModel/<Класс>.svc/<Метод>`. Адрес `/rest/<Класс>/<Метод>` без входа по-прежнему перенаправляет на вход (302).
- ✅ В анонимном вызове `UserConnection` сервиса — `null` (без исключения). Для работы с данными — `AppConnection.SystemUserConnection`: системный пользователь, права не ограничены, поэтому проверку вызывающего (подпись, токен) делай сам.
- ✅ Перед работой с `Entity` и процессами в анонимном сервисе платформа и проекты вызывают `SessionHelper.SpecifyWebOperationIdentity(HttpContextAccessor.GetInstance(), SystemUserConnection.CurrentUser)` (`BPMSoft.Web.Common`; подтверждено на реальных схемах, 23.10.2026: так в большинстве из ~40 вызовов на трёх стендах; в сервисах-наследниках `BaseService` — `(CurrentHttpContext, UserConnection.CurrentUser)`). В анонимном вызове `UserConnection` — `null`, поэтому пользователь — `SystemUserConnection.CurrentUser`. ✅ Без этого вызова (24.10.2026): `Entity.Save` и `ProcessExecutor.Execute` через `SystemUserConnection` работают, а фоновая задача `Task.StartNewWithUserConnection` падает: `InvalidOperationException: Failed to get the context for the background operation. For services without authorization it is necessary to call BPMSoft.Web.Common.SessionHelper.SpecifyWebOperationIdentity.` С вызовом задача выполняется от системного пользователя.
- 🧪 На .NET Framework регистрация — в `Web.config` папки `ServiceModel` (по документации Creatio).

## ✅ Текущий пользователь запроса (25.10.2026)
- `POST <CRM>/ServiceModel/UserInfoService.svc/GetCurrentUserInfo` без тела, с cookie и `BPMCSRF` → `{"userInfo": {"id": "<Id пользователя SysAdminUnit>", "contactId": "<Id контакта>", "contactName": "<имя>", "cultureInfo": {...}}}`. Только POST: GET и адрес `/rest/UserInfoService/GetCurrentUserInfo` отвечают 404. Так узнают Id пользователя, под которым работает `crm_request` (например, для вебхука с аутентификацией Cookie).

## ✅ Веб-форма (лендинг): заявка с сайта без входа (25.10.2026)
- Форма — запись `GeneratedWebForm` (раздел «Лендинги и веб-формы»). `TypeId` → `LandingType` задаёт, какой объект создаётся: лид `62b81c7e-bc2b-4ec5-8441-d486b384f57d`, обращение `f5b1edb7-78c2-4a38-b2d0-3de1f3215975`, заказ `b5af18f6-98c0-4b1f-8563-0045ceb3b194`, участник мероприятия `ca022b3d-23ff-4486-8392-8d65204b0143`, отправленная форма (`FormSubmit`) `5052dafd-0a10-4d9d-b166-0fc8215e4c6e`.
- `StateId` — форма принимает данные только в состоянии `fbe29614-c02c-446e-ac8c-e7f62c4899ec`. `ExternalURL` — адреса сайтов, с которых разрешена отправка (через `;`, `,` или пробел); сравнивается начало адреса из заголовка `Referer` без протокола и `www.`.
- Отправка без входа: `POST <CRM>/ServiceModel/GeneratedObjectWebFormService.svc/SaveWebFormObjectData` (сервис уже есть в `AnonymousRoutes` `appsettings.json`), заголовки `Content-Type: application/json` и `Referer: <адрес страницы сайта>`, тело `{"formData": {"formId": "<Id формы>", "formFieldsData": [{"name": "<колонка объекта>", "value": "<значение>"}]}}`. Ответ — `{"SaveWebFormObjectDataResult": "{resultMessage:\"Данные успешно сохранены\",resultCode:0}"}`; запись создаётся от системного пользователя, у лида заполнена `WebFormId`.
- `Referer` не из `ExternalURL` — `resultCode:-1`, «URL, с которого выполнен запрос, не разрешен в системе». Без `Referer` — ошибка сервера (HTML «Request Error»). 🧪 Неактивная форма — сообщение о том, что лендинг выключен.
- 🧪 Своя обработка заявки: класс с интерфейсом `IGeneratedWebFormPreProcessHandler` (до сохранения) или `IGeneratedWebFormPostProcessHandler` (после) и строка в `WebFormProcessHandlers`: `EntityName` — имя объекта типа формы, `FullClassName` — `"<Пространство имён>.<Класс>, BPMSoft.Configuration"`, `IsActive`. Так подключены базовые обработчики лида и обращения; свой не проверялся.

## Исходящие HTTP-вызовы из C#
- ✅ `HttpClient client = ClassFactory.Get<IHttpClientFactory>().CreateClient();` (`using System.Net.Http; using BPMSoft.Core.Factories;`) — так делает код платформы; не создавай `new HttpClient()` на каждый вызов. Таймаут — `client.Timeout`; синхронно из метода сервиса — `client.GetAsync(url).GetAwaiter().GetResult()`.
- Для внешнего API с описанием удобнее REST-схема (ServiceSchemaManager, `web-service-edit.md`); её вызов из C# через `IServiceSchemaClient` — ✅ (`web-service-edit.md`, «Вызвать REST-сервис из C#»).
