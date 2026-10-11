# Процессы (ProcessSchemaManager) — рецепты создания/редактирования

Общая механика — см. `metadata-editing.md`. **Статус**: рецепты с ✅ проверены реальной записью в CRM; рецепты с 🧪 — пока выводы из чтения `processes.md`, сначала проверь их на тестовом процессе.

**Не забывай про 2 обязательных правила из `metadata-editing.md`: (1) обе локали `ru-RU`+`en-US` для ресурсов, (2) актуальный `ModifiedOnUtc` при каждом изменении `descriptor.json`.**

## ⚠️ Проверка перед сдачей процесса
Пройди по списку после записи процесса и до ответа пользователю. Каждый пункт — ошибка, которая уже ломала процессы при проверке в CRM.

**Автоматическая проверка — обязательна после каждой записи или правки процесса**: `node <каталог знаний>/scripts/check-process.js <Pkg>/<Пакет>/Schemas/<Процесс>` (можно передать папку пакета — проверятся все процессы). Скрипт только читает файлы. Строки «ОШИБКА» — процесс сломается при обновлении, в Designer или при запуске: исправь и запусти снова, пока ошибок не останется. Строки «ВНИМАНИЕ» — оцени и, если не исправляешь, упомяни в ответе пользователю. Пункты 1–9 ниже скрипт проверяет почти все, кроме логики процесса; процесс событий объекта (`EG1`) он не проверяет.
1. Координаты `BL3`, `CI11`, `CI12` — только целые числа.
2. Каждая связь стоит в `BK4` после обеих своих фигур; `CI1`/`CI2` указывают на существующие элементы; `CI11`/`CI12` лежат на краях этих фигур. После переподключения связи пересчитай оба конца.
3. У «Читать данные» для каждой колонки из `ResultCompositeObjectList` есть подпись `BaseElements.<Элемент>.Parameters.ResultCompositeObjectList.<Колонка>.Caption` в обоих языках.
4. В фильтрах ссылка на параметр процесса — объект `{"value": "[IsOwnerSchema:false]…"}` в обеих строках: и для Designer, и для выполнения (`dataSourceFilters`).
5. Заголовок экземпляра `BK37` — ровно `[#[PropertyValue:Caption]#]`.
6. Задание-сценарий не обращается к элементам процесса по имени: значения элементов берёт из параметров процесса через `Get<T>`.
7. Проверка «запись найдена» — по `ResultCount` элемента в режиме Count, а не в режиме «первая запись».
8. Процесс, который запускается через `ProcessExecutor.Execute`, имеет простой старт. Данные в другой процесс передаются параметрами запуска или подпроцессом, а не через произвольный сигнал.
9. `ModifiedOnUtc` в `descriptor.json` обновлён; `descriptor.json` и ресурсы после правки перечитаны и не испорчены.

## ✅ Создать процесс с нуля (Старт → Задание-сценарий → Завершение)
**Подтверждено 29.09.2026**: процесс `TestProcStep1` написан полностью вручную по шаблону ниже. После «Обновить из файловой системы» и компиляции он открылся в Designer: три элемента со стрелками, подпись задания, код скрипта на месте. Запуск создал запись в `TestProcEntity`.

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
    "CreatedInVersion": "7.18.5.1500",
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
      "B6": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
      "B8": "7.18.5.1500",
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
          "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
          "BL7": "11a47caf-a0d5-41fa-a274-a0b11f77447a",
          "BL8": "6d937531-7ea2-4cd9-9902-00eab08487a8",
          "BM4": [
            {
              "BL1": "BPMSoft.Core.Process.ProcessSchemaLane",
              "UId": "be0c6c8e-0bdd-4407-aafa-9c89e560ed57",
              "A2": "Lane1",
              "A3": "6d937531-7ea2-4cd9-9902-00eab08487a8",
              "A4": "6d937531-7ea2-4cd9-9902-00eab08487a8",
              "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
          "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
          "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
          "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
          "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
          "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
| `266d6d8e-...` | `B6` и `A5` всех элементов = UId пакета | UId своего пакета |
| `9a995bc4-...` / `be0c6c8e-...` | `LaneSet` / `Lane`; у Lane `IL2` и `CD4` = UId LaneSet; `IL2` каждого элемента = UId Lane | новые GUID |
| UId элементов и связей | `CI1`/`CI2` связи = UId источника/цели | новые GUID, ссылки согласованно |
| `CH1` | C#-код задания-сценария; `using` по умолчанию уже есть (`BPMSoft.Core`, `BPMSoft.Core.Entities`, `BPMSoft.Core.DB`, `System`, `System.Linq` нет — см. `B3`) | свой код, последняя строка `return true;` |
| `BL3` / `CI11`/`CI12` | координаты фигур и точек привязки связей | любые разумные, но согласованные: Designer рисует линию по `CI11`/`CI12` и сам её НЕ пересчитывает — ставь `CI11` на правый край фигуры-источника (`x` из `BL3` + ширина из `BN2`, `y` + половина высоты), `CI12` на левый край фигуры-цели. Опровергнуто (шаг 20, 03.10.2026): «геометрию связей пересчитает сам» — после переподключения потока `CI2` на другую фигуру без правки `CI12` линия ушла в пустоту, хотя процесс выполнялся по `CI1`/`CI2`. ✅ Только целые числа (09.10.2026): дробное `71;199.5` в `CI11`/`CI12` даёт при «Обновить из файловой системы» `FormatException: The input string '' was not in a correct format` (подтверждено журналом CRM) |

**Не менять** (константы платформы, одинаковы во всех процессах проекта): `BL7` элементов — StartEvent `53818048-7868-48f6-ada0-0ebaa65af628`, ScriptTask `0e490dda-e140-4441-b600-6f5c64d024df`, TerminateEvent `1bd93619-0574-454e-bb4e-cf53b9eb9470`, SequenceFlow `0d8351f6-c2f4-4737-bdd9-6fbfe0837fec`, LaneSet `11a47caf-a0d5-41fa-a274-a0b11f77447a`, Lane `abcd74b9-5912-414b-82ac-f1aa4dcd554e`; `BK8` `bb4d6607-026b-4b27-b640-8f5c77c1e89d` (у 401 из 410 процессов); `BK37` целиком, включая его UId `cdd58be7-2dba-4a5e-869b-1ad5d6d7513a` (одинаков во всех процессах); `BO3: true` на узлах и его отсутствие на связях; `CI5`, `CI6`, `BN2`, `CL2`, `CH2`.

**После «Обновить из файловой системы»** процесс с заданием-сценарием нужно скомпилировать: код `CH1` попадает в класс `<Имя>MethodsWrapper` в `Autogenerated/Src/<Имя>.<Пакет>.cs`.

## ✅ Настройки процесса (поля верхнего уровня)
**Подтверждено 29.09.2026** на `TestProcStep1`: поля ниже изменены в файлах, после «Обновить из файловой системы» Designer показал ровно эти значения на вкладке «Настройки». Смысл полей и значения по умолчанию — из `metadata-codes.md` (класс `BaseProcessSchema`, `ProcessSchema`).

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

⚠️ Заголовок экземпляра процесса (`BK37`, параметр `NotificationCaption`) — ровно `[#[PropertyValue:Caption]#]`, с внутренними квадратными скобками. ❌ Запись `[#PropertyValue:Caption#]` даёт при запуске «Процесс не может работать с текущими настройками … Expression expected (at index 0)» (✅ подтверждено в CRM, 09.10.2026).

✅ Правка существующего процесса: изменённый в том же шаге код `CH1` после «Обновить из файловой системы» и компиляции выполнился (запуск создал запись «Шаг 2: …»).

## ✅ Параметры процесса (`FJ1`)
**Подтверждено 29.09.2026** на `TestProcParams`: 7 параметров разных типов, написанных вручную, показались на вкладке «Параметры» с правильными типами, направлениями, обязательностью и значениями. Запуск процесса: задание-сценарий прочитал все значения по умолчанию и записал их в объект (текст, 42, 123.45, текущие дата-время, true, контакт текущего пользователя).

**Поля параметра** (класс `ProcessSchemaParameter` в `metadata-codes.md`):
- `L1` — тип данных (тот же каталог GUID, что `S2` у колонок объекта). Для справочника дополнительно `L9` = UId целевого объекта.
- `L12` — направление: `0` = входящий (в Designer зелёная стрелка →), `1` = исходящий (красная ←), поля нет = переменная (обе стрелки).
- `L6: true` — обязательный (в Designer звёздочка). `L13: true` — результат (IsResult), не проверено.
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

✅ Ещё макросы (05.10.2026, `TestProcMacros`: все сработали при запуске, Designer сам показал читаемые подписи — `DisplayValue` в ресурсах для макросов не обязателен), формат тот же `{"GS1": 3, "GS2": "<макрос>", "GS5": <UId процесса>}`:
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

## ✅ Элемент «Читать данные» (ReadDataUserTask) — первая запись по фильтру
**Шаблон**: `templates/process/read-data.json` — элемент, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`). Бери его, если в проекте нет своего элемента с тем же `J6`.
**Подтверждено 29.09.2026** на `TestProcRead`: элемент, собранный в файле, прочитал первую запись `TestProcEntity` по фильтру «Количество = 42», формулы передали её колонки в параметры процесса, скрипт создал запись с прочитанными значениями. Логика действия — `[app]/BPMSoft.Configuration/Autogenerated/Src/ReadDataUserTask.ProcessDesigner.cs`.

**Способ**: не собирай элемент с нуля, а клонируй реальный. Образец — любой элемент проекта с `J6` = `cb455b6f-78ff-4b1e-b241-c2bbc0b37e9f` (поиск: `rg -l cb455b6f-78ff-4b1e-b241-c2bbc0b37e9f Pkg`; если таких нет — попроси пользователя собрать элемент в Designer и сохранить процесс): сам элемент из `BK4`, все его маппинги из `BK15` (у которых `GT2` содержит UId элемента) и его строки ресурсов `BaseElements.<Имя элемента>.Parameters.*` (обе локали). При клонировании замени во всём тексте:
- UId процесса-источника → UId своего процесса (это `BL8`, `A3`/`A4` маппингов, `GS5` в значениях);
- UId элемента → новый; `IL2` элемента → UId своей дорожки;
- UId каждого из 20 параметров `BP2` → новые GUID (они же в `GT2`/`GT3` маппингов); UId маппингов → новые.
- Не меняй: `BL7` = `J6` = `cb455b6f-78ff-4b1e-b241-c2bbc0b37e9f` (схема действия ReadDataUserTask), `A3`/`A4` параметров `BP2` (= та же `cb455b6f-...`), `GT4` = `cb455b6f-...`, `GT5` (таблица ниже), `GS5: "cb455b6f-..."` у параметров, значение которых не менялось.

**Маппинг обязателен для каждого параметра `BP2`**, его `GT1` дублирует значение `L8` параметра (одинаковый `GS2`). Пример (параметр `OrderInfo`):
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaMapping",
  "UId": "bf35e167-00e5-46b7-a18f-dc8e542631f7",
  "A2": "ReadDataUserTask1",
  "A3": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "A4": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "GT2": "[Element:{98b3be31-3498-4889-b6e4-a331d8e12b07}].[Parameter:{9dd3b407-48d3-4cca-8945-5f2aad49b4cd}]",
  "GT3": "9dd3b407-48d3-4cca-8945-5f2aad49b4cd",
  "GT5": "473e79e2-727e-40a7-8829-7eefc576b403",
  "GT4": "cb455b6f-78ff-4b1e-b241-c2bbc0b37e9f",
  "GT1": {
    "GS1": 1,
    "GS2": "Name:1:1"
  }
}
```

**`GT5` — постоянный UId параметра в схеме действия** (одинаков у всех 983 элементов «Читать данные» проекта):
| Параметр | `GT5` | Тип `L1` |
|---|---|---|
| `DataSourceFilters` | `5d9ac9a7-7782-49ce-8990-dcb1c73832b0` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `ResultType` | `643e4d6d-7ec8-49f0-842a-066a996fbe8b` | `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` |
| `ReadSomeTopRecords` | `29115add-7520-4ad4-8371-d91f537ac913` | `90b65bf8-0ffc-4141-8779-2420877af907` |
| `NumberOfRecords` | `f29e5660-c5ef-4d84-8331-9046c3093519` | `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` |
| `FunctionType` | `94ba9876-18c1-4a68-bcef-08f7e7f0e25c` | `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` |
| `AggregationColumnName` | `cb5d6d26-7e81-4cbe-8730-8b7169000d14` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `OrderInfo` | `473e79e2-727e-40a7-8829-7eefc576b403` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `ResultEntity` | `e2fced10-4842-423e-ada0-523bf7ea8ad3` | `ebd85d37-0abf-4bbf-bb32-97dc3dffcc8c` |
| `ResultCount` | `2e63ea99-8125-4254-88bd-20d3610bd471` | `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` |
| `ResultIntegerFunction` | `a3660fce-a8f9-4a68-a3c1-b4f2f7983635` | `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` |
| `ResultFloatFunction` | `9a594933-75da-4304-b6a3-5945dba159e3` | `ff22e049-4d16-46ee-a529-92d8808932dc` |
| `ResultDateTimeFunction` | `11fb235f-c06a-4111-84cd-a5dbf9a440d5` | `d21e9ef4-c064-4012-b286-fa1a8171da44` |
| `ResultRowsCount` | `78252e95-b759-416a-9c48-c128fbdf59ef` | `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` |
| `CanReadUncommitedData` | `2f797429-6f43-4594-96bb-62fbc7b7deec` | `90b65bf8-0ffc-4141-8779-2420877af907` |
| `ResultEntityCollection` | `be4a0d16-6a15-41cf-ac44-a8b757565428` | `51fb23ba-3eb2-11e2-b7d5-b0c76188709b` |
| `EntityColumnMetaPathes` | `cc12005f-f434-4a40-b9d0-dc8f81755545` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `IgnoreDisplayValues` | `6dada847-859b-4e0a-9297-b3c9572530b6` | `90b65bf8-0ffc-4141-8779-2420877af907` |
| `ResultCompositeObjectList` | `555901ef-f707-4803-a887-1bc07e882096` | `651ec16f-d140-46db-b9e2-825c985a8ac2` |
| `ConsiderTimeInFilter` | `978b550e-1b81-448a-8700-9c9190c3a2a4` | `90b65bf8-0ffc-4141-8779-2420877af907` |
| `IsTreeview` | `6121f980-bc57-916a-30b3-62a0d801c6db` | `90b65bf8-0ffc-4141-8779-2420877af907` |

**Что настраивать** (значение пиши и в `L8.GS2` параметра, и в `GT1.GS2` его маппинга):
- `ResultType` — `0` первая запись, `1` агрегирующая функция, `2` коллекция записей (enum `ProcessReadDataResultType`).
- `FunctionType` — `0` Count, `1` Sum, `2` Avg, `3` Min, `4` Max (enum `AggregationTypeStrict`); `AggregationColumnName` — колонка для функции, для Count можно пусто.
- `ReadSomeTopRecords` / `NumberOfRecords` — «Читать первые N».
- `OrderInfo` — `"<Колонка>:<направление>:<позиция>"`, несколько через запятую; направление `1` по возрастанию, `2` по убыванию.
- `EntityColumnMetaPathes` — UId колонок для чтения через `;`.
- `ResultEntity` — `"L9"` = UId объекта, который читаем (`L13: true` оставь).
- `ResultCompositeObjectList` — `L18`: по параметру на каждую читаемую колонку (`L17` = UId колонки, `IL2` = UId элемента, `A3`/`A4` = UId процесса) + ресурс `BaseElements.<Элемент>.Parameters.ResultCompositeObjectList.<Колонка>.Caption` в обоих языках. ⚠️ Подпись обязательна (✅ подтверждено в CRM, 09.10.2026): без неё Designer не открывает свойства элемента — в консоли `(config.columnCaption || config.caption).split is not a function` (`EntitySchemaSelectMixin.getEntityPathCollection`). Пример:
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
  "UId": "1c0e0259-0038-4e4d-9619-418dbbe3c905",
  "A2": "Name",
  "A3": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "A4": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "IL2": "98b3be31-3498-4889-b6e4-a331d8e12b07",
  "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
  "L8": {},
  "L17": "736c30a7-c0ec-4fa9-b034-2552b319b633"
}
```
- `DataSourceFilters` — `GS2` = JSON-строка `{"className":"BPMSoft.FilterGroup","serializedFilterEditData":"<JSON-строка 1>","dataSourceFilters":"<JSON-строка 2>"}`. Собирай node-скриптом через `JSON.stringify` дважды. `comparisonType` (enum `BPMSoft.ComparisonType` клиента): `3` равно, `4` не равно, `5` меньше, `7` больше (✅ все четыре подтверждены запуском процессов; `4` и `5` — 09.10.2026); `dataValueType`: `1` текст, `4` целое. Строка 1 (для Designer):
```json
{
  "className": "BPMSoft.FilterGroup",
  "items": {
    "9d537227-897e-46c5-b220-a3b3710fa85b": {
      "className": "BPMSoft.CompareFilter",
      "filterType": 1,
      "comparisonType": 3,
      "isEnabled": true,
      "trimDateTimeParameterToDate": false,
      "leftExpression": {
        "className": "BPMSoft.ColumnExpression",
        "expressionType": 0,
        "columnPath": "Amount"
      },
      "isAggregative": false,
      "key": "9d537227-897e-46c5-b220-a3b3710fa85b",
      "dataValueType": 4,
      "leftExpressionCaption": "Количество",
      "rightExpression": {
        "className": "BPMSoft.ParameterExpression",
        "expressionType": 2,
        "parameter": {
          "className": "BPMSoft.Parameter",
          "dataValueType": 4,
          "value": 42
        }
      }
    }
  },
  "logicalOperation": 0,
  "isEnabled": true,
  "filterType": 6,
  "rootSchemaName": "TestProcEntity",
  "key": ""
}
```
Строка 2 (для выполнения):
```json
{
  "items": {
    "9d537227-897e-46c5-b220-a3b3710fa85b": {
      "filterType": 1,
      "comparisonType": 3,
      "isEnabled": true,
      "trimDateTimeParameterToDate": false,
      "leftExpression": {
        "expressionType": 0,
        "columnPath": "Amount"
      },
      "rightExpression": {
        "expressionType": 2,
        "parameter": {
          "dataValueType": 4,
          "value": 42
        }
      }
    }
  },
  "logicalOperation": 0,
  "isEnabled": true,
  "filterType": 6,
  "rootSchemaName": "TestProcEntity"
}
```

**✅ Фильтр «колонка = параметр процесса»** (подтверждено 03.10.2026 на `TestProcLeadAge`: «Id = [Лид]», «Id = [Контакт]»; Designer показал условие «Id = Лид»). Правая часть — `dataValueType: 26`, значение — ссылка на параметр без `[# #]`:
```json
"rightExpression": {
  "className": "BPMSoft.ParameterExpression",
  "expressionType": 2,
  "parameter": {
    "className": "BPMSoft.Parameter",
    "dataValueType": 26,
    "value": {
      "value": "[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId параметра процесса>}]",
      "displayValue": "<подпись параметра>"
    }
  }
}
```
В строке для выполнения (`dataSourceFilters`) — то же без `className` и без `displayValue`, но `value` остаётся объектом: `"value": {"value": "[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId параметра процесса>}]"}`. ❌ Опровергнуто (09.10.2026): ссылка голой строкой `"value": "[IsOwnerSchema:false]…"` загружается, но элемент падает при выполнении с `JsonSerializationException` в `ProcessFilterFactory.InitializeProcessParameterValue` — строку, которая начинается с `[`, платформа читает как массив (подтверждено в CRM на «Удалить данные»). У левой части `"columnPath": "Id"`, у фильтра `"dataValueType": 0`. Формат одинаков для «Читать данные» и «Изменить данные». Lookup-параметр (`L1` справочник, `L9` объект) и GUID-параметр подходят оба.

**Как читать результат**: ✅ задание-сценарий не видит элементы процесса (09.10.2026): код `CH1` компилируется в класс `<Процесс>MethodsWrapper`, и обращение `ReadDataUserTask1.<…>` даёт `CS0103` (подтверждено журналом компиляции `Build.log`). Передай значение формулой в параметр процесса, а в скрипте возьми его через `Get<T>("<Параметр>")`. ⚠️ Не читай `Get<Entity>("<Элемент>.ResultEntity")`: если та же колонка уже есть в условии шлюза, «Обновить из файловой системы» падает с `An item with the same key has already been added` (подтверждено журналом `PackagesSynchronization.log`, 09.10.2026). Ссылки на выходы элемента:
- колонка первой записи: `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра ResultEntity в BP2>}].[EntityColumn:{<UId колонки>}]#]`;
- скалярный выход (`ResultCount`, `ResultIntegerFunction`, `ResultRowsCount`...): `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра в BP2>}]#]`.

- ✅ **Фильтр «справочник = константа»** (подтверждено в CRM, 10.10.2026, в «Читать данные» и «Удалить данные»): `BPMSoft.CompareFilter`, `filterType: 1`, `comparisonType` 3 или 4, правая часть — `dataValueType: 10`, значение `{"value": "<Id записи справочника>"}` (в строке для Designer ещё `displayValue`).
- ✅ **Фильтр «колонка-справочник = параметр процесса»** (10.10.2026, «Удалить данные»): слева `dataValueType: 10` и путь (например `Owner`), справа `dataValueType: 26` со ссылкой на параметр объектом, как в разделе выше.
- ✅ **Граница даты формулой** (10.10.2026): правая часть фильтра — формула `[#SysVariable.CurrentDateTime#].AddDays(-14)`, `comparisonType: 5` (меньше), колонка `CreatedOn`.
- ✅ **Текст неограниченной длины в фильтре** (10.10.2026): у колонки MaxSizeText (`c0f04627-…`) `dataValueType: 29`, а не 1; условие «не заполнено» — `BPMSoft.IsNullFilter` с `isNull: true`.
- 🧪 У параметра `ResultEntity` есть `L16` — имя объекта; при клонировании элемента из другого процесса меняй его вместе с `L9`.

### ✅ Режим «Агрегирующая функция»
**Подтверждено 29.09.2026** на `TestProcAggr` (два элемента «Читать данные» в одном процессе): Count с фильтром «Количество = 42» вернул 2, Sum по колонке «Количество» с фильтром «Количество > 0» вернул 226. Designer показал первый элемент как «Считать количество записей», второй как «Считать функцию → Сумма → по колонке Количество».
- Count: `ResultType` = `"1"`, `FunctionType` = `"0"`, `AggregationColumnName` не задан. Выход — `ResultCount`.
- Sum/Avg/Min/Max: `ResultType` = `"1"`, `FunctionType` = `"1"`…`"4"`, `AggregationColumnName` = **имя** колонки (`"Amount"`, не UId). Выход — `ResultIntegerFunction` (целые), `ResultFloatFunction` (дробные и деньги), `ResultDateTimeFunction` (даты).
- В этом режиме `ReadSomeTopRecords` = `"false"`, `OrderInfo` и `EntityColumnMetaPathes` без значения (`L8` = `{"GS5": "<UId процесса>"}`, в маппинге `GT1` = `{}`), `ResultCompositeObjectList` без `L18`.
- `comparisonType` в фильтре: `3` равно, `4` не равно, `5` меньше, `7` больше (✅ все; список — в разделе про `DataSourceFilters` выше).
- ✅ **Найдена ли запись** (подтверждено в CRM, 09.10.2026): в режиме «первая запись» (`ResultType` = `"0"`) `ResultCount` не заполняется и остаётся `0`, поэтому условие `== 0` срабатывает и для найденной записи. Для проверки «есть ли запись» ставь элемент в режим Count (`ResultType` = `"1"`, `FunctionType` = `"0"`) и проверяй `ResultCount`. Если нужны и колонки записи — второй элемент «Читать данные» в режиме «первая запись».
- Два элемента одного типа в процессе — каждый со своими новыми UId элемента, 20 параметров и 20 маппингов; ресурсы — под своим именем элемента.

## ✅ Элемент «Формула» (FormulaTask)
**Подтверждено 29.09.2026** на `TestProcRead` (две формулы записали колонки прочитанной записи в параметры процесса). `BL7` = `d334d28f-b11a-477e-9ff0-0a95fa73d53b` (одинаков у всех 1135 формул проекта), `CH1` — выражение C# с макросами `[#...#]`, `HS1` — UId параметра процесса, куда пишется результат. Ресурс — только `BaseElements.<Имя>.Caption`.
```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaFormulaTask",
  "UId": "e6cfcd31-1318-4c62-b851-b3f3f0878a01",
  "A2": "FormulaTask1",
  "A3": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "A4": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
  "IL2": "4d37b71f-6277-407b-b89c-88cd0547e273",
  "BL3": "300;172",
  "BL7": "d334d28f-b11a-477e-9ff0-0a95fa73d53b",
  "BL8": "33a21678-6e8d-4618-afc4-5173f19adff9",
  "BN2": "69;55",
  "BO3": true,
  "BP2": [],
  "CL2": "FFFFFFFF",
  "CH1": "[#[IsOwnerSchema:false].[IsSchema:false].[Element:{98b3be31-3498-4889-b6e4-a331d8e12b07}].[Parameter:{8bf614fc-d7ab-4dce-ac55-b5b6e9efffaa}].[EntityColumn:{736c30a7-c0ec-4fa9-b034-2552b319b633}]#]",
  "HS1": "677f09be-9f18-4a6d-be2e-0af968c4ccf7"
}
```

**✅ Выражение с датами** (03.10.2026, `TestProcLeadAge`): к макросу можно обращаться как к значению C# — `[#...#].Year`, `.Month`, `.Day`, `.Date`. Полные годы между текущей датой и датой рождения:
```
[#SysVariable.CurrentDateTime#].Year - [#<дата>#].Year - (([#SysVariable.CurrentDateTime#].Month < [#<дата>#].Month || ([#SysVariable.CurrentDateTime#].Month == [#<дата>#].Month && [#SysVariable.CurrentDateTime#].Day < [#<дата>#].Day)) ? 1 : 0)
```
где `<дата>` — например `[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId «Читать данные»>}].[Parameter:{<UId ResultEntity>}].[EntityColumn:{<UId колонки>}]`. Результат — в целочисленный параметр (`HS1`). Лукап-колонку прочитанной записи формула кладёт в параметр-справочник так же (`[EntityColumn:{<UId колонки>}]`).

**✅ Строки и формат даты** (06.10.2026, `TestProcAddDelivery`): в «Формуле» к макросу даты можно применять методы C# и склеивать результат с текстовым параметром процесса: `[#<текстовый параметр>#] + " от " + [#SysVariable.CurrentDateTime#].ToString("dd.MM.yyyy HH:mm")` — получилось «Курьер от 06.10.2026 15:20». `CurrentDateTime` даёт время пользователя (часовой пояс профиля), а не UTC — как и `CurrentTime`. В `metadata.json` кавычки внутри выражения экранированы: `.ToString(\"dd.MM.yyyy HH:mm\")`.

## ✅ Элемент «Добавить данные» (AddDataUserTask)
**Шаблон**: `templates/process/add-data.json` — элемент, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`). Бери его, если в проекте нет своего элемента с тем же `J6`.
**Подтверждено 29.09.2026** на `TestProcAdd`: элемент добавил запись в `TestProcEntity` со всеми 7 значениями колонок; Designer показал объект, режим «Добавить одну запись» и значения полей. Клонирован с реального элемента проекта тем же способом, что «Читать данные» (новые UId элемента, 7 параметров и 7 маппингов; ресурсы `BaseElements.<Элемент>.Parameters.*`).

- `BL7` = `J6` = `db6abed1-0c5f-455b-8053-2665378cdb71`; `A3`/`A4` параметров — тот же UId.
- `EntitySchemaId` — `GS2` = UId объекта (в `L8` и в `GT1` маппинга).
- `RecordAddMode` — `"0"` = добавить одну запись. (Режим по выборке с источником значения `6` — колонка «Результат выборки» — встречается в проекте, записью не проверен.)
- `RecordId` — выход, Id созданной записи: `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра RecordId>}]#]`.
- `RecordDefValues` — `GS2` = JSON-строка `{"$type": "BPMSoft.Core.Process.LocalizableParameterValuesList, BPMSoft.Core", "$values": [...]}`, по элементу на колонку: `ItemUId` (новый GUID), `columnMetaPath.value` = UId колонки, `schemaUId.value` = UId объекта, `value` / `displayValue`, `parameterValue.value` = JSON-строка `ProcessSchemaParameterValue` (`Source`, `DataValueTypeUId` = тип колонки, `ReferenceSchemaUId` = объект справочника или нули).

**Способы задания значения** (все ✅):
| Что | `Source` | `value` / `displayValue` |
|---|---|---|
| Число, деньги | `1` | `{"value": "600"}`, `"6.5"` — через точку; `displayValue` такой же |
| Текст-константа | `1` | `{"isLczValue": true}`; сам текст — в ресурсах `BaseElements.<Элемент>.Parameters.RecordDefValues.Value.<ItemUId>.value` и `.displayValue` (обе локали). **В `GT1` маппинга** этот же элемент хранит текст прямо: `{"isLczValue": true, "value": "<текст ru>"}` — поэтому `GT1.GS2` не равен `L8.GS2` |
| Макрос (дата, логическое, контакт) | `3` | `{"value": "[#SysVariable.CurrentDateTime#]"}`, `displayValue` — читаемый вид, как у параметров процесса |
| Формула | `3` | `{"value": "\"Журнал шага 6, время: \" + [#SysVariable.CurrentDateTime#]"}` — C#-выражение с макросами |
| Значение другого элемента (✅ 05.10.2026, `TestProcG7`: выход «Вопроса» в формуле) | `3` | `{"value": "[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра в BP2 элемента>}]#]"}`, можно внутри формулы: `"\"G7b Да: \" + [#...#]"`; `displayValue` — читаемый вид, например `"\"G7b Да: \" + [#Вопрос.Выбранные ответы#]"`. Вариант с `.[EntityColumn:{...}]` (колонка записи из «Читать данные») — встречается в проекте, записью не проверен |
| Параметр процесса (✅ 03.10.2026, «Изменить данные» в `TestProcLeadAge`) | `3` | `{"value": "[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId параметра>}]#]"}`, `displayValue` — `{"value": "[#<Подпись параметра>#]"}`; `DataValueTypeUId` — тип колонки; в `GT1` маппинга тот же элемент без изменений. ✅ 06.10.2026 то же в «Добавить данные» (`TestProcAddDelivery`): параметр процесса → колонка `Name` наследника `BaseLookup` (`736c30a7-c0ec-4fa9-b034-2552b319b633`); пустой необязательный текстовый параметр ошибки не даёт |

Пример трёх элементов списка (текст-константа, число, справочник-макрос), `parameterValue` здесь показан раскрытым — в файле это JSON-строка:
```json
[
  {
    "ItemUId": "605dd760-52b6-4969-ae2a-4ba97df7b182",
    "columnMetaPath": {
      "value": "736c30a7-c0ec-4fa9-b034-2552b319b633"
    },
    "schemaUId": {
      "value": "c4848520-8352-4bb4-bab1-c4be07daf0c5"
    },
    "value": {
      "isLczValue": true
    },
    "displayValue": {
      "isLczValue": true
    },
    "parameterValue": {
      "value": {
        "$type": "BPMSoft.Core.Process.ProcessSchemaParameterValue, BPMSoft.Core",
        "Source": 1,
        "DisplayValue": "",
        "Value": "",
        "MetaPath": null,
        "MetaDataValue": null,
        "ModifiedInSchemaUId": "00000000-0000-0000-0000-000000000000",
        "SchemaUId": "00000000-0000-0000-0000-000000000000",
        "SchemaManagerName": "",
        "DataValueTypeUId": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
        "ReferenceSchemaUId": "00000000-0000-0000-0000-000000000000",
        "ResourceItemName": null
      }
    }
  },
  {
    "ItemUId": "3004bd25-a197-4963-bd4f-45b5539e65b2",
    "columnMetaPath": {
      "value": "7e97fca4-e510-4363-9c3e-a3393421fc3e"
    },
    "schemaUId": {
      "value": "c4848520-8352-4bb4-bab1-c4be07daf0c5"
    },
    "value": {
      "value": "600"
    },
    "displayValue": {
      "value": "600"
    },
    "parameterValue": {
      "value": {
        "$type": "BPMSoft.Core.Process.ProcessSchemaParameterValue, BPMSoft.Core",
        "Source": 1,
        "DisplayValue": "",
        "Value": "",
        "MetaPath": null,
        "MetaDataValue": null,
        "ModifiedInSchemaUId": "00000000-0000-0000-0000-000000000000",
        "SchemaUId": "00000000-0000-0000-0000-000000000000",
        "SchemaManagerName": "",
        "DataValueTypeUId": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
        "ReferenceSchemaUId": "00000000-0000-0000-0000-000000000000",
        "ResourceItemName": null
      }
    }
  },
  {
    "ItemUId": "bc704611-7bae-419b-94b3-b96c5836ea71",
    "columnMetaPath": {
      "value": "3d67b146-feec-4e80-8bb7-2af095534891"
    },
    "schemaUId": {
      "value": "c4848520-8352-4bb4-bab1-c4be07daf0c5"
    },
    "value": {
      "value": "[#SysVariable.CurrentUserContact#]"
    },
    "displayValue": {
      "value": "[#Системная переменная.Контакт текущего пользователя#]"
    },
    "parameterValue": {
      "value": {
        "$type": "BPMSoft.Core.Process.ProcessSchemaParameterValue, BPMSoft.Core",
        "Source": 3,
        "DisplayValue": "",
        "Value": "",
        "MetaPath": null,
        "MetaDataValue": null,
        "ModifiedInSchemaUId": "00000000-0000-0000-0000-000000000000",
        "SchemaUId": "00000000-0000-0000-0000-000000000000",
        "SchemaManagerName": "",
        "DataValueTypeUId": "b295071f-7ea9-4e62-8d1a-919bf3732ff2",
        "ReferenceSchemaUId": "16be3651-8fe2-4159-8dd0-a803d4683dd3",
        "ResourceItemName": null
      }
    }
  }
]
```

**`GT5` параметров «Добавить данные»**:
| Параметр | `GT5` | Тип `L1` |
|---|---|---|
| `EntitySchemaId` | `4573b9c8-b4d4-442e-a499-682e7b31ab10` | `b295071f-7ea9-4e62-8d1a-919bf3732ff2` |
| `DataSourceFilters` | `24151caf-0cf3-48bb-862c-ba9a0ddc4b29` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `RecordAddMode` | `06ad8e3f-90fc-4aa2-922d-3fa9c386f7fc` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `FilterEntitySchemaId` | `cb4a4921-dd8e-4b41-b4f9-539408697296` | `b295071f-7ea9-4e62-8d1a-919bf3732ff2` |
| `RecordDefValues` | `f1b0cf15-8edd-4df1-948f-7dd046622d22` | `b53eaa2a-4bb7-4a6b-9f4f-58ccab293e31` |
| `RecordId` | `01b58ce0-aa7f-40c5-a5c6-b4ddffb5d0c7` | `23018567-a13c-4320-8687-fd6f9e3699bd` |
| `ConsiderTimeInFilter` | `01eaeba6-132f-7d0d-4ecc-67b990f6bd5a` | `90b65bf8-0ffc-4141-8779-2420877af907` |

## ✅ Элементы «Изменить данные» (ChangeDataUserTask) и «Удалить данные» (DeleteDataUserTask)
**Шаблоны**: `templates/process/change-data.json` и `templates/process/delete-data.json` — элементы, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`). Бери их, если в проекте нет своих элементов с тем же `J6`.
**Подтверждено 29.09.2026** на `TestProcChangeDelete`: «Изменить данные» по фильтру «Количество = 600» записал в запись текст-константу, 700 и «Нет»; «Удалить данные» по фильтру «Количество = 2» удалил запись. Designer показал объект, фильтр и значения полей у обоих элементов. Способ — клонирование, как у «Читать данные».

**«Изменить данные»**: образец — любой элемент проекта с `BL7` = `J6` = `d3021ca7-7450-4678-a117-060171eb2976` (`rg -l d3021ca7-7450-4678-a117-060171eb2976 Pkg`). В проекте бывают и свои действия с похожим названием (своя реализация «Изменить данные») — у них другой `BL7`; для стандартной задачи бери только элемент с этим `BL7`.
- `EntitySchemaUId` — UId объекта (`L8.GS2` и `GT1.GS2`).
- `DataSourceFilters` — фильтр в том же формате, что у «Читать данные».
- `RecordColumnValues` — список значений колонок в том же формате, что `RecordDefValues` у «Добавить данные» (включая текст-константу `isLczValue` в ресурсах `BaseElements.<Элемент>.Parameters.RecordColumnValues.Value.<ItemUId>.value`/`.displayValue` и текст прямо в `GT1` маппинга).
- `IsMatchConditions` — `true` = «Изменить все записи, соответствующие условию» (значение в образце, не менял).

| Параметр | `GT5` | Тип `L1` |
|---|---|---|
| `EntitySchemaUId` | `bd2cf1ae-bbc6-4d91-8d6e-c6b40f057e95` | `b295071f-7ea9-4e62-8d1a-919bf3732ff2` |
| `IsMatchConditions` | `d6c84ba1-b6ca-4952-b517-880f22e21fdc` | `90b65bf8-0ffc-4141-8779-2420877af907` |
| `DataSourceFilters` | `03166c4b-2e15-4768-a343-750c16b69691` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `RecordColumnValues` | `effa11ce-90c7-4efe-8a02-be7a659d27e9` | `b53eaa2a-4bb7-4a6b-9f4f-58ccab293e31` |
| `ConsiderTimeInFilter` | `b9bc395c-1f13-d564-1257-2505f236ab7b` | `90b65bf8-0ffc-4141-8779-2420877af907` |

**«Удалить данные»**: образец — любой элемент проекта с `BL7` = `J6` = `40f4a8f2-edca-432d-a5ea-03e8577b4691` (`rg -l 40f4a8f2-edca-432d-a5ea-03e8577b4691 Pkg`). Параметры: `EntitySchemaId` (UId объекта), `DataSourceFilters` (фильтр), `IsMatchConditions`, `ConsiderTimeInFilter`.

| Параметр | `GT5` | Тип `L1` |
|---|---|---|
| `EntitySchemaId` | `d4b2bc79-929e-449b-9fd9-c1b05a86a743` | `b295071f-7ea9-4e62-8d1a-919bf3732ff2` |
| `DataSourceFilters` | `bf4c5111-ad4d-488b-99d6-c2a7f95495c4` | `394e160f-c8e0-46fa-9c0d-75d97e9e9169` |
| `IsMatchConditions` | `01c46f30-bbdc-4c7a-888c-4a0adac0b305` | `90b65bf8-0ffc-4141-8779-2420877af907` |
| `ConsiderTimeInFilter` | `5f38e140-dcb2-f278-7d54-7a033033d2ca` | `90b65bf8-0ffc-4141-8779-2420877af907` |

**Общий приём клонирования элемента-действия** (проверен на пяти видах): загрузить процесс-образец, взять элемент и его маппинги (`BK15`, где `GT2` содержит UId элемента), заменить в их JSON-тексте UId процесса-источника, элемента, дорожки, всех параметров `BP2` и маппингов на новые, переименовать элемент (`A2` элемента и маппингов), затем задать свои значения ключевых параметров одновременно в `L8` параметра и в `GT1` маппинга. Ресурсы `BaseElements.<Образец>.Parameters.*` скопировать с заменой имени элемента.

- ✅ **Дата формулой в «Изменить данные»** (10.10.2026): значение колонки-даты `{"value": "[#SysVariable.CurrentDateTime#].AddDays(1)"}` с источником `3` (формула).

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
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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

**Как проверить выполнение без скриншотов**: лог приложения стенда — `[app]/Logs/<ГГГГ-ММ-ДД>/Common.log`. Логгер проекта — `LogManager.GetLogger("Common")`; строки `logger.Info(...)` из скрипта видны там с меткой `Common`.

- ✅ В методах процесса `Get<bool>("<Параметр>")` и `Get<System.Guid>("<Параметр>")` читают логический и справочный параметры так же, как `Get<int>` (10.10.2026).
- ✅ «Формулу» можно заменить заданием-сценарием на том же месте и с тем же UId элемента: входящие и исходящие связи остаются (10.10.2026).

## ✅ Стартовый сигнал по объекту (запись добавлена / изменена)
**Подтверждено 29.09.2026**: `TestProcOnInsert` (старт по добавлению записи `TestProcEntity`) и `TestProcOnUpdate` (старт по изменению колонки «Количество» с фильтром «Количество > 500») запустились сами, когда другие процессы добавили и изменили запись, и записали Журнал в нужную запись. Designer показал сигналы с подписями. Процессы-обработчики работают после «Обновить из файловой системы» и компиляции — отдельной публикации не нужно.

- `BL1` `BPMSoft.Core.Process.ProcessSchemaStartSignalEvent`, `BL7` `1129e72f-0e8c-445a-b2ea-463517e86395`; после `IL2` идёт `IL3: true`.
- `FC2` — UId объекта; `DZ3: true` — ждать сигнал объекта; `DZ2: false`, `DZ1: "null"` — не произвольный сигнал; `ED1: false`.
- `DZ5` — тип изменения (enum `EntityChangeType`): `1` добавлена, `2` изменена, `4` удалена.
- `DZ11: true` + `DZ12` — «изменилась одна из колонок»: `DZ12` = JSON-строка `{"$type":"System.Collections.ObjectModel.Collection`1[[System.String, mscorlib]], mscorlib","$values":["<UId колонки>", ...]}`. Для добавления — `DZ11` не пишется, `$values` пустой.
- `DZ8: true` + `DZ13` — фильтр записи, формат как `DataSourceFilters` у «Читать данные». Без фильтра `DZ8` не пишется, а `DZ13` — пустая группа.
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
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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
Пункт меню — переопределение `getActions` (см. `client-schemas-edit.md`, «Замещение карточки»), `"Caption": resources.localizableStrings.<Ключ>` — работает и в совмещённом режиме.

**Из C#** (задание-сценарий, веб-сервис, событие объекта):
```csharp
var parameters = new Dictionary<string, string> {
	{ "PContactId", UserConnection.CurrentUser.ContactId.ToString() },
	{ "PSource", "C# (ProcessExecutor)" }
};
UserConnection.ProcessEngine.ProcessExecutor.Execute("TestProcFromClient", parameters);
```
Перегрузки `IProcessExecutor.Execute` (XML-документация `BPMSoft.Core.xml`): по имени или UId схемы; с `IReadOnlyDictionary<string, string>` значений параметров (значения — строки); с перечнем имён результирующих параметров.
- ✅ `Execute` запускает только процесс с простым стартом (`ProcessSchemaStartEvent`; подтверждено в CRM, 09.10.2026). У процесса со стартом только по сигналу — `ProcessCannotBeManuallyStartedException`: «начальные события предназначены только для автоматического запуска». Нужны оба запуска — поставь простой старт рядом со стартовым сигналом.
- ✅ Выходной параметр (подтверждено в CRM, 09.10.2026): `UserConnection.ProcessEngine.ProcessExecutor.Execute<string>("<Процесс>", "<Выходной параметр>", parameters)` возвращает его значение — так REST-метод отдаёт результат процесса клиенту.

## ✅ Выключить (деактивировать) процесс
**Опровергнуто 30.09.2026**: поле `BK36` (`Enabled`) в `metadata.json` НЕ выключает процесс. Это вычисляемое свойство (`ProcessSchema.Enabled => GetIsProcessEnabled(Id)`): платформа пишет его при сохранении, но при загрузке не читает. Проверено: `"BK36": false` в файле — галочка «Активен» осталась, таймерный процесс продолжал запускаться.

Состояние «Активен» хранится в таблице `SysProcessDisabled` (строка с `SysSchemaId` = процесс выключен; `BaseProcessSchemaSettingsHelper`). Способы:
1. UI: «Деактивировать» в библиотеке процессов.
2. SQL-скрипт пакета: вставить строку в `SysProcessDisabled` и удалить задания Quartz процесса (`qrtz_triggers`/`qrtz_job_details` с `sched_name = 'BPMCRMQuartzScheduler'` и `job_group` = UId процесса) — готовый ✅ скрипт в `sql-script-edit.md`. В проекте для этого может быть своя SQL-функция — поищи в `Pkg/*/SqlScripts` по `SysProcessDisabled`. ⚠️ Деактивируй только родительский процесс, не подпроцессы — по комментарию в реальном проекте, иначе ломается раздел «Библиотека процессов» (не проверено).
3. Привязка данных `SysProcessDisabled` — не переносима (`SysSchemaId` у каждого стенда свой).
Задания планировщика таймерного процесса ищи по `job_group` = UId процесса, а не по `job_name`.

## ✅ Подпроцесс (вызов другого процесса с входными и выходными параметрами)
**Подтверждено 02.10.2026**: `TestProcCaller` вызвал `TestProcSub` элементом «Подпроцесс» с `PIn = 7`; подпроцесс создал свою запись и вернул `POut = 70`; родитель прочитал выход формулой. Designer показал вызываемый процесс и его параметры с направлениями.

- `BL1` `BPMSoft.Core.Process.ProcessSchemaSubProcess`, `BL7` `49eafdbb-a89e-4bdf-a29d-7f17b1670a45`; `BO2: true`, `BO3: true`, `CK2: []`, `CK3: []`.
- `CK4` — UId вызываемого процесса.
- `BP2` — по параметру на КАЖДЫЙ параметр вызываемого процесса (`FJ1`): новый UId, `A2` и `L1`/`L12`/`L9` как у оригинала, `A3`/`A4` = UId вызываемого процесса, `IL2` = UId элемента «Подпроцесс». Значение входа — в `L8` (`GS5` = UId вызывающего процесса); у выхода `L8` только `{"GS5": ...}`.
- `BK15` — маппинг на каждый параметр `BP2`: `GT2` `[Element:{<подпроцесс>}].[Parameter:{<UId в BP2>}]`, `GT3` = UId в `BP2`, `GT4` = UId вызываемого процесса, `GT5` = UId параметра в `FJ1` вызываемого процесса, `GT1` = значение по умолчанию из вызываемого процесса (у нас `{"GS5": "<UId вызываемого>"}`).
- Выход подпроцесса читается ссылкой `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId подпроцесса>}].[Parameter:{<UId выходного параметра в BP2>}]#]` (формулой в параметр процесса).
- Ресурсы: `BaseElements.SubProcess1.Caption`, `BaseElements.SubProcess1.Parameters.<Имя>.Caption` / `.DisplayValue`.
- 61 подпроцесс проекта с `BP6` (`JE2`…`JE7`) — режим «для каждой записи коллекции» (multi-instance), записью не проверен.

```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaSubProcess",
  "UId": "4e99d34f-c60e-4405-b4ac-6cdff8906cfc",
  "A2": "SubProcess1",
  "A3": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc",
  "A4": "a8f4133c-9bd6-48cf-81c7-8e26b881a0cc",
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
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

## ✅ Элемент «Связать объект с процессом» (LinkEntityToProcessUserTask)
**Шаблон**: `templates/process/link-entity.json` — элемент, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`).
**Подтверждено 02.10.2026** на `TestProcLink`: элемент привязал экземпляр процесса к записи `TestProcEntity` — в таблице `SysProcessEntity` появилась строка с `EntityId` записи; Designer показал «Привязать процесс к объекту»: объект и запись привязки. Клонирован с реального элемента проекта (приём клонирования — см. «Изменить данные / Удалить данные»).

- `BL7` = `J6` = `fcace79b-6103-4992-8a1f-8e443114321a`; `BO2: true`, `BO3: true`.
- `EntityId` — Id записи (`GS1: 3` ссылка на параметр процесса), `L9` = UId объекта, `L11: false`.
- `EntitySchemaId` — UId объекта (`GS1: 1`), `L9` `2e155463-3ff1-4ccf-8584-4ec8d7233111` (не менять), `L11: false`.
- Логика — `Autogenerated/Src/LinkEntityToProcessUserTask.ProcessDesigner.cs`: при пустом объекте или Id только пишет предупреждение в лог; иначе `UserConnection.IProcessEngine.LinkProcessToEntity(...)`.
- Ресурсы: `BaseElements.<Элемент>.Caption`, `.Parameters.EntityId.Caption`/`.DisplayValue`, `.Parameters.EntitySchemaId.Caption`/`.DisplayValue` (подпись объекта).

| Параметр | `GT5` | Тип `L1` |
|---|---|---|
| `EntityId` | `b4e61a1e-7647-4984-a3b0-64a29ed30681` | `b295071f-7ea9-4e62-8d1a-919bf3732ff2` |
| `EntitySchemaId` | `06bcedca-a817-4027-8844-845966e2499b` | `b295071f-7ea9-4e62-8d1a-919bf3732ff2` |

## ✅ Элемент «Выполнить действие процесса» (своё действие на C#)
**Шаблоны**: элемент — `templates/process/user-task-call.json`, само действие (схема, `.cs`, ресурсы с иконками) — папка `templates/process/user-task-schema/`.
**Подтверждено 02.10.2026** на `TestProcUserTask`: элемент вызвал действие `TestUserTask` с параметрами-константами, формула прочитала его выходной параметр в параметр процесса, задание-сценарий записал результат.
- Само действие (схема `ProcessUserTaskSchemaManager` с `.cs`) и элемент в процессе — рецепты в `user-task-edit.md`, факты в `user-task.md`.
- Коротко: `BL1` `ProcessSchemaUserTask`, `BL7` = `1418e61a-82c3-403e-8221-01088f52c125`, `J6` = UId действия; `BP2` — параметры действия с новыми `UId`; в `BK15` маппинг на каждый параметр с `GT4` = UId действия и `GT5` = UId параметра в `FJ1` действия.
- Выход читай ссылкой на параметр `BP2` элемента: `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра BP2>}]#]`.
- Если в действие добавили параметр, процесс сам его не получит: обнови `BP2`, маппинг и ресурсы процесса файлами — `user-task-edit.md`, «Изменить существующее действие».

- ✅ Картинки своего действия (`LargeSvgImage`, `SmallSvgImage`, `TitleSvgImage`) в `resource.ru-RU.xml` действия лежат внутри `<Group Type="String">` — так действие загружается (10.10.2026).

## ✅ Элемент «Преднастроенная страница» (страница пользователю посреди процесса)
**Шаблоны**: элемент — `templates/process/preconfigured-page.json`, страница — папка `templates/process/preconfigured-page-schema/` (из подтверждённого теста; что заменить — в поле `about`). Бери их, если в проекте нет своих образцов.
**Подтверждено 02.10.2026** на `TestProcPage` и странице `TestPreconfPage` (шаг 19): процесс открыл текущему пользователю страницу с заголовком из `Title`, полем «Комментарий» и кнопками «Подтвердить»/«Закрыть» (задача появилась в панели задач справа); после «Подтвердить» формула прочитала введённое значение, задание-сценарий записал его. Designer показал элемент «Преднастроенная страница» со всеми настройками и параметром страницы.

**Способ — клонирование**: страница — клон любой страницы проекта с родителем `BasePageSimpleProcessTemplate` (`rg -l 5826ff24-46c6-4169-9223-2aaad9ec2e18 Pkg`); элемент — клон любого элемента проекта с `J6` = `ac2ef13c-30dd-4023-9c04-58f580743b48` (`rg -l ac2ef13c-30dd-4023-9c04-58f580743b48 Pkg`): сам элемент из `BK4`, все его маппинги из `BK15` (у которых `GT2` содержит UId элемента) и строки ресурсов `BaseElements.<Имя элемента>.*` обеих локалей. Если образцов нет — попроси пользователя собрать элемент и страницу в Designer.

### 1. Страница (клиентская схема)
- `descriptor.json`: `Parent` = `{"UId": "5826ff24-46c6-4169-9223-2aaad9ec2e18", "Name": "BasePageSimpleProcessTemplate"}`, `ManagerName: "ClientUnitSchemaManager"`; `properties.json`: `"SchemaType": "EditViewModelSchema"`. Другие шаблоны в проекте: `BasePageProcessTemplate`, `BasePageLeftContainerProcessTemplate`.
- `metadata.json` (журнал):
```
= MetaData.Schema.UId "<UId страницы>"
= MetaData.Schema.A2 "<Имя>"
= MetaData.Schema.A5 "<новый GUID>"
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "1.9.0.17103"
= MetaData.Schema.HD1 "5826ff24-46c6-4169-9223-2aaad9ec2e18"
= MetaData.Schema.HD11.["c49bd85e-159a-49ee-b10a-3c3bca63d7d5"].L8.GS2 "<список кнопок — строку целиком скопируй из metadata.json образца>"
+ MetaData.Schema.HD11 {"BL1": "BPMSoft.Core.ClientUnitSchemaParameter", "UId": "<UId параметра>", "A2": "Comment", "A3": "<UId страницы>", "A4": "<UId страницы>", "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd", "L8": {}}
~ MetaData.Schema.HD11 ["c49bd85e-159a-49ee-b10a-3c3bca63d7d5","<UId параметра>"]
```
- `HD11` — параметры страницы: каждое поле страницы — параметр (`L1` — тип; у справочника ещё `L9` — UId объекта). `c49bd85e-159a-49ee-b10a-3c3bca63d7d5` — унаследованный параметр `Buttons`: список кнопок (`LocalizableParameterValuesList`; у каждой `ItemUId`, `Tag`, `PerformSaveData`, `PerformClosePage`, подпись `isLczValue`). У образца две кнопки: `f073e66a-36ec-47d7-9c6a-e5952dbf05a3` «Подтвердить» (сохраняет и закрывает) и `c4841740-ff8c-406f-8626-1c78f78608bf` «Закрыть».
- `.js`: как у образца — `merge` кнопки `onSaveButtonClick` с подписью `Resources.Strings.SaveDataButtonCaption` и `insert` поля в `"parentName": "Header"` с `"bindTo": "<имя параметра>"`, `"isRequired": true`; `entitySchemaName: ""`. У справочного поля образец добавляет `"contentType": 5`.
- Ресурсы страницы (обе локали): `Caption`, `LocalizableStrings.SaveDataButtonCaption.Value`, `Parameters.c49bd85e-159a-49ee-b10a-3c3bca63d7d5.Value.<ItemUId>.Caption` для каждой кнопки, `Parameters.<UId параметра>.Caption` — подпись поля.

### 2. Элемент в процессе
- `BL1` `ProcessSchemaUserTask`, `BL7` = `J6` = `ac2ef13c-30dd-4023-9c04-58f580743b48` (одно и то же у всех таких элементов), `BO2: true`; `J5` не нужен (встречается лишь у единичных).
- При клонировании замени: UId элемента; UId процесса (`A3`/`A4`/`BL8`, `GS5`, `A3`/`A4` маппингов); дорожку (`IL2`); UId каждого параметра `BP2` и каждого маппинга; UId страницы образца на свой (в `ClientUnitSchemaUId` и его маппинге); UId параметра страницы образца на свой (`SourceParameterUId`). `A5` = UId пакета.
- `BP7` = `{"JH1": <UId параметра OwnerId>, "JH2": <UId параметра RoleId>, "JH3": 1}` — ссылки на параметры этого же элемента, меняются вместе с ними.
- `BP2` — 46 параметров:
  - стандартные (`A3` = `A4` = `ac2ef13c-...`, у них есть маппинги): `ClientUnitSchemaUId` (`GS2` = UId страницы), `Title` (`L8` `{GS1: 1, GS5: <UId процесса>}`, текст — в ресурсе `BaseElements.<Элемент>.Parameters.Title.Value`), `OwnerId` (`[#SysVariable.CurrentUserContact#]`), `ShowExecutionPage` (`"true"`), `Recommendation`, `InformationOnStep`, `EntitySchemaUId`/`EntityId`, параметры активности (`CreateActivity`, `Duration`, `StartIn` и т.д.);
  - свои (`A3` = UId процесса, без маппингов): параметр страницы — `A2`/`L1` как в `HD11` страницы, `A4` = UId страницы, `SourceParameterUId` = UId параметра в `HD11`; `Buttons` (`SourceParameterUId` = `c49bd85e-...`); `RoleId`; связи активности (`Account`, `Contact`… с `L17: "ActivityConnection"`).
  - Поле страницы образца — справочник: у клона поменяй `A2`, `L1` и убери `L9`.
- Значение, введённое на странице, читай ссылкой на параметр `BP2` элемента, например в формуле `CH1`: `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра страницы в BP2>}]#]`.
- Ресурсы процесса: все строки `BaseElements.<Имя элемента>.*` образца, кроме строк его поля; свои значения: `.Caption` элемента, `Parameters.<поле>.Caption`, `Parameters.Title.Value` и `.DisplayValue`, `Parameters.ClientUnitSchemaUId.DisplayValue` (`<Caption страницы> | <Имя без Page>`).

### Как выглядит
- Designer, панель «Преднастроенная страница»: «Какую страницу открыть?» — `Caption` страницы; «Кто выполняет задачу?» и «Контакт» — `OwnerId`; «Показывать страницу автоматически» — `ShowExecutionPage`; ещё «Рекомендация по заполнению страницы», «Подсказка пользователю», «К какой записи привязать страницу?», «Параметры страницы» (поле со стрелкой в обе стороны), «Открывать в модальном окне».
- Запуск: исполнителю создаётся задача (панель задач справа) с названием элемента; страница открывается сама, заголовок — `Title`; «Подтвердить» сохраняет поля в параметры элемента и продолжает процесс.

## ✅ Элемент «Отправить email» (EmailTemplateUserTask)
**Шаблон**: `templates/process/email.json` — элемент, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`). Бери его, если в проекте нет своего элемента с тем же `J6`.
**Подтверждено 03.10.2026** на `TestProcEmail` (шаг 20): Designer открыл элемент «Отправить email» со всеми заданными значениями — «Кому», «Какое сообщение отправить?» = «Произвольное письмо», «Тема», тело письма в редакторе, «Как выполняется отправка?» = «Отправить email автоматически», «Важность» = «Средняя», «Игнорировать ошибки при отправке»; диаграмма и потоки — без замечаний. Доставка письма не проверялась: на стенде нет почтового ящика (по решению пользователя кейс закрыт).

**Способ — клонирование**: образец — любой элемент проекта с `J6` = `184dbb27-ce13-4d37-8dff-c2ff1df9cf19` (`rg -l 184dbb27-ce13-4d37-8dff-c2ff1df9cf19 Pkg`; у проверенного образца произвольного письма — 49 параметров `BP2`, 48 маппингов, ресурсы `BaseElements.<Имя элемента>.*`). Для письма по шаблону выбери среди найденных элемент, который в Designer отправляет письмо по шаблону. Приём клонирования — как у «Преднастроенной страницы»; у образца `BL8` может не совпадать с UId процесса — замени и его на UId своего процесса.
- `BL7` = `J6` = `184dbb27-ce13-4d37-8dff-c2ff1df9cf19` (у всех 51 таких элементов проекта), `BO2: true`.
- Параметры `BP2`, которые задают письмо; значение пиши в `L8` (с `GS5` = UId процесса) и то же без `GS5` — в `GT1` маппинга параметра:
  - `Sender` — «От кого», справочник почтовых ящиков (`L9` как у образца). **Обязателен**: пустой Designer подсвечивает, а при выполнении без ящика падает `BPMSoft.Mail.Sender.EmailException: Почтовый ящик не существует.` — даже при `IgnoreErrors` = `true`. У образца значение — `[#SysSettings.<Код><Guid>#]`.
  - `Recipient1` — «Кому», строка неограниченной длины (`c0f04627-4620-4bc0-84e5-9419dc8516b1`), свой параметр элемента (`A3` = UId процесса, без маппинга): `{GS1: 3, GS2: "\"test@example.com\""}` или ссылка на параметр. Следующие получатели — `Recipient2` и т.д.
  - `Subject` — «Тема»: `{GS1: 3, GS2: "\"<текст>\""}`.
  - `BodyTemplateType` — «Какое сообщение отправить?»: `1` — произвольное письмо (`Body` + `BodyConfig`), `0` — по шаблону (`EmailTemplateId` = Id шаблона).
  - `Body` — HTML письма (`GS1: 1`); `BodyConfig` — JSON контент-дизайнера (`{"ItemType":"sheet","Items":[{"ItemType":"block","Items":[{"ItemType":"text","Content":"<p>…</p>", …}]}], …}`), по нему Designer показывает тело.
  - `SendEmailType` `0` — «Отправить email автоматически»; `Importance` `1` — «Средняя»; `IgnoreErrors`; `CreateActivity` `false`.
- Ресурсы процесса: строки `BaseElements.<Элемент>.*` образца; свои — `.Caption`, `Parameters.Subject.DisplayValue`, `Parameters.Recipient1.Caption` и `.DisplayValue`.

## ✅ Сквозной пример: возраст контакта при создании лида (задача 3)
**Подтверждено 03.10.2026** на `TestProcLeadAge`: после создания лида с контактом (дата рождения 29.09.1998) процесс сам записал контакту «Возраст» = 28; Designer показал все элементы с подписями, фильтры и значения.

Цепочка (каждый элемент — по своему рецепту выше):
1. Стартовый сигнал: объект `Lead` (`41af89e9-750b-4ebb-8cac-ff39b64841ec`), добавление (`DZ5: 1`), фильтр «`QualifiedContact.BirthDate` заполнено» — процесс не стартует без контакта или даты рождения.
2. Формула: `RecordId` сигнала → параметр `PLeadId` (GUID).
3. «Читать данные» `Lead`: фильтр «Id = [PLeadId]», колонка `QualifiedContact` (`ad490d58-054a-4d85-9246-dd8466eb3983`).
4. Формула: `QualifiedContact` прочитанной записи → параметр `PContactId` (справочник `Contact`, `16be3651-8fe2-4159-8dd0-a803d4683dd3`).
5. «Читать данные» `Contact`: фильтр «Id = [PContactId]», колонка `BirthDate` (`3f08db69-6d2f-4b1c-87a4-acddc6c3b9d6`).
6. Формула: полные годы → параметр `PAge` (целое).
7. «Изменить данные» `Contact`: фильтр «Id = [PContactId]», `Age` (`bcdc7a32-4332-4caf-858d-0078b56856fe`) = `[#PAge#]`.
8. Завершение.

**Как собирать файлами**: каркас — клон своего подтверждённого процесса (сигнал + формула); элементы-действия — клоны подтверждённых элементов из тестовых процессов того же пакета. При клонировании собери все значения полей `UId` в JSON (процесс, дорожки, элементы, параметры `BP2`/`L18`/`FJ1`, маппинги) и замени каждое на новый GUID по всему тексту; UId процесса-образца и его дорожки замени на свои. Константы (`BL7`, `J6`, `A3`/`A4` параметров действия, `GT4`, `GT5`, типы `L1`) не являются полями `UId` и остаются. Потоки (`CI11`/`CI12`) ставь по координатам фигур (см. таблицу в «Создать процесс с нуля»).

## ✅ Элемент «Автогенерируемая страница» (AutoGeneratedPageUserTask)
**Шаблон**: `templates/process/auto-page.json` — элемент, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`). Бери его, если в проекте нет своего элемента с тем же `J6`.
**Подтверждено 05.10.2026** на `TestProcAutoPage`: исполнителю пришла задача с заголовком страницы, страница открылась с обязательным полем «Комментарий» и кнопками Ok/Отмена; после ввода и Ok формулы прочитали текст поля и код кнопки, скрипт записал «G3: введено test, кнопка Ok».

**Способ — клонирование**: образец — любой элемент проекта с `J6` = `b5936328-09b2-45fd-b763-48d37c265644` (`rg -l b5936328-09b2-45fd-b763-48d37c265644 Pkg`; ресурсы `BaseElements.<Имя элемента>.*`); кнопки — с такого же элемента, где есть нужный набор кнопок. Приём клонирования — «Преднастроенная страница» (замени UId процесса, элемента, дорожки, параметров и маппингов; `A5` = UId пакета).
- `BL7` = `J6` = `b5936328-09b2-45fd-b763-48d37c265644`, `BO2: true`, `BP7` = `{JH1: <UId OwnerId>, JH2: <UId RoleId>, JH3: 1}`.
- Поле страницы — свой параметр элемента в `BP2` (`A3` = UId процесса, без маппинга; у образца `Message`, `L1` `8b3f29bb-ea14-4ce5-a5c5-293a929b6ba2`), `L8` — `{GS5: <UId процесса>}` или начальное значение. Введённое значение читай ссылкой `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра поля>}]#]`; нажатую кнопку — так же, параметр `PressedButtonCode` (значение = `name` кнопки, например `Ok`).
- Содержимое страницы — в ресурсах элемента (обе локали, значения XML-экранированы):
  - `Parameters.Title.Value` и `.DisplayValue` — заголовок страницы и задачи;
  - `Parameters.Elements.Value` и `.DisplayValue` — JSON-список полей; `$type` списка и элемента — как у образца (`List` и `Dictionary` из `mscorlib`, строку `$type` скопируй из ресурса образца); элемент поля: `{"Id": "<GUID>", "controlEditType": "1", "caption": "Комментарий", "name": "Message", "text": "", "isMultiline": true, "isRequired": true, "canBeMinimized": true, "minimized": false, "dataSource": null, "dataFilter": "", "controlDataValueType": "10", "dateTimeFormat": "7"}` — `name` поля = `A2` параметра в `BP2`;
  - `Parameters.Buttons.Value` и `.DisplayValue` — JSON-список кнопок того же `$type`: элементы `{"Id", "isEnabled": true, "performValidation": true|false, "caption", "name": "Ok", "style": "green"|"blue", "generateSignal": "Ok"}`.
- В `BP2` элемента параметры `Title`, `Buttons`, `Elements` — `{GS1: 1, GS5: <UId процесса>}`: значение берётся из ресурса.
- ✅ **Ветвление по нажатой кнопке прямо от страницы, без шлюза** (07.10.2026, `TestProcEscalateTicket`): от элемента страницы выходят условный поток к записи данных с `"CI3": "[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId страницы>}].[Parameter:{<UId параметра PressedButtonCode>}]#] == \"Ok\""` и поток по умолчанию к завершению — «Отмена» заканчивает процесс без записи. Типы потоков — раздел «Шлюзы и условные потоки». Подтверждающей кнопке — `"performValidation": true` (с пустым обязательным полем страница не проходит дальше), кнопке «Отмена» — `"performValidation": false`.
- Проверено одно многострочное текстовое поле; другие типы полей (`controlDataValueType`, справочники с `dataSource`) — 🧪.

- ✅ **Поля автогенерируемой страницы** (подтверждено в CRM, 10.10.2026, шаблон `templates/process/auto-page.json` на проекте без образцов): многострочный текст; справочник — `controlEditType` `SelectionField`, `controlDataValueType` `10`, `dataSource` = UId объекта справочника; дата без времени — `DateTimeField` с `dateTimeFormat` `8`. Обязательное поле не пускает дальше; значение справочника подставляется из параметра процесса.

## ✅ Элементы «Выполнить задачу», «Открыть страницу редактирования», «Вопрос пользователю»
**Шаблоны**: `templates/process/activity-task.json`, `templates/process/open-edit-page.json`, `templates/process/user-question.json` — элементы, маппинги и ресурсы из подтверждённых тестов (что заменить — в поле `about`). Бери их, если в проекте нет своих элементов с тем же `J6`.
**Подтверждено 05.10.2026** на `TestProcG7` (Старт → Задача → Открыть страницу редактирования → Вопрос → Завершение): создалась активность «G7 задача» длительностью 30 минут, после выполнения — статус «Завершена»; открылась страница нового контрагента с заголовком «G7 заполни контрагента» и предзаполненными полями, после сохранения в БД — Название, Телефон, Примечание, Ответственный; вопрос открылся модальным окном «G7 всё в порядке?» с вариантами «Да» / «Нет».

**Способ — клонирование.** Образец — такой же элемент из любого процесса проекта (ищи по `J6`); если в проекте таких нет — попроси пользователя собрать элемент в Designer и сохранить, затем клонируй.
- Новые GUID: все значения `UId` (элементы, параметры `BP2`, маппинги `BK15`, потоки, дорожки, процесс), `A5` схемы, а также `ItemUId` и `Id` элементов списков внутри JSON-строк `RecordColumnValues` и `BranchingDecisions` — они же стоят в ключах ресурсов, меняй согласованно.
- Не менять: `UId` параметра `BK37` (`cdd58be7-2dba-4a5e-869b-1ad5d6d7513a`, константа), `BL7`, `J6`, `A3`/`A4` параметров = UId задачи, `GT4`, `GT5`, `L1`, `L9`, `GS5`, равный UId задачи.
- Все три — `ProcessSchemaUserTask` с `BO2: true` и `BP7` = `{JH1: <UId параметра OwnerId>, JH2: <UId параметра RoleId>, JH3: 1}`. На каждый параметр `BP2` есть маппинг `BK15` с тем же значением, кроме `RoleId` (у него `A3`/`A4` = UId процесса, маппинга нет).
- Общие параметры всех трёх: `Recommendation` (текст задачи), `OwnerId` (кто выполняет, `[#SysVariable.CurrentUserContact#]`, `GS1: 3`), `ActivityCategory` (`f51c4643-58e6-df11-971b-001d60e938c6` «Выполнить»), `ActivityPriority` (`ab96fa02-7fe6-df11-971b-001d60e938c6` «Средний»), `Duration` / `StartIn` / `RemindBefore` с единицами в `…Period` (`0` = минуты), `ShowExecutionPage` («Показывать страницу автоматически»), `ShowInScheduler`.
- Локализуемый текст (`L1` `95c6e6c4-2cc8-46be-a1cb-96f942655f86`: `Recommendation`, `Question`): в `L8` только `{GS1: 1, GS5: <UId процесса>}`, сам текст — в `GT1.GS2` маппинга и в ресурсах `BaseElements.<Элемент>.Parameters.<Имя>.Value` и `.DisplayValue` (обе локали). Числа и логические — `GS2` строкой в `L8` и в `GT1`, плюс `.DisplayValue` в ресурсах.
- Ресурсы процесса содержат `BaseElements.<Элемент>.Parameters.<Имя>.Caption` для всех параметров (копия подписей задачи) — клонируй вместе с элементом. Designer пишет ещё `resource.es-ES.xml`, а в en-US не кладёт локализуемые значения; файлы только ru-RU и en-US с английскими значениями — сработали.
- Переименовать элемент: `A2` элемента, `A2` всех его маппингов и префикс ключей ресурсов `BaseElements.<Имя>.` (проверено: `OpenEditPageUserTask2` → `OpenEditPageUserTask1`).

| Элемент | `BL7` = `J6` | Ключевые параметры (`GT5`) |
|---|---|---|
| «Выполнить задачу» | `b5c726f2-af5b-4381-bac6-913074144308` | `Recommendation` `ea556634-d640-4462-9f9c-9da998c973d0` — «Что нужно сделать?» (заголовок активности); `Duration` `d20354ab-9c8e-455b-8fd5-06659b6d2b76`; `OwnerId` `a9e99cdd-cb76-4a4b-823e-d1313722f2e0`; `ActivityCategory` `dba2c595-cf3a-4e5f-be62-e4f0b3ccf037`; выходы `CurrentActivityId` `69566a2b-2ba0-4280-89be-172e44128234` (Id активности) и `ActivityResult` `585e28c6-fe87-4ebc-8555-7b841d613101` |
| «Открыть страницу редактирования» | `b0d3ad9f-7a27-46a3-9483-ed70c26872ae` | `ObjectSchemaId` `f8879eb3-b522-4eef-9c3a-97c661a00369` — UId объекта (Контрагент `25d7c1ab-1de0-4501-b402-02e0e5a72d6e`); `PageSchemaId` `bf9f5397-7c32-4177-b254-033219618752` — UId страницы; `EditMode` `b95863e0-fdf3-4d30-8f7f-79fe77f799d6` — `"0"` = «Добавить новую запись»; `RecordColumnValues` `b16ed342-8b8e-44d5-a8cf-ff4dd207c773` — «Как предзаполнить поля новой записи?»; `RecordId` `131deb9f-5109-45ee-8d6a-6e6d19242739` (`L9` = объект); `CreateActivity` `9713b627-6d1a-a9a0-e417-c72bd0cab5a1` (`false` — без активности) |
| «Вопрос пользователю» | `fe10dd95-2d61-4aa1-8111-9fb23b032603` | `Question` `42c3caf7-5813-45fe-a658-69ad350484e5`; `BranchingDecisions` `a7fe00c9-60ac-40f6-83d0-6fc87cfa235a` — варианты ответа; `ResultDecisions` `65bb805a-39a3-41ed-a090-172d6bfc4aaa` — выход, выбранные варианты; `DecisionMode` `42acf581-41a8-4216-a5a3-4456051999dd` (`"0"` = один вариант); `IsDecisionRequired` `1cd31021-c5d3-4a69-a147-a0fa2c94bfa4`; `IsOpenInModal` `f78b71f7-a757-07ed-90ba-2c74c226bf9d`, `ModalWidth` / `ModalHeight` (`600` / `400`) |

**Предзаполнение полей (`RecordColumnValues`)** — тот же формат, что `RecordDefValues` у «Добавить данные» (см. выше): элемент на колонку, `columnMetaPath` = UId колонки, `schemaUId` = UId объекта; текст-константа — `isLczValue` в `L8`, текст прямо в `GT1` и ресурсы `BaseElements.<Элемент>.Parameters.RecordColumnValues.Value.<ItemUId>.value` / `.displayValue`; макрос — `Source 3`. Набор колонок произвольный: Designer по умолчанию кладёт туда свои поля, их можно заменить любыми колонками объекта. UId колонок базового объекта — в `Autogenerated/Src/<Объект>Schema.Base.cs`, тип текстовой колонки `MediumText` — `ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd`.
- 🧪 `Web` контрагента после сохранения остался пустым (остальные поля сохранились). Гипотеза: у `Account` в этом проекте колонки средств связи синхронизируются с деталью средств связи (проектное замещение `Account`) — не полагайся на предзаполнение `Web` без проверки.

**Варианты ответа (`BranchingDecisions`)** — JSON-строка `LocalizableParameterValuesList`, элемент варианта: `{"ItemUId": <GUID>, "Id": {"value": <GUID>}, "Name": {"value": "Decision0"}, "Caption": {"isLczValue": true}, "DefChecked": {"value": "False"}}`; в `GT1` маппинга у `Caption` ещё `"value": "<текст ru>"`; подписи — ресурсы `BaseElements.<Элемент>.Parameters.BranchingDecisions.Value.<ItemUId>.Caption` (обе локали). Убрать вариант — удали его из обоих JSON и его ключ из ресурсов (проверено: из трёх вариантов оставили два).
- Ветвление по ответу — ✅ (05.10.2026, `TestProcG7`: ветки собраны файлами по формату Designer, при ответе «Да» и «Нет» отработала своя ветка; линии с произвольными `CI11`/`CI12` без `CI7`/`CI8` Designer сам рисует ломаными): из «Вопроса» выходят условные потоки без шлюза (`ProcessSchemaConditionalFlow`, `BL7` `dac675d4-ea84-4e44-9056-38bf918618e9`, `CI4: 2`, `GV3: []`), условие пустое — `CI3: "null"`. Выбор ветки — в `GV2`: словарь «UId элемента-вопроса → список `Id.value` вариантов из `BranchingDecisions`» (не `ItemUId`!); подпись ветки — ресурс `BaseElements.ConditionalSequenceFlowN.Caption`:
```json
"GV2": "{\"$type\":\"System.Collections.Generic.Dictionary`2[[System.Guid, System.Private.CoreLib],[System.Collections.ObjectModel.Collection`1[[System.Guid, System.Private.CoreLib]], System.Private.CoreLib]], System.Private.CoreLib\",\"<UId элемента «Вопрос»>\":{\"$type\":\"System.Collections.ObjectModel.Collection`1[[System.Guid, System.Private.CoreLib]], System.Private.CoreLib\",\"$values\":[\"<Id варианта>\"]}}"
```
- Выход `ResultDecisions` (`L1` `8b3f29bb-ea14-4ce5-a5c5-293a929b6ba2`, `L13: true`) — ✅ 05.10.2026: строка с JSON-массивом `Id.value` выбранных вариантов, например `["a414b3b2-20bf-4893-8f83-361e166d80a7"]` (не подпись и не `ItemUId`). Читается из другого элемента ссылкой `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId вопроса>}].[Parameter:{<UId параметра ResultDecisions в BP2 вопроса>}]#]` (проверено в формуле «Добавить данные»).

- ✅ **«Выполнить задачу» по шаблону** `templates/process/activity-task.json` на проекте без образцов (10.10.2026): задача создаётся, процесс ждёт её выполнения и идёт дальше. Поле «Что нужно сделать?» (`Recommendation`, локализуемый текст) заполняется ссылкой на параметр процесса: `GS1: 3`, `GS2: "[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId>}]#]"` — и в параметре, и в маппинге; ресурс `.Value` не нужен.

- ✅ **Не ждать выполнения задачи** (подтверждено в CRM, 11.10.2026): у «Выполнить задачу» нет настройки «не ждать». Решение — отдельный процесс с «Выполнить задачу», который задание-сценарий запускает для каждой записи через `UserConnection.ProcessEngine.ProcessExecutor.Execute("<Процесс>", parameters)`: вызов возвращает управление, как только задача создана. Подпроцесс по коллекции так не работает — родитель ждёт выполнения всех задач.
- ✅ **Связь задачи с записью** (11.10.2026): «Выполнить задачу» заполняет только колонки активности, зарегистрированные как связи в `EntityConnection` (`SysEntitySchemaUId` — объект `Activity`): для них элемент получает динамические параметры (`ProcessUserTaskUtilities.SynchronizeActivityConnectionParameters` в `Autogenerated/Src`). Свою справочную колонку `Activity` без такой регистрации элемент не заполняет. Проставь её после элемента заданием-сценарием по выходу `CurrentActivityId`: `CreateEntity` → `FetchFromDB(<Id активности>)` → `SetColumnValue("<Колонка>Id", <Id записи>)` → `Save(false)`. Регистрация колонки в `EntityConnection`, чтобы элемент заполнял её сам, — 🧪 не проверено.
- ✅ **Незавершённая задача** (11.10.2026): у справочника статусов активности `ActivityStatus` есть логическая колонка `Finish` — признак завершённого статуса; незавершённые активности отбирай фильтром `Status.Finish = false`, а не по списку статусов.
- ✅ **Срок задачи «до конца дня»** (11.10.2026): формула в целочисленный параметр `(int)([#SysVariable.CurrentDateTime#].Date.AddDays(1).AddMinutes(-1) - [#SysVariable.CurrentDateTime#]).TotalMinutes`; `Duration` задачи — ссылка на этот параметр (`GS1: 3`, в параметре и в маппинге), `DurationPeriod` = 0 (минуты).
- ✅ **Локализуемый текст в формуле** (11.10.2026): текстовый параметр процесса, значение в ресурсах `Parameters.<Имя>.Value` на ru-RU и en-US; формула склеивает `[#<параметр>#] + " " + <колонка>`.

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

## ✅ Удалить процесс
**Подтверждено 05.10.2026** на 23 тестовых процессах `TestProc*`: удалены папки `Schemas/<Имя>/` и `Resources/<Имя>.Process/`, после «Обновить из файловой системы» процессы пропали (статус «Удалено» в окне «Изменения», ошибок нет). Общий рецепт и проверка зависимостей — `entity-edit.md`, «Удалить объект (схему) целиком». Для процесса перед удалением дополнительно ищи по всему `Pkg` его UId и имя: вызов подпроцессом (`CK4`), запуск с клиента (`sysProcessName: "<Имя>"`), запуск из C# (`ProcessExecutor.Execute("<Имя>", ...)`), строку в SQL-скриптах.

## Дорожки (`BK3`) — в этом Designer не поддерживаются
**Проверено 02.10.2026** на `TestProcLink`: вторая дорожка, добавленная в `BK3[0].BM4` (копия первой с новым UId и `A2`), принимается, элементы с `IL2` на неё выполняются, но на холсте полос дорожек нет — и в панели элементов Designer стенда нет «Пула»/«Дорожки». У всех 409 процессов проекта ровно одна служебная дорожка. Правило: держи одну дорожку как в шаблоне процесса; `IL2` всех элементов = UId этой дорожки.

## Бывшие черновые рецепты и открытые вопросы — закрыты
- **Добавить элемент процесса** — ✅: каждый тип элемента — в своём разделе выше; приём клонирования — «Изменить данные / Удалить данные», общий сквозной пример — «возраст контакта при создании лида». Опровергнуто прежнее «геометрию связей Designer пересчитает сам»: `CI11`/`CI12` задавай по координатам фигур (таблица в «Создать процесс с нуля»).
- **`BL7`** — константа типа элемента, одинаковая во всём проекте; в другом проекте сверь по существующему элементу того же типа, прежде чем копировать.
- **`GT4`/`GT5`** — ✅ расшифрованы (UId схемы действия и UId его параметра, см. `user-task.md`); `CI6` — константа `1`, `CI9` — альтернативная форма точки (см. `processes.md`).
