# Процессы: запуск с клиента, из C# и по HTTP — рецепты

Запуск процесса и чтение результата: с клиента, из C# (`ProcessExecutor`), по HTTP. Создание процесса и чек-лист — `process-edit.md`; журнал выполнения — `processes.md`.

## ✅ Запуск процесса с клиента и из C#
**Подтверждено 30.09.2026**: процесс `TestProcFromClient` (входные параметры `PContactId` — справочник Contact, `PSource` — текст; `L12: 0`) запущен двумя способами, оба создали запись с переданными значениями.

**С клиента** (пункт «Действия» карточки, замещение `ContactPageV2`): модуль `ProcessModuleUtilities` в зависимостях `define` и в аргументах функции, затем
```js
ProcessModuleUtilities.executeProcess({
	sysProcessName: "TestProcFromClient",   // имя (A2) процесса
	parameters: {                                // имена параметров процесса (FJ1.A2)
		PContactId: this.get("Id"),
		PSource: "карточки контакта"
	}
	// callback: this.<метод>, scope: this — по желанию, вызывается после запуска
});
```
Пункт меню — переопределение `getActions` (см. `client-pages-edit.md`, «Замещение карточки»), `"Caption": resources.localizableStrings.<Ключ>` — работает и в совмещённом режиме.

**Из C#** (задание-сценарий, веб-сервис, событие объекта):
```csharp
var parameters = new Dictionary<string, string> {
	{ "PContactId", UserConnection.CurrentUser.ContactId.ToString() },
	{ "PSource", "C# (ProcessExecutor)" }
};
UserConnection.ProcessEngine.ProcessExecutor.Execute("TestProcFromClient", parameters);
```
Перегрузки `IProcessExecutor.Execute` (XML-документация `BPMSoft.Core.xml`): по имени или UId схемы; с `IReadOnlyDictionary<string, string>` значений параметров (значения — строки); с перечнем имён результирующих параметров.
- ✅ Несколько выходов и статус (подтверждено записью в CRM, 21.10.2026): `ProcessDescriptor descriptor = UserConnection.ProcessEngine.ProcessExecutor.Execute("<Процесс>", <Dictionary<string, string>>, new[] { "<Выход1>", "<Выход2>" });` (`using BPMSoft.Core.Process;`). `descriptor.UId` — UId экземпляра (`SysProcessLog.Id`), `descriptor.ProcessStatus` — `Done` (в `SysProcessLog` это статус «Completed»), `Running` (процесс ждёт элемент) или `Error` (элемент бросил исключение — `Execute` его не пробрасывает), `descriptor.ResultParameterValues` — словарь «имя → значение» на момент возврата. Отмена экземпляра — `ProcessExecutor.CancelExecutionAsync(descriptor.UId)`. Опровергнуто (24.10.2026): прежняя запись «успешный статус дескриптора — `Completed`» — перечисление `ProcessStatus`: `Inactive`, `Running`, `Done`, `Error`, `Cancelled`, `Cancelling`; `Completed` — имя статуса в таблице `SysProcessStatus`.
- ✅ `Execute` запускает только процесс с простым стартом (`ProcessSchemaStartEvent`; подтверждено в CRM, 09.10.2026). У процесса со стартом только по сигналу — `ProcessCannotBeManuallyStartedException`: «начальные события предназначены только для автоматического запуска». Нужны оба запуска — поставь простой старт рядом со стартовым сигналом.
- ✅ Выходной параметр (подтверждено в CRM, 09.10.2026): `UserConnection.ProcessEngine.ProcessExecutor.Execute<string>("<Процесс>", "<Выходной параметр>", parameters)` возвращает его значение — так REST-метод отдаёт результат процесса клиенту.
- ✅ **Запуск из браузера с параметрами** (подтверждено в CRM, 14.10.2026, .NET Core): открой адрес `/ServiceModel/ProcessEngineService.svc/<Процесс>/Execute?ResultParameterName=<Выходной параметр>&<Входной параметр>=<значение>` — процесс выполнится, ответ придёт XML-строкой `<string>` со значением выходного параметра. Кириллицу в значении кодируй по правилам URL. Удобно для проверки процесса с входными параметрами: кнопка «Запустить» в дизайнере их ввести не даёт.
- ✅ **Дизайнер процесса по ссылке** (14.10.2026): `/Nui/ViewModule.aspx?vm=SchemaDesigner#process/<UId схемы>`.
- ✅ **Запуск с выходными параметрами по HTTP** (22.10.2026, под обычным пользователем): `POST /0/ServiceModel/ProcessEngineService.svc/RunProcess` с телом `{"schemaName": "<Процесс>", "parameterValues": [{"name": "<Параметр>", "value": "<значение>"}], "resultParameterNames": ["<Выход>"], "collectExecutionData": false}` → `{"processId": "<Id экземпляра>", "processStatus": 2, "resultParameterValues": [{"Key": "<Выход>", "Value": "<значение>"}], "success": true}`. Так работает клиентский `BPMSoft.ProcessEngineUtilities.runProcess({schemaName: "<Процесс>", parameterValues: {<Параметр>: <значение>}, resultParameterNames: ["<Выход>"]}, function(response) { … response.resultParameterValues … }, this)` (класс `BPMSoft.RunProcessRequest`; разбор ответа на клиенте — по коду, 🧪). `ProcessModuleUtilities.executeProcess` выходные параметры не возвращает.
- ✅ **Сигнал из C#** (22.10.2026): `UserConnection.IProcessEngine.ThrowSignal(new ProcessExecutingContext(UserConnection), "<Имя сигнала>");` (`using BPMSoft.Core.Process;`) запускает процессы со стартовым произвольным сигналом с этим `DZ1`; контекст без `Process` подходит.
- ❌ **Старый запуск** `UserConnection.ProcessSchemaManager.GetInstanceByName("<Процесс>").CreateProcess(UserConnection)` + `process.SetPropertyValue("<Параметр>", …)` + `process.Execute(UserConnection)` не работает для интерпретируемого процесса (`BK30: true`, так у процессов, собранных файлами и в Designer по умолчанию): `InvalidObjectStateException` «В типе "ProcessComponentSet" отсутствует свойство "<Параметр>"». Платформа так запускает только свои скомпилированные процессы. Используй `ProcessExecutor.Execute` (выше).
