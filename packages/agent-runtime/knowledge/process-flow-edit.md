# Процессы: ход выполнения — рецепты

Часть рецептов из `process-edit.md` (там — общее для всех: чек-лист «Проверка перед сдачей процесса», создание процесса, настройки и параметры). Здесь: шлюзы и условные потоки, методы процесса, стартовый сигнал, таймеры и ожидание сигнала, подпроцесс, коллекции, генерирующий сигнал. Общая механика — `metadata-editing.md`. ✅ — проверено записью в CRM, 🧪 — не проверено.

## ✅ Шлюзы и условные потоки
**Подтверждено 29.09.2026**: `TestProcGateway` (исключающий шлюз, две условные ветки и ветка по умолчанию — при `PMode = 2` выполнилась ветка 2; Designer показал условия `[#Режим#] == 1` и «Поток по умолчанию») и `TestProcParallel` (параллельные разветвление и слияние, шлюз «ИЛИ» с истинным и ложным условием и его слияние, условный поток и поток по умолчанию прямо из задания — выполнились ровно ожидаемые ветки).

| Элемент | `BL1` | `BL7` (константа) | Свои поля |
|---|---|---|---|
| Исключающий шлюз («ИЛИ»-исключающее, ×) | `BPMSoft.Core.Process.ProcessSchemaExclusiveGateway` | `bd9f7570-6c97-4f16-90e5-663a190c6c7c` | `BN2: "55;55"`, `BO3: true`, `HH2: []` |
| Параллельный шлюз (+), и разветвление, и слияние | `BPMSoft.Core.Process.ProcessSchemaParallelGateway` | `e9e1e6de-7066-4eb1-bbb4-5b75b13d4f56` | `BN2: "55;55"`, `BO3: true`, `CG1: {}` |
| Шлюз «ИЛИ» (Inclusive, ○), и разветвление, и слияние | `BPMSoft.Core.Process.ProcessSchemaInclusiveGateway` | `ffa4a06a-5747-49d4-96c2-c32a727a3b14` | `BN2: "55;55"`, `BO3: true`, `HH2: []` |
| Условный поток | `BPMSoft.Core.Process.ProcessSchemaConditionalFlow` | `dac675d4-ea84-4e44-9056-38bf918618e9` | `CI3` — условие (C# с макросами), `CI4: 2`, `GV2` — строка-константа (см. пример), `GV3: []` |
| Поток по умолчанию | `BPMSoft.Core.Process.ProcessSchemaSequenceFlow` | `573ed909-e069-4161-b193-ae8dd9437c68` (не как у обычной связи!) | `CI3: "null"`, `CI4: 1` |
| Обычная связь | `BPMSoft.Core.Process.ProcessSchemaSequenceFlow` | `0d8351f6-c2f4-4737-bdd9-6fbfe0837fec` | `CI3: "null"`, без `CI4` |

- Условие ссылается на параметр процесса так: `[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId параметра>}]#] == 2`. Ресурс для условия не нужен: Designer сам показывает `[#Режим#] == 2` по подписи параметра. Подпись связи — `BaseElements.<ИмяСвязи>.Caption`.
- Условные потоки и поток по умолчанию можно выводить прямо из задания (без шлюза): условный идёт, если условие истинно; по умолчанию — если ни одно не истинно.
- Слияние «ИЛИ» ждёт только активные ветки (ветка с ложным условием не блокирует). Параллельное слияние ждёт все входящие.
- Несколько связей могут вести в одно «Завершение».
- ⚠️ Порядок в `BK4`: каждая связь (`SequenceFlow`, `ConditionalFlow`) должна стоять ПОСЛЕ обеих фигур, которые она соединяет. Платформа читает `BK4` по порядку, и поток при чтении сразу ищет свою цель: иначе «Обновить из файловой системы» падает с «Элемент коллекции с уникальным идентификатором "{…}" не найден» (`ProcessSchemaSequenceFlow.set_TargetRefUId` в `PackagesSynchronization.log`). Надёжно: сначала все фигуры, потом все связи (✅ 05.10.2026, `TestProcG7`).
- ⚠️ `Labels` (массив верхнего уровня схемы): Designer кладёт туда объект `ProcessSchemaLabel` (`UId`, `A2` вида `<ИмяСвязи>_label1`, `A3`/`A4` = UId процесса, `ParentUId` = UId связи, `X`/`Y` — смещение подписи), когда пользователь двигает подпись связи. При удалении связи удали и её подписи из `Labels`: «Обновить из файловой системы» пройдёт без ошибок, но Designer покажет пустой холст (в консоли `Cannot read properties of undefined (reading 'caption')` в `getLabelConfig`) (✅ 05.10.2026, `TestProcG7`).
- Имена связей в проекте: `SequenceFlowN`, `ConditionalSequenceFlowN`, `DefaultSequenceFlowN` — не обязательны, но так их называет Designer.

Пример условного потока:
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaConditionalFlow",
  "UId": "41416a8c-d737-4c65-8ab3-3b946f03976a",
  "A2": "ConditionalSequenceFlow1",
  "A3": "4eb44b2e-d979-4e56-bbad-96f59494a9bc",
  "A4": "4eb44b2e-d979-4e56-bbad-96f59494a9bc",
  "A5": "<UId пакета>",
  "BL7": "dac675d4-ea84-4e44-9056-38bf918618e9",
  "BL8": "4eb44b2e-d979-4e56-bbad-96f59494a9bc",
  "CI1": "5073bab4-dc7e-4062-8525-25ba70d60ccc",
  "CI2": "e9edf340-7c3d-45cf-97a3-a4b58b355180",
  "CI3": "[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{54a10d14-deef-4346-a7ca-353dab01dfdf}]#] == 9",
  "CI4": 2,
  "CI5": "FF939598",
  "CI6": 1,
  "CI11": "590;200",
  "CI12": "660;100",
  "GV2": "{\"$type\":\"System.Collections.Generic.Dictionary`2[[System.Guid, System.Private.CoreLib],[System.Collections.ObjectModel.Collection`1[[System.Guid, System.Private.CoreLib]], System.Private.CoreLib]], System.Private.CoreLib\"}",
  "GV3": []
}
```
Пример потока по умолчанию:
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaSequenceFlow",
  "UId": "5af5b39b-25c0-43b6-a2bd-9509deb830ac",
  "A2": "DefaultSequenceFlow1",
  "A3": "4eb44b2e-d979-4e56-bbad-96f59494a9bc",
  "A4": "4eb44b2e-d979-4e56-bbad-96f59494a9bc",
  "A5": "<UId пакета>",
  "BL7": "573ed909-e069-4161-b193-ae8dd9437c68",
  "BL8": "4eb44b2e-d979-4e56-bbad-96f59494a9bc",
  "CI1": "23599e95-9161-433c-9e04-60e55f563e3e",
  "CI2": "579e5ea6-d3db-482a-b41f-bcbc354e21a5",
  "CI3": "null",
  "CI4": 1,
  "CI5": "FF939598",
  "CI6": 1,
  "CI11": "970;200",
  "CI12": "1200;212"
}
```

- ✅ **C#-выражения в условиях потоков и в «Формуле»** (10.10.2026): `[#<параметр-справочник>#] != Guid.Empty`, вложенный тернарный оператор `a ? "x" : b ? "y" : "z"`, склейка строк.

## ✅ Методы процесса (`BK32`), `using` (`B3`), передача значений между заданиями через `Set`/`Get`
**Подтверждено 29.09.2026** на `TestProcMethods`: процесс скомпилировался; Designer на вкладке «Методы» показал оба `using` и код методов; первое задание-сценарий посчитало через Linq и метод процесса и записало результат `Set("POut", ...)`, второе прочитало `Get<int>("POut")` (27) и создало запись; строка `logger.Info(...)` попала в лог.

- ✅ Прочитать запись в задании-сценарии (подтверждено в CRM, 13.10.2026): `var entity = UserConnection.EntitySchemaManager.GetInstanceByName("<Объект>").CreateEntity(UserConnection);` → `entity.FetchFromDB(<Id>)` → `entity.GetTypedColumnValue<string>("<Колонка>")`; дополнительные `using` не нужны.

- `BK32` — строка с C#-кодом членов класса процесса (поля, методы). Доступны из всех заданий-сценариев процесса. В файле ставь ключ после `BK30` (так пишет Designer; порядок остальных ключей держим как в реальных файлах; у каждого элемента `BL1` обязательно первым полем — см. `metadata-editing.md`, «Формат B: BL1 — первым полем»).
- `B3` — список `using`, по элементу на пространство имён:
```json
[
  {
    "UId": "905e8124-4ecc-4aff-9353-21623954864c",
    "A2": "System.Linq",
    "A3": "5c3b9372-4462-4800-a8e2-6c0023008e19",
    "A4": "5c3b9372-4462-4800-a8e2-6c0023008e19",
    "A5": "88e2e1da-4444-441b-b68b-4207fb2b3b86",
    "GF1": "null"
  },
  {
    "UId": "de9e1336-67ae-41e6-8cda-fa03dd029a44",
    "A2": "global::Common.Logging",
    "A3": "5c3b9372-4462-4800-a8e2-6c0023008e19",
    "A4": "5c3b9372-4462-4800-a8e2-6c0023008e19",
    "A5": "88e2e1da-4444-441b-b68b-4207fb2b3b86",
    "GF1": "null"
  }
]
```
  `A3`/`A4` = UId процесса, `A5` = `A5` самой схемы процесса (как в реальных файлах), `GF1: "null"`. Стандартный набор `using` процесса (без `B3`) — в начале `Autogenerated/Src/<Процесс>.<Пакет>.cs`; `System.Linq` и `global::Common.Logging` в него не входят. Частые `B3` проекта: `System.Linq`, `global::Common.Logging`, `BPMSoft.Configuration`, `BPMSoft.Core.Factories`, `Newtonsoft.Json`.
- Параметр процесса без значения по умолчанию (`L8` = `{"GS5": ...}`) можно заполнить в одном задании `Set("POut", value)` и прочитать в следующем `Get<int>("POut")`.

**Как проверить выполнение без скриншотов**: лог приложения стенда — `[app]/Logs/<ГГГГ-ММ-ДД>/Common.log`. Логгер `LogManager.GetLogger("Common")` — см. `source-code-edit.md`, «`<Имя>.cs`».

- ✅ В методах процесса `Get<bool>("<Параметр>")` и `Get<System.Guid>("<Параметр>")` читают логический и справочный параметры так же, как `Get<int>` (10.10.2026).
- ✅ «Формулу» можно заменить заданием-сценарием на том же месте и с тем же UId элемента: входящие и исходящие связи остаются (10.10.2026).

## ✅ Стартовый сигнал по объекту (запись добавлена / изменена)
**Подтверждено 29.09.2026**: `TestProcOnInsert` (старт по добавлению записи `TestProcEntity`) и `TestProcOnUpdate` (старт по изменению колонки «Количество» с фильтром «Количество > 500») запустились сами, когда другие процессы добавили и изменили запись, и записали Журнал в нужную запись. Designer показал сигналы с подписями. Процессы-обработчики работают после «Обновить из файловой системы» и компиляции — отдельной публикации не нужно.

- `BL1` `BPMSoft.Core.Process.ProcessSchemaStartSignalEvent`, `BL7` `1129e72f-0e8c-445a-b2ea-463517e86395`; после `IL2` идёт `IL3: true`.
- `FC2` — UId объекта; `DZ3: true` — ждать сигнал объекта; `DZ2: false`, `DZ1: "null"` — не произвольный сигнал; `ED1: false`.
- `DZ5` — тип изменения (enum `EntityChangeType`): `1` добавлена, `2` изменена, `4` удалена.
- `DZ11: true` + `DZ12` — «изменилась одна из колонок»: `DZ12` = JSON-строка `{"$type":"System.Collections.ObjectModel.Collection`1[[System.String, mscorlib]], mscorlib","$values":["<UId колонки>", ...]}`. Для добавления — `DZ11` не пишется, `$values` пустой.
- `DZ8: true` + `DZ13` — фильтр записи, формат как `DataSourceFilters` у «Читать данные» (`process-data-edit.md`, «Элемент «Читать данные»»). Без фильтра `DZ8` не пишется, а `DZ13` — пустая группа.
- ✅ Фильтр «логическая колонка = да» (подтверждено в CRM, 09.10.2026): правая часть — `dataValueType: 12`, `value: true` в обеих строках (для Designer и `dataSourceFilters`). Сигнал «запись добавлена» с этим фильтром ловит новую запись сразу с «да»; сигнал «запись изменена» по этой колонке (`DZ12`) с тем же фильтром — только переход в «да».
- ✅ Фильтр «колонка по пути заполнена» (03.10.2026, `TestProcLeadAge`: «Контакт.Дата рождения заполнено»): элемент группы `{"className": "BPMSoft.IsNullFilter", "filterType": 2, "comparisonType": 2, "isNull": false, "leftExpression": {"className": "BPMSoft.ColumnExpression", "expressionType": 0, "columnPath": "QualifiedContact.BirthDate"}, "dataValueType": 8, "leftExpressionCaption": "Контакт.Дата рождения", ...}`; «не заполнено» — `comparisonType: 1`, `isNull: true`. Путь через справочную колонку — через точку. `dataValueType` клиента: `0` GUID, `1` текст, `4` целое, `7` дата/время, `8` дата.
- `FC1` — выходной параметр `RecordId` (`L1` GUID, `L8` `{"GS1": 1, "GS2": ""}`, `IL2` = UId сигнала). Взять его в параметр процесса — формулой `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId сигнала>}].[Parameter:{<UId RecordId>}]#]`. Ресурс: `BaseElements.StartSignal1.Parameters.RecordId.Caption`.
- Обработчик, меняющий ту же запись, не зацикливается, если меняет колонку не из `DZ12` (проверено: обработчики писали в «Журнал», сигнал ждал «Количество»). Событие не срабатывает на прямую вставку SQL — только через приложение (процесс, карточку, `Entity.Save()`).

```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaStartSignalEvent",
  "UId": "710b6708-34f7-4a92-b862-9bfeb186ad9e",
  "A2": "StartSignal1",
  "A3": "c74b6ba4-1431-4f6a-b2a0-ea1b0dbff7a9",
  "A4": "c74b6ba4-1431-4f6a-b2a0-ea1b0dbff7a9",
  "A5": "<UId пакета>",
  "IL2": "3f15af1d-764b-4062-85bc-e2be738f59b7",
  "IL3": true,
  "BL3": "50;184",
  "BL7": "1129e72f-0e8c-445a-b2ea-463517e86395",
  "BL8": "c74b6ba4-1431-4f6a-b2a0-ea1b0dbff7a9",
  "BN2": "31;31",
  "BO3": true,
  "FC1": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "c6459dab-26c5-48ee-9b8e-0d16e31716bd",
      "A2": "RecordId",
      "A3": "c74b6ba4-1431-4f6a-b2a0-ea1b0dbff7a9",
      "A4": "c74b6ba4-1431-4f6a-b2a0-ea1b0dbff7a9",
      "IL2": "710b6708-34f7-4a92-b862-9bfeb186ad9e",
      "L1": "23018567-a13c-4320-8687-fd6f9e3699bd",
      "L8": {
        "GS1": 1,
        "GS2": ""
      }
    }
  ],
  "FC2": "c4848520-8352-4bb4-bab1-c4be07daf0c5",
  "ED1": false,
  "DZ1": "null",
  "DZ2": false,
  "DZ3": true,
  "DZ5": 2,
  "DZ8": true,
  "DZ11": true,
  "DZ12": "{\"$type\":\"System.Collections.ObjectModel.Collection`1[[System.String, mscorlib]], mscorlib\",\"$values\":[\"7e97fca4-e510-4363-9c3e-a3393421fc3e\"]}",
  "DZ13": "{\"className\":\"BPMSoft.FilterGroup\",\"serializedFilterEditData\":\"{\\\"className\\\":\\\"BPMSoft.FilterGroup\\\",\\\"items\\\":{\\\"2164b049-aafd-43d4-8eec-620a549f2900\\\":{\\\"className\\\":\\\"BPMSoft.CompareFilter\\\",\\\"filterType\\\":1,\\\"comparisonType\\\":7,\\\"isEnabled\\\":true,\\\"trimDateTimeParameterToDate\\\":false,\\\"leftExpression\\\":{\\\"className\\\":\\\"BPMSoft.ColumnExpression\\\",\\\"expressionType\\\":0,\\\"columnPath\\\":\\\"Amount\\\"},\\\"isAggregative\\\":false,\\\"key\\\":\\\"2164b049-aafd-43d4-8eec-620a549f2900\\\",\\\"dataValueType\\\":4,\\\"leftExpressionCaption\\\":\\\"Количество\\\",\\\"rightExpression\\\":{\\\"className\\\":\\\"BPMSoft.ParameterExpression\\\",\\\"expressionType\\\":2,\\\"parameter\\\":{\\\"className\\\":\\\"BPMSoft.Parameter\\\",\\\"dataValueType\\\":4,\\\"value\\\":500}}}},\\\"logicalOperation\\\":0,\\\"isEnabled\\\":true,\\\"filterType\\\":6,\\\"rootSchemaName\\\":\\\"TestProcEntity\\\",\\\"key\\\":\\\"\\\"}\",\"dataSourceFilters\":\"{\\\"items\\\":{\\\"2164b049-aafd-43d4-8eec-620a549f2900\\\":{\\\"filterType\\\":1,\\\"comparisonType\\\":7,\\\"isEnabled\\\":true,\\\"trimDateTimeParameterToDate\\\":false,\\\"leftExpression\\\":{\\\"expressionType\\\":0,\\\"columnPath\\\":\\\"Amount\\\"},\\\"rightExpression\\\":{\\\"expressionType\\\":2,\\\"parameter\\\":{\\\"dataValueType\\\":4,\\\"value\\\":500}}}},\\\"logicalOperation\\\":0,\\\"isEnabled\\\":true,\\\"filterType\\\":6,\\\"rootSchemaName\\\":\\\"TestProcEntity\\\"}\"}"
}
```

- ✅ Пару стартовых сигналов («запись добавлена» с фильтром и «изменилась колонка» с тем же фильтром) можно клонировать из процесса другого пакета: замени UId объекта, UId колонок и `rootSchemaName` в обеих строках фильтра (10.10.2026).

## ✅ Таймеры и промежуточное ожидание сигнала
**Подтверждено 29–30.09.2026**: `TestProcTimer` (стартовый таймер с cron «каждые 2 минуты») начал запускаться сразу после «Обновить из файловой системы» и компиляции — без сохранения в Designer: при обновлении платформа сама записала строку в `SysStartTimerInProcess` (`ProcessUId`, `ExpressionType`, `ProcessElementUId`), процесс отработал в 10:10, 10:12, 10:14. `TestProcWait`: промежуточный таймер 30 с и ожидание сигнала «у записи из параметра изменилась колонка» сработали.

**Стартовый таймер** (`ProcessSchemaStartTimerEvent`, `BL7` `c735ed92-e545-4699-b3c6-f8f57dd8c529`): `PS1` — cron Quartz из 7 полей (сек мин час день месяц день_недели год, например `0 */2 * * * ? *`); `PS3` — тип расписания (enum `StartTimerEventExpresionType`: 0 SingleRun, 1 MinuteHour, 2 Day, 3 Week, 4 Month, 5 Year, 6 CustomCronExpression; ✅ проверен 6); `PS4`/`PS5` — начало/конец (`"null"` = без ограничений); `PS6` — часовой пояс (`"Russian Standard Time"`, `"UTC"`); `ED1: false`, `FC1: []`.
⚠️ Таймерный процесс запускается, пока не выключен или не удалён. Для теста делай скрипт самоограничивающим (например, не создавать больше N записей).
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaStartTimerEvent",
  "UId": "e643ad53-400c-4d29-88a7-836957defffc",
  "A2": "StartTimerEvent1",
  "A3": "c3694b24-8c45-4bdf-a23d-02ed6f5d7477",
  "A4": "c3694b24-8c45-4bdf-a23d-02ed6f5d7477",
  "A5": "<UId пакета>",
  "IL2": "3a924454-670e-4499-9ec9-78fe01d12039",
  "BL3": "50;184",
  "BL7": "c735ed92-e545-4699-b3c6-f8f57dd8c529",
  "BL8": "c3694b24-8c45-4bdf-a23d-02ed6f5d7477",
  "BN2": "31;31",
  "BO3": true,
  "FC1": [],
  "ED1": false,
  "PS1": "0 */2 * * * ? *",
  "PS3": 6,
  "PS4": "null",
  "PS5": "null",
  "PS6": "Russian Standard Time"
}
```

**Промежуточный таймер** (`ProcessSchemaIntermediateCatchTimerEvent`, `BL7` `97d1af3d-ef13-465c-b6d8-5425f78bf000`): после `IL2` — `IL3: true`; `FC1` — параметр `StartOffset` (целое, `L8.GS2` — задержка в секундах, можно выражение `"10 * 60"`); `BY3: 0`. Процесс должен сериализоваться в БД (`IJ1: true`). Ресурсы: `BaseElements.<Имя>.Parameters.StartOffset.Caption` / `.DisplayValue`.
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaIntermediateCatchTimerEvent",
  "UId": "d4a71f73-a636-4f14-82e1-e53deb3a67a7",
  "A2": "IntermediateCatchTimer1",
  "A3": "72ba152c-9f5c-493f-9636-898e533ec740",
  "A4": "72ba152c-9f5c-493f-9636-898e533ec740",
  "A5": "<UId пакета>",
  "IL2": "20690e8e-3bda-488e-920a-5e78549a0d49",
  "IL3": true,
  "BL3": "300;184",
  "BL7": "97d1af3d-ef13-465c-b6d8-5425f78bf000",
  "BL8": "72ba152c-9f5c-493f-9636-898e533ec740",
  "BN2": "31;31",
  "BO3": true,
  "FC1": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "e80f3fef-9ba0-4887-980d-0ad14ad9b204",
      "A2": "StartOffset",
      "A3": "72ba152c-9f5c-493f-9636-898e533ec740",
      "A4": "72ba152c-9f5c-493f-9636-898e533ec740",
      "IL2": "d4a71f73-a636-4f14-82e1-e53deb3a67a7",
      "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
      "L8": {
        "GS1": 1,
        "GS2": "30",
        "GS5": "72ba152c-9f5c-493f-9636-898e533ec740"
      }
    }
  ],
  "BY3": 0
}
```

**Промежуточное ожидание сигнала объекта** (`ProcessSchemaIntermediateCatchSignalEvent`, `BL7` `5ccad23d-fc4b-4ec7-8051-e3a825b698fc`): поля с префиксом `CA` вместо `DZ` у стартового сигнала — `CA3: true` (сигнал объекта), `CA5` (1 добавлена, 2 изменена), `CA6` и `FC2` — UId объекта, `CA7: true` + `CA11` — список колонок (тип в строке — `System.Private.CoreLib`, не `mscorlib`), `CA8` + `CA13` — фильтр (пустая группа, если `CA8: false`), `CA1: "null"`, `CA2: false`, `BY3: 0`. В `FC1` параметр `RecordId` со значением-ссылкой на Id ожидаемой записи (`GS1: 3`, `[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId параметра процесса>}]#]`) — процесс ждёт изменения именно этой записи.
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaIntermediateCatchSignalEvent",
  "UId": "4a501e8f-e740-4cfc-8702-d0b6ae5289ab",
  "A2": "IntermediateCatchSignal1",
  "A3": "72ba152c-9f5c-493f-9636-898e533ec740",
  "A4": "72ba152c-9f5c-493f-9636-898e533ec740",
  "A5": "<UId пакета>",
  "IL2": "20690e8e-3bda-488e-920a-5e78549a0d49",
  "IL3": true,
  "BL3": "550;184",
  "BL7": "5ccad23d-fc4b-4ec7-8051-e3a825b698fc",
  "BL8": "72ba152c-9f5c-493f-9636-898e533ec740",
  "BN2": "31;31",
  "BO3": true,
  "FC1": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "8c5085c1-185a-4703-b0e3-479d8f57638b",
      "A2": "RecordId",
      "A3": "72ba152c-9f5c-493f-9636-898e533ec740",
      "A4": "72ba152c-9f5c-493f-9636-898e533ec740",
      "IL2": "4a501e8f-e740-4cfc-8702-d0b6ae5289ab",
      "L1": "23018567-a13c-4320-8687-fd6f9e3699bd",
      "L8": {
        "GS1": 3,
        "GS2": "[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{91f926b3-54f0-4b8e-b591-e49190ed32f5}]#]",
        "GS5": "72ba152c-9f5c-493f-9636-898e533ec740"
      }
    }
  ],
  "FC2": "c4848520-8352-4bb4-bab1-c4be07daf0c5",
  "BY3": 0,
  "CA1": "null",
  "CA2": false,
  "CA3": true,
  "CA5": 2,
  "CA6": "c4848520-8352-4bb4-bab1-c4be07daf0c5",
  "CA7": true,
  "CA8": false,
  "CA11": "{\"$type\":\"System.Collections.ObjectModel.Collection`1[[System.String, System.Private.CoreLib]], System.Private.CoreLib\",\"$values\":[\"7e97fca4-e510-4363-9c3e-a3393421fc3e\"]}",
  "CA13": "{\"className\":\"BPMSoft.FilterGroup\",\"serializedFilterEditData\":\"{\\\"className\\\":\\\"BPMSoft.FilterGroup\\\",\\\"items\\\":{},\\\"logicalOperation\\\":0,\\\"isEnabled\\\":true,\\\"filterType\\\":6,\\\"rootSchemaName\\\":\\\"TestProcEntity\\\",\\\"key\\\":\\\"\\\"}\",\"dataSourceFilters\":\"{\\\"items\\\":{},\\\"logicalOperation\\\":0,\\\"isEnabled\\\":true,\\\"filterType\\\":6,\\\"rootSchemaName\\\":\\\"TestProcEntity\\\"}\"}"
}
```

- ✅ **Таймер по будням** (10.10.2026, загрузился из файлов): выражение Quartz `0 0 10 ? * MON-FRI *` (`PS3: 6`).

## ✅ Подпроцесс (вызов другого процесса с входными и выходными параметрами)
**Подтверждено 02.10.2026**: `TestProcCaller` вызвал `TestProcSub` элементом «Подпроцесс» с `PIn = 7`; подпроцесс создал свою запись и вернул `POut = 70`; родитель прочитал выход формулой. Designer показал вызываемый процесс и его параметры с направлениями.

- `BL1` `BPMSoft.Core.Process.ProcessSchemaSubProcess`, `BL7` `49eafdbb-a89e-4bdf-a29d-7f17b1670a45`; `BO2: true`, `BO3: true`, `CK2: []`, `CK3: []`.
- `CK4` — UId вызываемого процесса.
- `BP2` — по параметру на КАЖДЫЙ параметр вызываемого процесса (`FJ1`): новый UId, `A2` и `L1`/`L12`/`L9` как у оригинала, `A3`/`A4` = UId вызываемого процесса, `IL2` = UId элемента «Подпроцесс». Значение входа — в `L8` (`GS5` = UId вызывающего процесса); у выхода `L8` только `{"GS5": ...}`.
- `BK15` — маппинг на каждый параметр `BP2`: `GT2` `[Element:{<подпроцесс>}].[Parameter:{<UId в BP2>}]`, `GT3` = UId в `BP2`, `GT4` = UId вызываемого процесса, `GT5` = UId параметра в `FJ1` вызываемого процесса, `GT1` = значение по умолчанию из вызываемого процесса (у нас `{"GS5": "<UId вызываемого>"}`).
- Выход подпроцесса читается ссылкой `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId подпроцесса>}].[Parameter:{<UId выходного параметра в BP2>}]#]` (формулой в параметр процесса).
- Ресурсы: `BaseElements.SubProcess1.Caption`, `BaseElements.SubProcess1.Parameters.<Имя>.Caption` / `.DisplayValue`.
- В проекте 61 подпроцесс с `BP6` (`JE2`…`JE7`) — режим «для каждой записи коллекции» (multi-instance), ✅ проверен 05.10.2026, см. ниже.

```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaSubProcess",
  "UId": "4e99d34f-c60e-4405-b4ac-6cdff8906cfc",
  "A2": "SubProcess1",
  "A3": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc",
  "A4": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc",
  "A5": "<UId пакета>",
  "IL2": "ef4900a8-8972-4646-844d-09025b6a0c30",
  "BL3": "150;172",
  "BL7": "49eafdbb-a89e-4bdf-a29d-7f17b1670a45",
  "BL8": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc",
  "BN2": "69;55",
  "BO2": true,
  "BO3": true,
  "BP2": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "a683e8d1-990d-4f9d-8a6b-aecd9c62da5a",
      "A2": "PIn",
      "A3": "6e8981b6-307a-445f-87bb-e0014117ffb9",
      "A4": "6e8981b6-307a-445f-87bb-e0014117ffb9",
      "IL2": "4e99d34f-c60e-4405-b4ac-6cdff8906cfc",
      "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
      "L8": {
        "GS1": 1,
        "GS2": "7",
        "GS5": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc"
      },
      "L12": 0
    },
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "fced0ae0-fb9c-4b23-9e58-eda42c8e5656",
      "A2": "POut",
      "A3": "6e8981b6-307a-445f-87bb-e0014117ffb9",
      "A4": "6e8981b6-307a-445f-87bb-e0014117ffb9",
      "IL2": "4e99d34f-c60e-4405-b4ac-6cdff8906cfc",
      "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
      "L8": {
        "GS5": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc"
      },
      "L12": 1
    }
  ],
  "CK4": "6e8981b6-307a-445f-87bb-e0014117ffb9",
  "CK2": [],
  "CK3": []
}
```

## ✅ Коллекции в задании-сценарии (проверено в CRM, 22.10.2026)
- Чтение результата «Читать данные» в режиме коллекции: `var rows = Get<ICompositeObjectList<ICompositeObject>>("<Элемент>.ResultCompositeObjectList");` затем `foreach (ICompositeObject row in rows) { row.TryGetValue<string>("<Колонка>", out string value); }` (`using BPMSoft.Common;`).
- Создание коллекции для параметра-коллекции: `var list = new CompositeObjectList<CompositeObject>(); list.Add(new CompositeObject { { "<Ключ>", <значение> } }); Set("<Параметр>", list);`.
- ✅ Проверено процессом «Старт → Читать данные (коллекция, `ResultType` `"2"`, колонка `Name`) → Задание-сценарий»: `ResultCompositeObjectList` вернул все записи, ключ значения — имя колонки (`TryGetValue<string>("Name", …)`); `CompositeObjectList` создаётся. ❌ `Get<EntityCollection>("<Элемент>.ResultEntityCollection")` в этом режиме — `null`, читай коллекцию через `ResultCompositeObjectList`. Без `using` пиши полные имена: `global::BPMSoft.Common.ICompositeObjectList<global::BPMSoft.Common.ICompositeObject>`.
- ⚠️ Новый процесс может не запускаться до перезапуска приложения — см. `process-run-edit.md`, «Запуск процесса с клиента и из C#».

## ✅ Подпроцесс по коллекции записей (multi-instance)
**Подтверждено 05.10.2026** на `TestProcIter` → `TestProcIterItem`: «Читать данные» в режиме коллекции прочитал 7 записей, подпроцесс запустился 7 раз (все экземпляры завершены), каждый получил «Название» своей записи и создал запись «G4: элемент <Название>». Образец структуры — реальный процесс проекта с элементом подпроцесса.
- «Читать данные» — режим коллекции: `ResultType` = `"2"`; колонки — `EntityColumnMetaPathes` и `ResultCompositeObjectList.L18` (UId элемента `L18` = UId колонки, как у образца).
- Элемент `ProcessSchemaSubProcess` (`BL7` `49eafdbb-a89e-4bdf-a29d-7f17b1670a45`, `BO2: true`, `CK4` = UId вызываемого процесса, `CK2: []`, `CK3: []`) — в `BP2` только 5 служебных параметров (`A3` = `A4` = UId процесса, `IL2` = UId элемента):
  - `CompletedIterationsCount`, `TerminatedIterationsCount`, `TotalIterationsCount` — целое `6b6b74e2-820d-490e-a017-2b73d4ccf2b0`, `L8 {}`, `L12: 1`;
  - `InputRecordCollection` — `L1` `651ec16f-d140-46db-b9e2-825c985a8ac2`, `L12: 0`, `L8 {GS1: 3, GS2: "[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId «Читать данные»>}].[Parameter:{<UId ResultCompositeObjectList>}]#]", GS5: <UId процесса>}`, `L18` — по копии каждого входного параметра вызываемого процесса (`A2`/`L1` как у него, `A3` = `A4` = UId вызываемого процесса, `IL2` = UId элемента), значение — колонка текущей записи: `L8 {GS1: 3, GS2: "[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId «Читать данные»>}].[Parameter:{<UId колонки из L18 коллекции>}]#]", GS5: <UId процесса>}`;
  - `OutputRecordCollection` — тот же `L1`, `L12: 1`, `L8 {}`, `L18` — те же параметры с `L8 {GS5: <UId процесса>}`.
- `BP6` — ссылки на эти параметры: `{"JE2": <InputRecordCollection>, "JE3": <OutputRecordCollection>, "JE5": <CompletedIterationsCount>, "JE6": <TerminatedIterationsCount>, "JE7": <TotalIterationsCount>}`.
- `BK15` — маппинг на каждый параметр из `InputRecordCollection.L18`: `GT2` = `[Element:{<UId элемента>}].[Parameter:{<UId параметра в L18>}]`, `GT3` = UId параметра в `L18`, `GT4` = UId вызываемого процесса, `GT5` = UId параметра в `FJ1` вызываемого процесса, `GT1` = `{"GS5": <UId вызываемого процесса>}` (как у образца).
- Ресурсы: `BaseElements.<Элемент>.Parameters.InputRecordCollection.<Параметр>.Caption`, `...OutputRecordCollection.<Параметр>.Caption`, подписи служебных параметров.
- Вызываемый процесс — обычный, параметр с `L12: 0`; читается в скрипте `Get<string>("PName")`.

- ✅ Цепочка «Читать данные» в режиме коллекции → подпроцесс по коллекции → «Выполнить действие процесса» → шлюз по его результату → «Изменить данные» работает, если собрать её клонированием подтверждённых элементов с заменой UId (10.10.2026).

## ✅ Генерирующий сигнал и старт по произвольному сигналу
**Подтверждено 05.10.2026** (Designer): `TestProcThrow` — элемент «Сгенерировать сигнал», собранный файлом, открылся в Designer («Генерация сигнала», «Какой сигнал сгенерировать?» = имя); `TestProcCatch` — стартовый сигнал, пересохранённый Designer (формат ниже). ✅ Запуск проверен: `TestProcThrow` сгенерировал сигнал, и `TestProcCatch` (без ручного запуска, в ту же секунду) создал запись.

Генерирующий сигнал (`BL7` `1793bff9-c5fa-49e7-a32d-ca73d270e137`, `CC1` — имя сигнала):
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaIntermediateThrowSignalEvent",
  "UId": "<GUID>", "A2": "IntermediateThrowSignal1", "A3": "<UId процесса>", "A4": "<UId процесса>", "A5": "<UId пакета>",
  "IL2": "<UId дорожки>", "BL3": "200;184", "BL7": "1793bff9-c5fa-49e7-a32d-ca73d270e137", "BL8": "<UId процесса>",
  "BN2": "31;31", "BO3": true, "FC1": [], "CC1": "TestSignalG2"
}
```
Старт по произвольному сигналу — как пишет Designer (`BL7` `1129e72f-0e8c-445a-b2ea-463517e86395`):
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaStartSignalEvent",
  "UId": "<UId элемента>", "A2": "StartSignal1", "A3": "<UId процесса>", "A4": "<UId процесса>", "A5": "<UId пакета>",
  "IL2": "<UId дорожки>", "IL3": true, "BL3": "50;184", "BL7": "1129e72f-0e8c-445a-b2ea-463517e86395", "BL8": "<UId процесса>",
  "BN2": "31;31", "BO3": true,
  "FC1": [{"BL1": "BPMSoft.Core.Process.ProcessSchemaParameter", "UId": "<GUID>", "A2": "RecordId", "A3": "<UId процесса>", "A4": "<UId процесса>", "IL2": "<UId элемента>", "L1": "23018567-a13c-4320-8687-fd6f9e3699bd", "L8": {"GS5": "<UId процесса>"}}],
  "ED1": false,
  "DZ1": "TestSignalG2",
  "DZ5": 1,
  "DZ12": "{\"$type\":\"System.Collections.ObjectModel.Collection`1[[System.String, System.Private.CoreLib]], System.Private.CoreLib\",\"$values\":[]}",
  "DZ13": "null"
}
```
- `DZ1` — имя сигнала; `DZ2` («произвольный сигнал», по умолчанию `true`) и `DZ3` («сигнал объекта», по умолчанию `false`) Designer не пишет.
- **Опровергнуто**: стартовый сигнал с `FC1: []` загружается, но Designer не открывает его свойства — ошибка JS `Cannot read properties of undefined (reading 'name')` в `initParameters`. Выходной параметр `RecordId` в `FC1` обязателен (у сигнала объекта — `L8 {"GS1": 1, "GS2": ""}`, у произвольного Designer пишет `{"GS5": <UId процесса>}`).
- Ресурсы: `BaseElements.<Элемент>.Caption`, у стартового сигнала ещё `BaseElements.<Элемент>.Parameters.RecordId.Caption`.
- Общее правило: если Designer падает на свойствах элемента с ошибкой в `initParameters`/`initProperty`, у элемента не хватает стандартного параметра — сравни с элементом, сохранённым Designer.
- ✅ Произвольный сигнал не передаёт данные (подтверждено в CRM, 09.10.2026): у процесса, стартовавшего по сигналу, `RecordId` и одноимённые с бросающим процессом параметры пустые (`Guid.Empty`). Нужен Id записи — вызывай процесс подпроцессом или `ProcessExecutor.Execute` с параметрами, либо стартуй его сигналом объекта (у него `RecordId` заполнен).
