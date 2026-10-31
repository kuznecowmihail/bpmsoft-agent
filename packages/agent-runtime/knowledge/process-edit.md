# Процессы (ProcessSchemaManager) — рецепты создания/редактирования

Общая механика — см. `metadata-editing.md`. **Статус**: рецепты с ✅ проверены реальной записью в CRM; рецепты с 🧪 — пока выводы из чтения `processes.md`, сначала проверь их на тестовом процессе.

**Рецепты процессов разбиты на файлы**: здесь — проверка перед сдачей, создание процесса, настройки, параметры, выключение и удаление; элементы работы с данными — `process-data-edit.md`; шлюзы, сигналы, таймеры, методы и подпроцессы — `process-flow-edit.md`; страницы — `process-pages-edit.md`; задачи пользователю — `process-activity-edit.md`; связать объект, email и веб-сервис — `process-tasks-edit.md`; свои действия — `user-task-edit.md`; запуск и статусы — `process-run-edit.md`; факты о страницах UserTask — `process-user-pages.md`.

## ⚠️ Проверка перед сдачей процесса
Пройди по списку после записи процесса и до ответа пользователю. Каждый пункт — ошибка, которая уже ломала процессы при проверке в CRM.

**Автоматическая проверка — обязательна после каждой записи или правки процесса**: `node <каталог знаний>/scripts/check-process.js <Pkg>/<Пакет>/Schemas/<Процесс>` (можно передать папку пакета — проверятся все процессы). Скрипт только читает файлы. Строки «ОШИБКА» — процесс сломается при обновлении, в Designer или при запуске: исправь и запусти снова, пока ошибок не останется. Строки «ВНИМАНИЕ» — оцени и, если не исправляешь, упомяни в ответе пользователю. Пункты 1–9 ниже скрипт проверяет почти все, кроме логики процесса; процесс событий объекта (`EG1`) он не проверяет.
1. Координаты `BL3`, `CI11`, `CI12` — только целые числа. Дробное значение в `BL3` даёт при «Обновить из файловой системы» ту же `FormatException: The input string '' was not in a correct format`, что и в `CI11`/`CI12` (✅); в ответе указана только схема, не поле. В журнале `PackagesSynchronization.log` это исключение идёт из `ConvertUtilities.StringToPoint` — по этому имени видно, что виновата координата (✅).
2. Каждая связь стоит в `BK4` после обеих своих фигур; `CI1`/`CI2` указывают на существующие элементы; `CI11`/`CI12` лежат на краях этих фигур. После переподключения связи пересчитай оба конца.
3. У «Читать данные» для каждой колонки из `ResultCompositeObjectList` есть подпись `BaseElements.<Элемент>.Parameters.ResultCompositeObjectList.<Колонка>.Caption` в обоих языках.
4. В фильтрах ссылка на параметр процесса — объект `{"value": "[IsOwnerSchema:false]…"}` в обеих строках: и для Designer, и для выполнения (`dataSourceFilters`).
5. Заголовок экземпляра `BK37` — ровно `[#[PropertyValue:Caption]#]`.
6. Задание-сценарий не обращается к элементам процесса по имени: значения элементов берёт из параметров процесса через `Get<T>`. ✅ Строковый путь `Get<T>("<Элемент>.<Параметр>")` (не C#-переменная) работает для параметров элемента «Вызвать веб-сервис» (подтверждено в CRM) — см. `web-service.md`. Передача значений между заданиями через `Set`/`Get` — `process-flow-edit.md`, «Методы процесса».
7. Проверка «запись найдена» — по `ResultCount` элемента в режиме Count, а не в режиме «первая запись».
8. Процесс, который запускается через `ProcessExecutor.Execute`, имеет простой старт. Данные в другой процесс передаются параметрами запуска или подпроцессом, а не через произвольный сигнал. Запуск — `process-run-edit.md`, «Запуск процесса с клиента и из C#».
9. `ModifiedOnUtc` в `descriptor.json` обновлён; `descriptor.json` и ресурсы после правки перечитаны и не испорчены.

## ✅ Создать процесс с нуля (Старт → Задание-сценарий → Завершение)
**Подтверждено**: процесс написан полностью вручную по шаблону ниже. После «Обновить из файловой системы» и компиляции он открылся в Designer: три элемента со стрелками, подпись задания, код скрипта на месте. Запуск создал запись в `TestProcEntity`.

**Формат**: у процессов `metadata.json` — плоский JSON (формат B почти у всех процессов), не diff-журнал. Правка = переписать нужное место JSON. Удобнее всего генерировать файл node-скриптом через `JSON.stringify(obj, null, 2)`: так код `CH1` корректно экранируется (кавычки, переводы строк).

**Файлы** (`Pkg/<Пакет>/`):
1. `Schemas/<Имя>/descriptor.json` — без `Parent`, `ManagerName: "ProcessSchemaManager"`:
```json
{
  "Descriptor": {
    "UId": "6d937531-7ea2-4cd9-9902-00eab08487a8",
    "Name": "TestProcStep1",
    "ModifiedOnUtc": "\/Date(1790677911000)\/",
    "ManagerName": "ProcessSchemaManager",
    "Caption": "Test шаг 1: процесс с нуля",
    "DependsOn": []
  }
}
```
2. `Schemas/<Имя>/properties.json` — `Tag` дублирует `BK18`, `Version` дублирует `IJ9` (сверено по всем процессам проекта):
```json
{
  "Properties": {
    "CreatedInVersion": "<версия платформы>",
    "IsActiveVersion": "True",
    "IsCreatedInSvg": "True",
    "IsInterpretable": "True",
    "IsTracing": "False",
    "Tag": "Business Process",
    "UseForceCompile": "False",
    "Version": "0"
  }
}
```
3. `Schemas/<Имя>/metadata.json` — `.cs`-файла у процесса нет, код задания-сценария хранится строкой в `CH1`:
```json
{
  "MetaData": {
    "Schema": {
      "ManagerName": "ProcessSchemaManager",
      "UId": "6d937531-7ea2-4cd9-9902-00eab08487a8",
      "A2": "TestProcStep1",
      "A5": "871419a5-d65e-49e5-8b2f-469a6a928280",
      "B1": [],
      "B2": [],
      "B3": [],
      "B6": "<UId пакета>",
      "B8": "<версия платформы>",
      "FJ1": [],
      "IJ1": true,
      "BK8": "bb4d6607-026b-4b27-b640-8f5c77c1e89d",
      "IJ10": true,
      "BK15": [],
      "BK37": {
        "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
        "UId": "cdd58be7-2dba-4a5e-869b-1ad5d6d7513a",
        "A2": "NotificationCaption",
        "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
        "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
        "L1": "8b3f29bb-ea14-4ce5-a5c5-293a929b6ba2",
        "L8": {
          "GS1": 3,
          "GS2": "[#[PropertyValue:Caption]#]"
        }
      },
      "BK1": "FFFFFFFF",
      "BK2": "FFBBBBBB",
      "BK3": [
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaLaneSet",
          "UId": "9a995bc4-1b26-4c2b-9226-3f264654268f",
          "A2": "LaneSet1",
          "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A5": "<UId пакета>",
          "BL7": "11a47caf-a0d5-41fa-a274-a0b11f77447a",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "BM4": [
            {
              "BL1": "BPMSoft.Core.Process.ProcessSchemaLane",
              "UId": "be0c6c8e-0bdd-4407-aafa-9c89e560ed57",
              "A2": "Lane1",
              "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
              "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
              "A5": "<UId пакета>",
              "IL2": "9a995bc4-1b26-4c2b-9226-3f264654268f",
              "BL7": "abcd74b9-5912-414b-82ac-f1aa4dcd554e",
              "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
              "CD1": [],
              "CD2": [],
              "CD4": "9a995bc4-1b26-4c2b-9226-3f264654268f",
              "CD7": []
            }
          ]
        }
      ],
      "BK5": [],
      "BK4": [
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaStartEvent",
          "UId": "8c0f3ab4-c0a4-4935-80e6-06d9d18739db",
          "A2": "StartEvent1",
          "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A5": "<UId пакета>",
          "IL2": "be0c6c8e-0bdd-4407-aafa-9c89e560ed57",
          "BL3": "50;184",
          "BL7": "53818048-7868-48f6-ada0-0ebaa65af628",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "BN2": "31;31",
          "BO3": true,
          "FC1": []
        },
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaScriptTask",
          "UId": "87ab14ef-ca7d-489f-874a-25cdac432e14",
          "A2": "ScriptTask1",
          "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A5": "<UId пакета>",
          "IL2": "be0c6c8e-0bdd-4407-aafa-9c89e560ed57",
          "BL3": "200;172",
          "BL7": "0e490dda-e140-4441-b600-6f5c64d024df",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "BN2": "69;55",
          "BO3": true,
          "BP2": [],
          "CL2": "FFFFFFFF",
          "CH1": "var entity = UserConnection.EntitySchemaManager.GetInstanceByName(\"TestProcEntity\").CreateEntity(UserConnection);\nentity.SetDefColumnValues();\nentity.SetColumnValue(\"Name\", \"Шаг 1: \" + DateTime.Now.ToString(\"dd.MM.yyyy HH:mm:ss\"));\nentity.SetColumnValue(\"Sum\", 1m);\nentity.Save();\nreturn true;",
          "CH2": true
        },
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaTerminateEvent",
          "UId": "a3c93b8a-9cd7-4d2f-8152-a1c384d37f0e",
          "A2": "TerminateEvent1",
          "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A5": "<UId пакета>",
          "IL2": "be0c6c8e-0bdd-4407-aafa-9c89e560ed57",
          "BL3": "400;184",
          "BL7": "1bd93619-0574-454e-bb4e-cf53b9eb9470",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "BN2": "31;31",
          "BO3": true,
          "FC1": []
        },
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaSequenceFlow",
          "UId": "8a6ff7b0-e87a-4dd6-b78c-591f78b1897f",
          "A2": "SequenceFlow1",
          "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A5": "<UId пакета>",
          "BL7": "0d8351f6-c2f4-4737-bdd9-6fbfe0837fec",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "CI1": "8c0f3ab4-c0a4-4935-80e6-06d9d18739db",
          "CI2": "87ab14ef-ca7d-489f-874a-25cdac432e14",
          "CI3": "null",
          "CI5": "FF939598",
          "CI6": 1,
          "CI11": "81;200",
          "CI12": "200;200"
        },
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaSequenceFlow",
          "UId": "ee4b2860-b139-45d4-a646-2f71db896024",
          "A2": "SequenceFlow2",
          "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "A5": "<UId пакета>",
          "BL7": "0d8351f6-c2f4-4737-bdd9-6fbfe0837fec",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "CI1": "87ab14ef-ca7d-489f-874a-25cdac432e14",
          "CI2": "a3c93b8a-9cd7-4d2f-8152-a1c384d37f0e",
          "CI3": "null",
          "CI5": "FF939598",
          "CI6": 1,
          "CI11": "269;200",
          "CI12": "400;200"
        }
      ],
      "BK9": [],
      "BK18": "Business Process",
      "BK29": true,
      "BK30": true,
      "BK34": "ru-RU",
      "Labels": [],
      "BK24": []
    }
  }
}
```
4. `Resources/<Имя>.Process/resource.ru-RU.xml` и `resource.en-US.xml` (в en-US — английские подписи, `NotificationCaption.DisplayValue` = `[#Process name#]`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<Resources Culture="ru-RU">
	<Group Type="String">
		<Items>
			<Item Name="BaseElements.ScriptTask1.Caption" Value="Создать запись" />
			<Item Name="Caption" Value="Test шаг 1: процесс с нуля" />
			<Item Name="LaneSets.LaneSet1.Caption" Value="LaneSet 1" />
			<Item Name="LaneSets.LaneSet1.Lanes.Lane1.Caption" Value="Lane 1" />
			<Item Name="NotificationCaption.Caption" Value="Заголовок экземпляра процесса" />
			<Item Name="NotificationCaption.DisplayValue" Value="[#Название процесса#]" />
		</Items>
	</Group>
</Resources>
```

**Что заменить:**
| Значение в шаблоне | Что это | Чем заменить |
|---|---|---|
| `6d937531-...` | UId процесса: `UId`, `A3`/`A4` всех элементов и параметров, `BL8` всех элементов | новый GUID, везде одинаковый |
| `TestProcStep1` | имя (`A2`, `Name`) | своё |
| `871419a5-...` | `A5` схемы (ревизия) | новый GUID |
| `<UId пакета>` | `B6` и `A5` всех элементов = UId пакета | UId своего пакета |
| `9a995bc4-...` / `be0c6c8e-...` | `LaneSet` / `Lane`; у Lane `IL2` и `CD4` = UId LaneSet; `IL2` каждого элемента = UId Lane | новые GUID |
| UId элементов и связей | `CI1`/`CI2` связи = UId источника/цели | новые GUID, ссылки согласованно |
| `CH1` | C#-код задания-сценария; `using` по умолчанию уже есть (`BPMSoft.Core`, `BPMSoft.Core.Entities`, `BPMSoft.Core.DB`, `System`, `System.Linq` нет — см. `B3`) | свой код, последняя строка `return true;` |
| `BL3` / `CI11`/`CI12` | координаты фигур и точек привязки связей | любые разумные, но согласованные: Designer рисует линию по `CI11`/`CI12` и сам её НЕ пересчитывает — ставь `CI11` на правый край фигуры-источника (`x` из `BL3` + ширина из `BN2`, `y` + половина высоты), `CI12` на левый край фигуры-цели. ❌ «Геометрию связей Designer пересчитает сам» — неверно: после переподключения потока `CI2` на другую фигуру без правки `CI12` линия ушла в пустоту, хотя процесс выполнялся по `CI1`/`CI2`. ✅ Только целые числа: дробное `71;199.5` в `CI11`/`CI12` даёт при «Обновить из файловой системы» `FormatException: The input string '' was not in a correct format` (подтверждено журналом CRM) |

**Не менять** (константы платформы, одинаковы во всех процессах проекта): `BL7` элементов — StartEvent `53818048-7868-48f6-ada0-0ebaa65af628`, ScriptTask `0e490dda-e140-4441-b600-6f5c64d024df`, TerminateEvent `1bd93619-0574-454e-bb4e-cf53b9eb9470`, SequenceFlow `0d8351f6-c2f4-4737-bdd9-6fbfe0837fec`, LaneSet `11a47caf-a0d5-41fa-a274-a0b11f77447a`, Lane `abcd74b9-5912-414b-82ac-f1aa4dcd554e`; `BK8` `bb4d6607-026b-4b27-b640-8f5c77c1e89d` (у большинства процессов); `BK37` целиком, включая его UId `cdd58be7-2dba-4a5e-869b-1ad5d6d7513a` (одинаков во всех процессах); `BO3: true` на узлах и его отсутствие на связях; `CI5`, `CI6`, `BN2`, `CL2`, `CH2`. В другом проекте сверь `BL7` по существующему элементу того же типа перед копированием.

**После «Обновить из файловой системы»** процесс с заданием-сценарием нужно скомпилировать: код `CH1` попадает в класс `<Имя>MethodsWrapper` в `Autogenerated/Src/<Имя>.<Пакет>.cs`. Этот класс лежит в `namespace BPMSoft.Core.Process`, а классы пакета — в `BPMSoft.Configuration`: вызывай их полным именем `BPMSoft.Configuration.<Класс>` или добавь `BPMSoft.Configuration` в `B3` (см. `process-flow-edit.md`, «Методы процесса (`BK32`), `using` (`B3`)»), иначе компиляция падает с CS0246 (✅ подтверждено компиляцией).

## ✅ Настройки процесса (поля верхнего уровня)
**Подтверждено**: поля ниже изменены в файлах, после «Обновить из файловой системы» Designer показал ровно эти значения на вкладке «Настройки». Смысл полей и значения по умолчанию — из `metadata-codes.md` (класс `BaseProcessSchema`, `ProcessSchema`).

| Настройка в Designer | `metadata.json` | `properties.json` | Как записать |
|---|---|---|---|
| Название процесса | — (ресурс `Caption`) | — | `Caption` в `resource.ru-RU.xml`/`en-US.xml` и `Caption` в `descriptor.json` |
| Тег | `BK18` | `Tag` | строка, в обоих файлах одинаково |
| Версия | `IJ9` | `Version` | число; `"Version"` — строкой; 0 = поля `IJ9` нет |
| Максимальное число повторений | `IJ2` | — | число; по умолчанию 100 (поля нет) |
| Сериализировать в БД | `IJ1` | — | включено = `"IJ1": true`; выключено = удалить поле |
| Использовать системный контекст безопасности | `IJ10` | — | включено = `"IJ10": true`; выключено = удалить поле |
| Журналировать | `IJ3` | — | по умолчанию включено (поля нет); выключено = `"IJ3": false` |
| Актуальная версия | `IJ7` | `IsActiveVersion` | по умолчанию true, не трогай |

Правило: платформа не пишет в файл значение по умолчанию. Чтобы вернуть настройку к умолчанию, удали поле, а не пиши дефолтное значение.

⚠️ Заголовок экземпляра процесса (`BK37`, параметр `NotificationCaption`) — ровно `[#[PropertyValue:Caption]#]`, с внутренними квадратными скобками. ❌ Запись `[#PropertyValue:Caption#]` даёт при запуске «Процесс не может работать с текущими настройками … Expression expected (at index 0)» (✅ подтверждено в CRM).

✅ Правка существующего процесса: изменённый в том же шаге код `CH1` после «Обновить из файловой системы» и компиляции выполнился (запуск создал запись «Шаг 2: …»).

## ✅ Параметры процесса (`FJ1`)
**Подтверждено**: параметры разных типов, написанные вручную, показались на вкладке «Параметры» с правильными типами, направлениями, обязательностью и значениями. Запуск процесса: задание-сценарий прочитал все значения по умолчанию и записал их в объект (текст, 42, 123.45, текущие дата-время, true, контакт текущего пользователя).

**Поля параметра** (класс `ProcessSchemaParameter` в `metadata-codes.md`):
- `L1` — тип данных (тот же каталог GUID, что `S2` у колонок объекта). Для справочника дополнительно `L9` = UId целевого объекта.
- `L12` — направление: `0` = входящий (в Designer зелёная стрелка →), `1` = исходящий (красная ←), поля нет = переменная (обе стрелки).
- `L6: true` — обязательный (в Designer звёздочка). `L13: true` — результат (IsResult) у элементов (`ResultEntity` и др.). В параметрах процесса дизайнер `L13` не пишет: ✅ подтверждено записью в CRM, в форме параметра нет поля «Результат» (есть «Название», «Код», «Тип данных», «Направление», «Значение»). Направление в дизайнере: «Входящий», «Исходящий», «Двунаправленный»; «Исходящий» пишет `L12: 1`.
- `L8` — значение: `GS5` = UId процесса (пиши всегда); `GS1` — источник значения (`1` константа, `3` формула/макрос); `GS2` — само значение.

**Как записать значение по умолчанию:**
| Что | `L8` | Ресурсы |
|---|---|---|
| Число, деньги, дробное | `{"GS1": 1, "GS2": "42"}`, `"123.45"` — через точку | — |
| Текст (строковые типы) | `{"GS1": 1}` — БЕЗ `GS2` | `Parameters.<Имя>.Value` и `.DisplayValue` = текст, в обеих локалях |
| Логическое | `{"GS1": 3, "GS2": "[#BooleanValue.True#]"}` (или `False`) | `DisplayValue`: `[#Логическое значение.Да#]` / `[#Boolean value.True#]` |
| Текущие дата и время | `{"GS1": 3, "GS2": "[#SysVariable.CurrentDateTime#]"}` | `[#Системная переменная.Текущее значение даты и времени#]` / `[#System variable.Current Time and Date#]` |
| Контакт текущего пользователя | `{"GS1": 3, "GS2": "[#SysVariable.CurrentUserContact#]"}` | `[#Системная переменная.Контакт текущего пользователя#]` / `[#System variable.Current user contact#]` |
| Без значения | `{}` (только `GS5`) | — |

✅ Ещё макросы (все сработали при запуске, Designer сам показал читаемые подписи — `DisplayValue` в ресурсах для макросов не обязателен), формат тот же `{"GS1": 3, "GS2": "<макрос>", "GS5": <UId процесса>}`:
| Макрос | Тип параметра (`L1`) | Что вернул |
|---|---|---|
| `[#SysVariable.CurrentDate#]` | дата `603d4960-a1a2-45e9-b232-206a54421b01` | текущая дата |
| `[#SysVariable.CurrentTime#]` | время `04cc757b-8f06-482c-8a1a-0c0e171d2410` | текущее время пользователя (16:10 при UTC 13:10 в логах) |
| `[#SysVariable.CurrentUser#]` | справочник `b295071f-…`, `L9` = `SysAdminUnit` `84f44b9a-4bc3-4cbf-a1a8-cec02c1c029c` | Id пользователя (`SysAdminUnit`) |
| `[#SysSettings.<Код><Тип>#]`, например `[#SysSettings.TestSrcSetting<String>#]` | тип по настройке (`<String>`, `<Int32>`, `<Boolean>`, `<Guid>`) | значение системной настройки |
| `[#Lookup.<UId объекта>.<Id записи>#]` | справочник, `L9` = UId объекта | Id записи (константа-запись справочника) |

**Ресурсы параметра**: `Parameters.<Имя>.Caption` — подпись (обязательно в обеих локалях), `Parameters.<Имя>.Value` — значение текстовой константы, `Parameters.<Имя>.DisplayValue` — читаемый вид значения, который показывает Designer.

**Доступ из задания-сценария**: `Get<string>("PText")`, `Get<int>(...)`, `Get<decimal>(...)`, `Get<DateTime>(...)`, `Get<bool>(...)`, для справочника `Get<Guid>(...)`; запись — `Set("POut", значение)`.

**Шаблон** (`FJ1` процесса `TestProcParams`; UId процесса в `A3`/`A4`/`GS5` замени на свой, UId параметров — новые GUID):
```json
[
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "f0df1939-e3ff-4367-b482-7d356f4a2c2d",
    "A2": "PText",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
    "L8": {
      "GS1": 1,
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    },
    "L6": true,
    "L12": 0
  },
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "b16e3f4c-f8b2-490e-800c-9cfdb4e2af1a",
    "A2": "PInt",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
    "L8": {
      "GS1": 1,
      "GS2": "42",
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    },
    "L12": 0
  },
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "1254698c-e52b-4ffa-b13a-bfbf698534f2",
    "A2": "PMoney",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "969093e2-2b4e-463b-883a-3d3b8c61f0cd",
    "L8": {
      "GS1": 1,
      "GS2": "123.45",
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    }
  },
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "8c5dd08e-2564-4f51-8ff8-7523e15386a4",
    "A2": "PDate",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "d21e9ef4-c064-4012-b286-fa1a8171da44",
    "L8": {
      "GS1": 3,
      "GS2": "[#SysVariable.CurrentDateTime#]",
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    }
  },
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "8967a0ce-43a0-4539-b526-209770847cc5",
    "A2": "PFlag",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "90b65bf8-0ffc-4141-8779-2420877af907",
    "L8": {
      "GS1": 3,
      "GS2": "[#BooleanValue.True#]",
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    }
  },
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "553f189d-f5f6-4244-92b7-3f376189d527",
    "A2": "PContact",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "b295071f-7ea9-4e62-8d1a-919bf3732ff2",
    "L8": {
      "GS1": 3,
      "GS2": "[#SysVariable.CurrentUserContact#]",
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    },
    "L9": "16be3651-8fe2-4159-8dd0-a803d4683dd3"
  },
  {
    "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
    "UId": "4f6e0a8e-a033-45f6-9a00-9bc3ec9f9bd9",
    "A2": "POut",
    "A3": "5466064d-1a54-446c-b345-9210a8f8134a",
    "A4": "5466064d-1a54-446c-b345-9210a8f8134a",
    "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
    "L8": {
      "GS5": "5466064d-1a54-446c-b345-9210a8f8134a"
    },
    "L12": 1
  }
]
```
Ресурсы параметров (ru-RU):
```xml
<Item Name="Parameters.PContact.Caption" Value="Контакт" />
<Item Name="Parameters.PContact.DisplayValue" Value="[#Системная переменная.Контакт текущего пользователя#]" />
<Item Name="Parameters.PDate.Caption" Value="Дата" />
<Item Name="Parameters.PDate.DisplayValue" Value="[#Системная переменная.Текущее значение даты и времени#]" />
<Item Name="Parameters.PFlag.Caption" Value="Признак" />
<Item Name="Parameters.PFlag.DisplayValue" Value="[#Логическое значение.Да#]" />
<Item Name="Parameters.PInt.Caption" Value="Целое" />
<Item Name="Parameters.PInt.DisplayValue" Value="42" />
<Item Name="Parameters.PMoney.Caption" Value="Деньги" />
<Item Name="Parameters.PMoney.DisplayValue" Value="123.45" />
<Item Name="Parameters.POut.Caption" Value="Результат" />
<Item Name="Parameters.PText.Caption" Value="Текст" />
<Item Name="Parameters.PText.DisplayValue" Value="Привет из параметра" />
<Item Name="Parameters.PText.Value" Value="Привет из параметра" />
```

## ✅ Выключить (деактивировать) процесс
❌ Поле `BK36` (`Enabled`) в `metadata.json` процесс не выключает — это вычисляемое свойство (`ProcessSchema.Enabled => GetIsProcessEnabled(Id)`): платформа пишет его при сохранении, но при загрузке не читает. Проверено: `"BK36": false` в файле — галочка «Активен» осталась, таймерный процесс продолжал запускаться.

Состояние «Активен» хранится в таблице `SysProcessDisabled` (строка с `SysSchemaId` = процесс выключен; `BaseProcessSchemaSettingsHelper`). Способы:
1. UI: «Деактивировать» в библиотеке процессов.
2. SQL-скрипт пакета: вставить строку в `SysProcessDisabled` и удалить задания Quartz процесса (`qrtz_triggers`/`qrtz_job_details` с `sched_name = 'BPMCRMQuartzScheduler'` и `job_group` = UId процесса) — готовый ✅ скрипт в `sql-script-edit.md`. В проекте для этого может быть своя SQL-функция — поищи в `Pkg/*/SqlScripts` по `SysProcessDisabled`. ⚠️ Деактивируй только родительский процесс, не подпроцессы: иначе, по предположению, ломается раздел «Библиотека процессов» (🧪 не проверено).
3. Привязка данных `SysProcessDisabled` — не переносима (`SysSchemaId` у каждого стенда свой).
Задания планировщика таймерного процесса ищи по `job_group` = UId процесса, а не по `job_name`.

## ✅ Удалить процесс
**Подтверждено**: удалены папки `Schemas/<Имя>/` и `Resources/<Имя>.Process/`, после «Обновить из файловой системы» процессы пропали (статус «Удалено» в окне «Изменения», ошибок нет). Общий рецепт и проверка зависимостей — `entity-edit.md`, «Удалить объект (схему) целиком». Для процесса перед удалением дополнительно ищи по всему `Pkg` его UId и имя: вызов подпроцессом (`CK4`), запуск с клиента (`sysProcessName: "<Имя>"`), запуск из C# (`ProcessExecutor.Execute("<Имя>", ...)`), строку в SQL-скриптах.

## Дорожки (`BK3`) — в этом Designer не поддерживаются
**Проверено**: вторая дорожка, добавленная в `BK3[0].BM4` (копия первой с новым UId и `A2`), принимается, элементы с `IL2` на неё выполняются, но на холсте полос дорожек нет — и в панели элементов Designer стенда нет «Пула»/«Дорожки». У всех процессов проекта ровно одна служебная дорожка. Правило: держи одну дорожку как в шаблоне процесса; `IL2` всех элементов = UId этой дорожки.

