# Кастомные действия процесса (ProcessUserTaskSchemaManager) — рецепты создания/редактирования

Общая механика diff-формата, штампов-полей и ресурсов — см. `metadata-editing.md`. Здесь — только рецепты, специфичные для кастомных действий процесса.

**Структура файлов**: для действия нужны 4 файла в папке `Pkg/<Пакет>/Schemas/<ИмяДействия>/`:
- `descriptor.json` — метаданные схемы (ManagerName, Caption, UId, Version)
- `properties.json` — поля вроде `CreatedInVersion`, `IsInteractive`
- `metadata.json` — структура действия: параметры (`FJ1`), цвет (`FK12`), etc. — **плоский JSON (Формат B)**, не diff-журнал
- `<ИмяДействия>.cs` — реальный C#-класс с методом `InternalExecute`

Плюс ресурсы: `Pkg/<Пакет>/Resources/<ИмяДействия>.ProcessUserTask/resource.ru-RU.xml`, `resource.en-US.xml` и т.д.

**Не забывай про 2 обязательных правила из `metadata-editing.md`**: (1) обе локали `ru-RU`+`en-US` для ресурсов, (2) актуальный `ModifiedOnUtc` при каждом изменении `descriptor.json`.

## ✅ Создать своё действие процесса с нуля
**Шаблон**: папка `templates/process/user-task-schema/` — схема действия из подтверждённого теста: `descriptor.json`, `metadata.json`, `properties.json`, `.cs`, ресурсы с иконками на двух языках (плейсхолдеры `<UId схемы действия>`, `<UId пакета>`).

**Подтверждено 02.10.2026** на `TestUserTask`: после «Обновить из файловой системы» и компиляции действие открылось в своём дизайнере (разделы «C#», «Локализуемые строки», «Параметры» с тремя параметрами), а в процессе `TestProcUserTask` выполнилось: создало запись и вернуло выходной параметр, который процесс прочитал дальше.

Файлы генерируй скриптом node (`JSON.stringify(obj, null, 2)`), а не руками. Новые GUID: `uuidgen | tr A-Z a-z`. Ниже — реальные файлы шага 17; замени имя, UId, параметры и тексты.

### `descriptor.json`
```json
{
  "Descriptor": {
    "UId": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
    "Name": "TestUserTask",
    "ModifiedOnUtc": "\/Date(1790944476000)\/",
    "ManagerName": "ProcessUserTaskSchemaManager",
    "Caption": "Test шаг 17: своё действие процесса",
    "DependsOn": []
  }
}
```
- `Caption` Designer показывает в поле «Какое пользовательское действие выполнить?» элемента процесса и в заголовке дизайнера действия.
- `ModifiedOnUtc` — `date +%s000`.

### `properties.json`
```json
{
  "Properties": {
    "CreatedInVersion": "1.9.0.17103",
    "IsInteractive": "True"
  }
}
```
`CreatedInVersion` возьми из соседней схемы пакета; `IsInteractive` — как у образца.

### `metadata.json` (плоский JSON)
```json
{
  "MetaData": {
    "Schema": {
      "ManagerName": "ProcessUserTaskSchemaManager",
      "UId": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "A2": "TestUserTask",
      "A5": "f6ef2a1b-c8a8-4ab7-81fc-dfa94f7604af",
      "B1": [],
      "B2": [],
      "B3": [],
      "B6": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
      "B8": "1.9.0.17103",
      "FJ1": [
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
          "UId": "390ff932-a96a-4ce3-9811-b19a9ad9d018",
          "A2": "TestText",
          "A3": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
          "A4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
          "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
          "L8": {},
          "L6": true,
          "L12": 0
        },
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
          "UId": "ffe58cb1-beee-4ae5-9667-b130b5db4533",
          "A2": "TestNumber",
          "A3": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
          "A4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
          "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
          "L8": {},
          "L12": 0
        },
        {
          "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
          "UId": "7e8ccd79-66ed-4228-bd67-38b42cf2e850",
          "A2": "TestResult",
          "A3": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
          "A4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
          "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
          "L8": {},
          "L12": 1
        }
      ],
      "FK12": "#839DC3",
      "FK16": true
    }
  }
}
```
- `UId` = UId из `descriptor.json`; `A5` — новый GUID; `B6` — UId пакета (как у соседних схем пакета); `B8` — версия из `properties.json`.
- `FJ1` — параметры действия: у каждого новый `UId`, `A3` = `A4` = UId действия.
- `L1` — тип: текст `ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd`, целое `6b6b74e2-820d-490e-a017-2b73d4ccf2b0` (остальные типы — `processes.md`, `metadata-codes.md`).
- `L12` — направление: `0` вход (Designer рисует →), `1` выход (←). Без `L12` параметр и вход, и выход — так у старых действий проекта.
- `L6: true` — обязательный (в Designer красная звёздочка).
- `FK12`, `FK16` — как у образца.

### `<Имя>.cs`
```csharp
namespace BPMSoft.Core.Process.Configuration
{
	using System;
	using BPMSoft.Core.Process;
	public partial class TestUserTask
	{
		protected override bool InternalExecute(ProcessExecutingContext context)
		{
			var entity = UserConnection.EntitySchemaManager.GetInstanceByName("TestProcEntity").CreateEntity(UserConnection);
			entity.SetDefColumnValues();
			entity.SetColumnValue("Name", "Шаг 17: действие TestUserTask получило " + TestText);
			entity.SetColumnValue("Amount", TestNumber);
			entity.SetColumnValue("Sum", 17m);
			entity.Save();
			TestResult = "обработано: " + TestText + " / " + TestNumber;
			return true;
		}
	}
}
```
- Класс `partial`, без базового класса, пространство имён `BPMSoft.Core.Process.Configuration`, переопределяется только `InternalExecute`. Доступен `UserConnection`.
- Платформа сама генерирует свойства по `FJ1` с типом по `L1` (текст → `string`, целое → `int`): входы читай, выходам присваивай.
- После «Обновить из файловой системы» нужна компиляция.

### Ресурсы `Resources/<Имя>.ProcessUserTask/`
- `resource.ru-RU.xml`: `Caption`, `Description`, `Parameters.<Имя>.Caption` для каждого параметра и три картинки `LargeSvgImage`, `SmallSvgImage`, `TitleSvgImage`. Картинки скопируй целыми строками `<Item ... Type="Image" .../>` из `templates/process/user-task-schema/resource.ru-RU.xml` или из любого действия процесса проекта (`Pkg/*/Resources/*.ProcessUserTask/`).
- `resource.en-US.xml`: те же строки без картинок (у образца картинки только в ru-RU; так и подтверждено).
- `Parameters.<Имя>.Caption` — подпись параметра в Designer процесса.

```xml
<?xml version="1.0" encoding="utf-8"?>
<Resources Culture="en-US">
	<Group Type="String">
		<Items>
			<Item Name="Caption" Value="Test step 17: custom process action" />
			<Item Name="Description" Value="Test action: creates a TestProcEntity record and returns text." />
			<Item Name="Parameters.TestNumber.Caption" Value="TestNumber" />
			<Item Name="Parameters.TestResult.Caption" Value="TestResult" />
			<Item Name="Parameters.TestText.Caption" Value="TestText" />
		</Items>
	</Group>
</Resources>
```

---

## ✅ Вставить своё действие в процесс (элемент «Выполнить действие процесса»)
**Шаблон**: `templates/process/user-task-call.json` — элемент, маппинги и ресурсы из подтверждённого теста.

**Подтверждено 02.10.2026** на `TestProcUserTask`: Старт → `UserTask1` (действие `TestUserTask`) → Формула (читает выход действия в параметр процесса) → Задание-сценарий → Завершение. Designer показал элемент «Выполнить действие процесса», выбранное действие и параметры «Текст*» = "Привет из процесса", «Число» = 17, «Результат» (выход); запуск создал обе ожидаемые записи.

Процесс собирай по рецепту «Создать процесс с нуля» из `process-edit.md` и добавь в `BK4` элемент:

```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaUserTask",
  "UId": "4b141c7b-fbc3-4a3f-aeda-d69136f36da2",
  "A2": "UserTask1",
  "A3": "677a2fc8-69af-4dc1-aff1-743edab22fbd",
  "A4": "677a2fc8-69af-4dc1-aff1-743edab22fbd",
  "A5": "266d6d8e-0a6a-e14b-801c-1378a5199ba7",
  "IL2": "ebac201e-f46b-499a-a7d2-7e19f927b810",
  "BL3": "150;172",
  "BL7": "1418e61a-82c3-403e-8221-01088f52c125",
  "BL8": "677a2fc8-69af-4dc1-aff1-743edab22fbd",
  "BN2": "69;55",
  "BO3": true,
  "BP2": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "0142fbff-48be-4925-b4a0-364818ac236b",
      "A2": "TestText",
      "A3": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "A4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "IL2": "4b141c7b-fbc3-4a3f-aeda-d69136f36da2",
      "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
      "L8": { "GS1": 3, "GS2": "\"Привет из процесса\"", "GS5": "677a2fc8-69af-4dc1-aff1-743edab22fbd" },
      "L6": true,
      "L12": 0
    },
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "863e693a-1ab3-42ff-acf4-e7646f740318",
      "A2": "TestNumber",
      "A3": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "A4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "IL2": "4b141c7b-fbc3-4a3f-aeda-d69136f36da2",
      "L1": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0",
      "L8": { "GS1": 1, "GS2": "17", "GS5": "677a2fc8-69af-4dc1-aff1-743edab22fbd" },
      "L12": 0
    },
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaParameter",
      "UId": "99baae75-db9f-4c77-a431-9142bcce625f",
      "A2": "TestResult",
      "A3": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "A4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
      "IL2": "4b141c7b-fbc3-4a3f-aeda-d69136f36da2",
      "L1": "ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd",
      "L8": { "GS5": "677a2fc8-69af-4dc1-aff1-743edab22fbd" },
      "L12": 1
    }
  ],
  "CL2": "FFFFFFFF",
  "J6": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d"
}
```
- `BL7` = `1418e61a-82c3-403e-8221-01088f52c125` — одна константа для всех своих действий; `J6` = UId схемы-действия (по нему выбирается действие).
- `A3` = `A4` = `BL8` = UId процесса, `A5` = UId пакета, `IL2` = UId дорожки.
- `BP2` — по параметру на каждый параметр `FJ1` действия: **новый `UId`**, `A2`/`L1`/`L6`/`L12` — как в `FJ1`, `A3` = `A4` = UId действия, `IL2` = UId элемента, без `A5`.
- `L8` входа: число-константа `{GS1: 1, GS2: "17", GS5: <UId процесса>}`; текст формулой `{GS1: 3, GS2: "\"текст\"", GS5: ...}`; параметр процесса `{GS1: 3, GS2: "[#[IsOwnerSchema:false].[IsSchema:false].[Parameter:{<UId параметра процесса>}]#]", GS5: ...}` (остальные формы значений — `process-edit.md`, «Параметры процесса»). У выхода `{GS5: <UId процесса>}`.

В `BK15` — по маппингу на каждый параметр `BP2`, включая выходной:

```json
{
  "BL1": "BPMSoft.Core.Process.ProcessSchemaMapping",
  "UId": "6f097b8c-a10f-4f3e-bbc4-332ece9d5cd5",
  "A2": "UserTask1",
  "A3": "677a2fc8-69af-4dc1-aff1-743edab22fbd",
  "A4": "677a2fc8-69af-4dc1-aff1-743edab22fbd",
  "GT2": "[Element:{4b141c7b-fbc3-4a3f-aeda-d69136f36da2}].[Parameter:{0142fbff-48be-4925-b4a0-364818ac236b}]",
  "GT3": "0142fbff-48be-4925-b4a0-364818ac236b",
  "GT5": "390ff932-a96a-4ce3-9811-b19a9ad9d018",
  "GT4": "06244cf3-23a5-4e9f-8a47-1bacc5d7a21d",
  "GT1": { "GS1": 3, "GS2": "\"Привет из процесса\"" }
}
```
- `UId` — новый; `A2` — имя элемента; `A3` = `A4` = UId процесса.
- `GT2` = `[Element:{<UId элемента>}].[Parameter:{<UId параметра BP2>}]`, `GT3` = UId параметра `BP2`.
- `GT4` = UId действия, `GT5` = UId того же параметра в `FJ1` действия.
- `GT1` = значение из `L8` без `GS5`; у выхода `{}`.

Ресурсы процесса (обе локали): `BaseElements.<Элемент>.Caption`, `BaseElements.<Элемент>.Parameters.<Имя>.Caption` для каждого параметра и `BaseElements.<Элемент>.Parameters.<Имя>.DisplayValue` для входов со значением (`17`, `&quot;Привет из процесса&quot;`).

Выход действия дальше по процессу читай ссылкой на UId параметра **из `BP2`** (не из `FJ1`), например в формуле `CH1`:
`[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра BP2>}]#]`.

### Опровергнуто
- Прежний рецепт «UId параметров `BP2` скопируй из `FJ1`» — неверно: и у реального процесса проекта, и в подтверждённом шаге 17 UId в `BP2` новые; связь с `FJ1` идёт через `GT5` маппинга.
- Прежний пример `L1` «`00000000-0000-0000-0000-000000000001` для строки» — неверно, текст — `ddb3a1ee-07e8-4d62-b7a9-d0e618b00fbd`.

---

## ✅ Изменить существующее действие (параметры, подписи, код)
**Подтверждено 02.10.2026** на `TestUserTask` (шаг 18): добавлен входной параметр `TestExtra`, изменена подпись `TestNumber`, переписан код; процесс `TestProcUserTask` сначала запущен без правки, потом обновлён файлами.

1. Схема действия:
   - `metadata.json`: новый параметр — объект в конец `FJ1` (новый `UId`, `A3` = `A4` = UId действия, `L1`, `L12`, при необходимости `L6`);
   - `.cs`: код использует новое свойство;
   - ресурсы обеих локалей: `Parameters.<Имя>.Caption` нового параметра и изменённые подписи;
   - `ModifiedOnUtc` в `descriptor.json`; после «Обновить из файловой системы» — компиляция.
2. Что происходит с процессами, где действие уже стоит, если их не трогать:
   - выполняется новый код действия;
   - параметр, которого нет в `BP2` элемента, действие получает пустым (`string.IsNullOrEmpty` = true), ошибки нет;
   - Designer процесса после перезагрузки страницы сам показывает новый параметр и новые подписи из ресурсов действия, но значения у нового параметра нет.
3. Чтобы задать значение нового параметра файлами — в каждом процессе, где стоит действие (ищи UId действия в `J6` элементов):
   - `BP2` элемента: новый параметр в конец (новый `UId`, `A2`/`L1`/`L12` как в `FJ1`, `A3` = `A4` = UId действия, `IL2` = UId элемента, `L8` со значением и `GS5` = UId процесса);
   - `BK15`: новый маппинг с `GT2`/`GT3` на новый параметр `BP2`, `GT4` = UId действия, `GT5` = UId параметра в `FJ1`, `GT1` = значение без `GS5`;
   - ресурсы процесса (обе локали): `BaseElements.<Элемент>.Parameters.<Имя>.Caption` и `.DisplayValue`; изменённые подписи поправь и здесь, чтобы копия в процессе совпадала с действием;
   - `ModifiedOnUtc` процесса.
   Проверено: Designer показал значение «Доп. текст» = "Доп из процесса", действие получило его при запуске.

## ✅ Удалить или переименовать параметр действия
**Подтверждено 05.10.2026** на `TestUserTask2` + `TestProcUserTask2` (G6): у действия были параметры `PKeep`, `PDel`, `PRen`; `PDel` удалён, `PRen` переименован в `PRenamed` с тем же `UId`.

1. Схема действия:
   - удалить параметр: убери объект из `FJ1` и ключ `Parameters.<Имя>.Caption` из ресурсов обеих локалей;
   - переименовать параметр: поменяй только `A2` в `FJ1`, `UId` оставь прежним; в ресурсах обеих локалей переименуй ключ `Parameters.<Старое>.Caption` в `Parameters.<Новое>.Caption`;
   - `.cs`: убери или переименуй обращения к свойствам — свойства класса генерируются по `FJ1`;
   - `ModifiedOnUtc` в `descriptor.json`; после «Обновить из файловой системы» обязательно компиляция.
2. Что происходит с процессами, где действие уже стоит, если их не трогать:
   - до компиляции метаданные уже новые, а сборка старая: значения удалённого и переименованного параметров приходят в действие пустыми, ошибки нет ни в интерфейсе, ни в логах;
   - после компиляции процесс работает: значение переименованного параметра доходит до нового свойства, потому что маппинг связан с параметром действия по `GT5` (UId параметра в `FJ1`), а не по имени `A2` в `BP2`;
   - маппинг и параметр `BP2` на удалённый параметр молча игнорируются: ни ошибки компиляции, ни ошибки выполнения;
   - Designer процесса: удалённый параметр исчезает из элемента, переименованный показан с новой подписью и прежним значением.
3. Чистка процессов (рекомендуется; проверено, что после неё процесс работает так же). В каждом процессе, где UId действия стоит в `J6` элемента:
   - `BK15`: удали маппинг с `GT5` = UId удалённого параметра;
   - `BP2` элемента: удали параметр с `UId` = `GT3` этого маппинга; у переименованного параметра поменяй `A2`;
   - ресурсы процесса обеих локалей: удали `BaseElements.<Элемент>.Parameters.<Старое>.Caption` и `.DisplayValue` удалённого параметра; у переименованного переименуй оба ключа (`.Caption` — новая подпись, `.DisplayValue` без изменений);
   - `ModifiedOnUtc` процесса.
- ⚠️ При переименовании не меняй `UId` параметра в `FJ1`: по нему (`GT5`) процессы находят параметр. Смена `UId` не проверялась.

---

## ✅ Удалить действие (схему) целиком

✅ Подтверждено 05.10.2026 на `TestUserTask` — удалено вместе с процессами, которые его вызывали, за одно «Обновить из файловой системы».

Тот же рецепт, что для Entity (см. `entity-edit.md`, раздел "Удалить объект"):

1. Удалить рекурсивно две папки:
   - `Pkg/<Пакет>/Schemas/<ИмяДействия>/`
   - `Pkg/<Пакет>/Resources/<ИмяДействия>.ProcessUserTask/`

2. Нажать "Обновить из файловой системы" в BPMSoft-CRM

3. **ПЕРЕД удалением — ОБЯЗАТЕЛЬНО проверить зависимости** (см. `entity-edit.md` для алгоритма проверки через grep, и заменить `.Entity` на `.ProcessUserTask` в поисковых фильтрах):
   - Найти все процессы, которые ссылаются на это действие в `BP2` их элементов (ищи UId действия в поле `A3`/`A4` параметров элементов `ProcessSchemaUserTask`)
   - Предупредить пользователя, если найдены зависимые процессы, и спросить подтверждение перед удалением
