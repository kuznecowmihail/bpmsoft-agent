# Объекты (EntitySchemaManager) — рецепты создания/редактирования

Общая механика diff-формата, штампов-полей и ресурсов — см. `metadata-editing.md`. Здесь — только рецепты, специфичные для объектов. Подробности значений полей — см. `entity.md`, факты верхнего уровня и событий — `entity-schema.md`.

## Колонки и индексы
Добавить, изменить, удалить колонку, колонки любых типов, колонка активности, индексы — в `entity-columns-edit.md`.

## ✅ Создать объект с нуля за один шаг (с колонкой и событием)
**Подтверждено**: объект `TestCounter2` (наследник `BaseLookup`) создан полностью вручную, одним шагом, по шаблону ниже — после «Обновить из файловой системы» открылся в CRM без ошибок, колонка `Counter` на месте, событие «После сохранения записи» активно. В шаблоне учтены два найденных ранее бага: `IL2`/`CD4` у `ProcessSchemaLane` = UId `LaneSet` (не самой Lane), и обязательный флаг `D20.FA11`.

⚠️ **Новый справочник (наследник `BaseLookup`) — ещё и регистрация в разделе «Справочники»**: без неё справочник не виден пользователю в разделе «Справочники». Регистрация — набор данных `Data/Lookup_<Объект>/` (одна строка таблицы `Lookup`), ✅ рецепт — `registration-edit.md`, раздел «Справочник в разделе «Справочники»». Включай её в план по умолчанию; не нужна, только если пользователь сказал, что справочник служебный.

**Файлы** (`Pkg/<Пакет>/`):
1. `Schemas/<Имя>/descriptor.json`:
```json
{
  "Descriptor": {
    "UId": "714f45e1-061c-4506-a668-029ebc95d8e5",
    "Name": "TestCounter2",
    "ModifiedOnUtc": "\/Date(1790437401000)\/",
    "Parent": {
      "UId": "11ab4bcb-9b23-4b6d-9c86-520fae925d75",
      "Name": "BaseLookup"
    },
    "ManagerName": "EntitySchemaManager",
    "Caption": "Тестовый справочник со счётчиком v2",
    "DependsOn": []
  }
}
```
2. `Schemas/<Имя>/properties.json`:
```json
{
  "Properties": {
    "AdministratedByColumns": "False",
    "AdministratedByOperations": "False",
    "AdministratedByRecords": "False",
    "CreatedInVersion": "<версия платформы>",
    "IsSSPAvailable": "False",
    "IsTrackChangesInDB": "False",
    "IsVirtual": "False"
  }
}
```
3. `Schemas/<Имя>/<Имя>.cs` — пустой файл (0 байт); необязателен: объект `TestTicketPriorityLog` без `.cs` ✅ загрузился и принимает записи (07.10.2026).
4. `Resources/<Имя>.Entity/resource.ru-RU.xml` и `resource.en-US.xml` — `<Item Name="Caption" .../>` и `<Item Name="Columns.<Колонка>.Caption" .../>` в обоих языках.
5. `Schemas/<Имя>/metadata.json` — рабочий файл целиком (diff-журнал):
```
= MetaData.Schema.UId "714f45e1-061c-4506-a668-029ebc95d8e5"
= MetaData.Schema.A2 "TestCounter2"
= MetaData.Schema.A5 "<Id пакета>"
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "<версия платформы>"
= MetaData.Schema.D8 "11ab4bcb-9b23-4b6d-9c86-520fae925d75"
- MetaData.Schema.D1
+ MetaData.Schema.D2 {"UId": "5ff80375-e1e8-4028-8b7a-b56a652b09c0", "A2": "Counter", "A3": "714f45e1-061c-4506-a668-029ebc95d8e5", "A4": "714f45e1-061c-4506-a668-029ebc95d8e5", "A5": "<Id пакета>", "S2": "6b6b74e2-820d-490e-a017-2b73d4ccf2b0"}
~ MetaData.Schema.D2 ["5ff80375-e1e8-4028-8b7a-b56a652b09c0"]
+ MetaData.Schema.EG1.UId "811177cb-af70-4769-a0df-d6d092653791"
+ MetaData.Schema.EG1.A2 "TestCounter2EventsProcess"
+ MetaData.Schema.EG1.A5 "<Id пакета>"
+ MetaData.Schema.EG1.BK3 {
  "BL1": "BPMSoft.Core.Process.ProcessSchemaLaneSet",
  "UId": "ea8b546f-3739-4e7c-ae4f-15164168f78a",
  "A2": "LaneSet1_ea8b546f37394e7cae4f15164168f78a",
  "A3": "811177cb-af70-4769-a0df-d6d092653791",
  "A4": "811177cb-af70-4769-a0df-d6d092653791",
  "A5": "<Id пакета>",
  "BL3": "0;5",
  "BL6": "LaneSet",
  "BL7": "11a47caf-a0d5-41fa-a274-a0b11f77447a",
  "BL8": "abcea28a-e9d9-410b-8516-4f27985c814e",
  "BL9": "EntitySchemaManager",
  "BM1": 0,
  "BM4": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaLane",
      "UId": "c003ece1-ea2c-499b-9bee-99713042064b",
      "A2": "Lane1_c003ece1ea2c499b9bee99713042064b",
      "A3": "811177cb-af70-4769-a0df-d6d092653791",
      "A4": "811177cb-af70-4769-a0df-d6d092653791",
      "A5": "<Id пакета>",
      "IL2": "ea8b546f-3739-4e7c-ae4f-15164168f78a",
      "BL6": "Lane",
      "BL7": "abcd74b9-5912-414b-82ac-f1aa4dcd554e",
      "BL9": "EntitySchemaManager",
      "CD1": [],
      "CD2": [],
      "CD4": "ea8b546f-3739-4e7c-ae4f-15164168f78a",
      "CD7": []
    }
  ]
}
~ MetaData.Schema.EG1.BK3 ["ea8b546f-3739-4e7c-ae4f-15164168f78a"]
= MetaData.Schema.EG1.BK4.["90027ac8-c9c3-4d21-a4f9-da1cde752cd1"].CK2.["d8b8410f-5c8a-4ddc-8fc2-353483452aed"].BL7 "53818048-7868-48f6-ada0-0ebaa65af628"
= MetaData.Schema.EG1.BK4.["08594d74-60b0-45ce-bf17-bac1a8b127f7"].CK2.["496d4a3c-b644-4a65-b0ed-2534d9236da5"].BL7 "53818048-7868-48f6-ada0-0ebaa65af628"
= MetaData.Schema.EG1.BK4.["5f3bfbbe-1820-44ca-92f1-6f993169b2dd"].CK2.["d7c806b7-a29b-4ce5-9167-b3319472e772"].BL7 "53818048-7868-48f6-ada0-0ebaa65af628"
= MetaData.Schema.EG1.BK4.["dbf48103-dcf6-4f53-a052-d727a95ea0b4"].CK2.["933bf2fc-d052-40c8-a3e0-bf60049da5d8"].BL7 "53818048-7868-48f6-ada0-0ebaa65af628"
= MetaData.Schema.EG1.BK4.["f0646c74-f291-474f-9a10-143ee868f1c9"].CK2.["b3d5b61f-7afe-48b5-a8cc-40317ea9c428"].BL7 "53818048-7868-48f6-ada0-0ebaa65af628"
= MetaData.Schema.EG1.BK4.["8140d7e7-fb91-4999-8347-543345440efb"].CK2.["c803a450-c8dc-47a4-b704-7125c23db317"].BL7 "53818048-7868-48f6-ada0-0ebaa65af628"
+ MetaData.Schema.EG1.BK4 {
  "BL1": "BPMSoft.Core.Process.ProcessSchemaEventSubProcess",
  "UId": "9281a9d2-612b-40b4-b7c0-beb874757456",
  "A2": "EventSubProcess1_9281a9d2612b40b4b7c0beb874757456",
  "A3": "811177cb-af70-4769-a0df-d6d092653791",
  "A4": "811177cb-af70-4769-a0df-d6d092653791",
  "A5": "<Id пакета>",
  "IL2": "c003ece1-ea2c-499b-9bee-99713042064b",
  "BL3": "58;68",
  "BL6": "EventSubProcess",
  "BL7": "0824af03-1340-47a3-8787-ef542f566992",
  "BL8": "abcea28a-e9d9-410b-8516-4f27985c814e",
  "BL9": "EntitySchemaManager",
  "BN1": true,
  "BN2": "303;300",
  "BP2": [],
  "CK1": true,
  "CK2": [
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaStartMessageEvent",
      "UId": "5c425c2a-ecf2-4db1-9c63-065bd8e6a82a",
      "A2": "StartMessage1_5c425c2aecf24db19c63065bd8e6a82a",
      "A3": "811177cb-af70-4769-a0df-d6d092653791",
      "A4": "811177cb-af70-4769-a0df-d6d092653791",
      "A5": "<Id пакета>",
      "IL2": "9281a9d2-612b-40b4-b7c0-beb874757456",
      "BL3": "66;121",
      "BL6": "Event",
      "BL7": "02340c80-8e75-4f7a-917b-04125bc07192",
      "BL8": "abcea28a-e9d9-410b-8516-4f27985c814e",
      "BL9": "EntitySchemaManager",
      "BN2": "31;31",
      "FC1": [],
      "ED1": false,
      "CJ1": "TestCounter2Saved"
    },
    {
      "BL1": "BPMSoft.Core.Process.ProcessSchemaScriptTask",
      "UId": "d7e11fc1-d899-4282-87de-80dd364d24b1",
      "A2": "ScriptTask1_d7e11fc1d899428287de80dd364d24b1",
      "A3": "811177cb-af70-4769-a0df-d6d092653791",
      "A4": "811177cb-af70-4769-a0df-d6d092653791",
      "A5": "<Id пакета>",
      "IL2": "9281a9d2-612b-40b4-b7c0-beb874757456",
      "BL3": "193;107",
      "BL6": "Task",
      "BL7": "0e490dda-e140-4441-b600-6f5c64d024df",
      "BL8": "abcea28a-e9d9-410b-8516-4f27985c814e",
      "BL9": "EntitySchemaManager",
      "BN2": "69;55",
      "BP2": [],
      "CL2": "FFFFFFFF",
      "CH1": "var selectRowCount = new Select(UserConnection)\n\t.Column(Func.Count(\"Id\"))\n\t.From(\"TestCounter2\") as Select;\nint totalCount = selectRowCount.ExecuteScalar<int>();\nEntity.SetColumnValue(\"Counter\", totalCount + 1);\nreturn true;",
      "CH2": true
    }
  ],
  "CK3": []
}
+ MetaData.Schema.EG1.BK4 {
  "BL1": "BPMSoft.Core.Process.ProcessSchemaSequenceFlow",
  "UId": "fd570195-32c1-4b5e-ab1b-70f900cd9c12",
  "A2": "SequenceFlow1_fd57019532c14b5eab1b70f900cd9c12",
  "A3": "811177cb-af70-4769-a0df-d6d092653791",
  "A4": "811177cb-af70-4769-a0df-d6d092653791",
  "A5": "<Id пакета>",
  "BL6": "SequenceFlow",
  "BL7": "0d8351f6-c2f4-4737-bdd9-6fbfe0837fec",
  "BL8": "abcea28a-e9d9-410b-8516-4f27985c814e",
  "BL9": "EntitySchemaManager",
  "CI1": "5c425c2a-ecf2-4db1-9c63-065bd8e6a82a",
  "CI2": "d7e11fc1-d899-4282-87de-80dd364d24b1",
  "CI3": "null"
}
~ MetaData.Schema.EG1.BK4 ["90027ac8-c9c3-4d21-a4f9-da1cde752cd1","08594d74-60b0-45ce-bf17-bac1a8b127f7","5f3bfbbe-1820-44ca-92f1-6f993169b2dd","dbf48103-dcf6-4f53-a052-d727a95ea0b4","f0646c74-f291-474f-9a10-143ee868f1c9","8140d7e7-fb91-4999-8347-543345440efb","9281a9d2-612b-40b4-b7c0-beb874757456","e57d317f-6f21-48a8-9999-5ecf05719145","bdca0c6b-eb97-4d14-83df-aa53b214c463","db2f2393-5d29-47cf-a756-8e26392d342f","60ca0a5b-c2b5-4ee3-acd8-f25e9e91ec44","7feb971a-3b75-486d-bb0b-92352f82a420","2f317c63-b9de-4594-befc-1e8413c1ddfe","8a5a0739-a2a3-4581-9476-2909c2e98c39","a53d2c03-849b-47b6-9032-066c63d26056","76ca325d-c9c6-4992-b7d6-11b890506ae3","fd570195-32c1-4b5e-ab1b-70f900cd9c12","453da06c-6118-43bb-88cf-7a8f547090e7","17b638b4-f653-4bd5-9af3-e81689b5f42d","4dd835fd-20a9-40e3-9aa0-899ae48ad9d9"]
+ MetaData.Schema.EG1.Labels []
= MetaData.Schema.D20.A2 "TestCounter2Events"
+ MetaData.Schema.D20.FA11 true
- MetaData.Schema.D20.FA4
- MetaData.Schema.D20.FA15
```
Последняя строка `- MetaData.Schema.D20.FA4` выключает «После удаления записи» (по умолчанию включено, `entity-schema.md`). Если событие «После удаления» нужно — не пиши эту строку. Строка `- MetaData.Schema.D20.FA15` выключает «Проверку записи»: без неё у нового объекта включена «Проверка записи» (✅ подтверждено записью в CRM (29.10.2026), `entity-schema.md`).

**Что заменить при создании своего объекта:**
| Значение в шаблоне | Что это | Чем заменить |
|---|---|---|
| `714f45e1-...` | UId схемы (`descriptor.json`, `metadata.json`, `A3`/`A4` колонки) | новый GUID |
| `TestCounter2` | имя схемы (в `A2`, в `EG1.A2` как `<Имя>EventsProcess`, в `D20.A2` как `<Имя>Events`, в `CJ1`, в SQL скрипта) | своё имя |
| `11ab4bcb-...` | UId родителя (`BaseLookup`) — в `Parent.UId` и `D8` | `RealUId` своего родителя (см. `crm-db.md`, как узнать UId залоченных схем) |
| `<UId пакета>` | UId пакета (`B6`) | UId своего пакета из `Pkg/<Пакет>/descriptor.json` |
| `<Id пакета>` | `A5` | `SysPackage.Id` своего пакета (`metadata-editing.md`, поле A5) |
| `5ff80375-...`, `Counter`, `S2` | колонка `D2` | свои UId, имя, тип (`S2` из таблицы в `entity.md`) |
| `811177cb-...` | UId `EG1` — он же `A3`/`A4` всех элементов внутри `EG1` | новый GUID |
| `ea8b546f-...`, `c003ece1-...` | UId `LaneSet` и `Lane`; у Lane `IL2` и `CD4` = UId `LaneSet` | новые GUID |
| `abcea28a-...` | общий штамп `BL8` всех элементов `EG1` | новый GUID, одинаковый на всех элементах |
| `9281a9d2-...`, `5c425c2a-...`, `d7e11fc1-...`, `fd570195-...` | контейнер события, стартовое сообщение, скрипт, связь | новые GUID; ссылки `IL2`/`CI1`/`CI2` заменить согласованно |
| `CJ1` + флаг `D20.FA11` | событие «После сохранения записи» | для другого события — `CJ1` и номер флага по таблице в `entity-schema.md` |
| `CH1` | C#-код скрипта | свой код |

Версия `B8` в `metadata.json` и `CreatedInVersion` в `properties.json` — `<версия платформы>` (`metadata-editing.md`, поле `B8`): ✅ 06.10.2026 объект `TestDeliveryType` с `1.9.0.17103` (версия текущего Designer стенда) загрузился так же, как прежние с `7.18.5.1500`.

**Не менять** (платформенные константы): 6 строк `= ...BK4.[...].CK2.[...].BL7 "53818048-..."` (заглушки стандартных событий), UId заглушек в закрывающем списке `~ EG1.BK4` (набор по родителю, `entity-schema.md`), все значения `BL7` у элементов, `BL1`, `BL9`.

**Обязательно `- MetaData.Schema.D1`** (строка в шаблоне выше): родители `BaseLookup`/`BaseEntity` виртуальные, и без этой строки новый объект тоже станет виртуальным — без таблицы в БД; на клиенте ошибка «Невозможно построить выборку для виртуальной схемы». **Исправленная ошибка рецепта**: первые версии шаблона этой строки не содержали — `TestCounter2` и `TestColumns` были созданы виртуальными; это обнаружилось 28.09.2026, когда деталь попыталась загрузить записи. После добавления строки на существующий объект — «Обновить из файловой системы» и компиляция. 🧪 Таблица должна появиться при обновлении, как у нового объекта (`entity-columns-edit.md`, «Структура таблицы меняется»); переход «виртуальный → обычный» отдельно не проверялся. Если таблицы нет (`information_schema.tables`), в разделе «Конфигурация» — «Обновить структуру БД для требующих обновления».

✅ **Наследник `BaseEntity`** (06.10.2026, `TestTicket`): тот же шаблон, `Parent` в `descriptor.json` и `D8` = `1bab9dcf-17d5-49f8-9536-8e0064f1dce0`. Загрузился и с 18 UId в закрывающем `~ EG1.BK4`, но канон — как у объекта с тем же родителем (`entity-schema.md`, «ПОДТВЕРЖДЕНО: ручное создание EG1/CK2 с нуля РАБОТАЕТ»). Отображаемая колонка («Отображаемое значение», см. `D4` в `entity-schema.md`) задаётся строкой `+ MetaData.Schema.D4 "<UId колонки>"` — без неё раздел и поля-справочники на объект не знают, что показывать.

**✅ Объект без собственного события** (подтверждено 29.09.2026 на `TestProcEntity`, 6 колонок разных типов): тот же шаблон, но без блоков `+ MetaData.Schema.EG1.BK4 {...}` (контейнер события `ProcessSchemaEventSubProcess` и связь `SequenceFlow`), без их двух UId (`9281a9d2-...`, `fd570195-...`) в закрывающем списке `~ MetaData.Schema.EG1.BK4` (остаются платформенные UId родителя, `entity-schema.md`) и без строки `+ MetaData.Schema.D20.FA11 true`. `EG1` с дорожками `BK3`, 6 строк заглушек `...CK2...BL7` и `- MetaData.Schema.D20.FA4` остаются: `EG1` есть у всех 895 объектов проекта. Объект открылся в Designer со всеми колонками, без ошибок.

**Побочный эффект, подтверждённый в CRM**: после создания у объекта включены ещё два события — «Проверка записи» и «После удаления записи». Выключить «После удаления» можно строкой `- MetaData.Schema.D20.FA4` (она уже в шаблоне). Выключить «Проверку записи» — строка `- MetaData.Schema.D20.FA15` (✅ подтверждено записью в CRM (29.10.2026), `entity-schema.md`).

✅ **Наследник `BaseLookup` без своих колонок** (08.10.2026): тот же шаблон без строк `+ MetaData.Schema.D2 {...}` и без `~ MetaData.Schema.D2 [...]` — справочник загрузился с таблицей.

## ✅ Переопределить существующий объект (override) и добавить lookup-колонку
**Подтверждено**: override стандартного справочника `TimeZone` с новой lookup-колонкой `TestContact` → `Contact`, созданный вручную по шаблону ниже, после «Обновить из файловой системы» работает в CRM. Образец структуры — override в том же пакете.

**Файлы** (`Pkg/<Пакет>/`):
1. `Schemas/<Имя>/descriptor.json` — `Name` = имя существующей схемы, `Parent` указывает на неё же, `ExtendParent: true`:
```json
{
  "Descriptor": {
    "UId": "08197889-c5a4-4639-93a4-76bebd7d3be9",
    "Name": "TimeZone",
    "ModifiedOnUtc": "\/Date(1790455419000)\/",
    "Parent": {
      "UId": "a394a569-92d6-44d0-bdda-fa0578373b4f",
      "Name": "TimeZone"
    },
    "ExtendParent": true,
    "ManagerName": "EntitySchemaManager",
    "Caption": "Часовой пояс",
    "DependsOn": []
  }
}
```
`Descriptor.UId` — новый GUID этого override; `Parent.UId` — `RealUId` базовой схемы (для `TimeZone` взят из `Autogenerated/Src/TimeZoneSchema.Base.cs`).
2. `Schemas/<Имя>/properties.json` — тот же набор полей, что в рецепте создания объекта выше.
3. `Schemas/<Имя>/<Имя>.cs` — пустой файл.
4. `Schemas/<Имя>/metadata.json` — только дельта этого пакета. В отличие от новой схемы, у override НЕТ `A2` и `D8` (подтверждено на реальном override `Contact`):
```
= MetaData.Schema.UId "08197889-c5a4-4639-93a4-76bebd7d3be9"
= MetaData.Schema.A5 "<Id пакета>"
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B7 true
+ MetaData.Schema.D2 {"UId": "406c1b9f-43c1-4d95-b984-4da82334ded7", "A2": "TestContact", "A3": "08197889-c5a4-4639-93a4-76bebd7d3be9", "A4": "08197889-c5a4-4639-93a4-76bebd7d3be9", "A5": "<Id пакета>", "S2": "b295071f-7ea9-4e62-8d1a-919bf3732ff2", "S4": "16be3651-8fe2-4159-8dd0-a803d4683dd3", "E6": true, "E17": "TestContactId", "E18": "TestContactName"}
~ MetaData.Schema.D2 ["406c1b9f-43c1-4d95-b984-4da82334ded7"]
```
`= MetaData.Schema.B7 true` — признак замещения (Designer пишет его во все замещения объектов). В исходном ручном `TimeZone` его не было и колонка добавилась, но для клиентских схем без него база не подключается — пиши всегда.

Lookup-колонка: `S2` = `b295071f-7ea9-4e62-8d1a-919bf3732ff2` (тип LOOKUP), `S4` = `RealUId` целевого объекта (здесь `Contact`), `E17` = `<Колонка>Id`, `E18` = `<Колонка>Name`; `E6: true` — это «Индексируемая» (для lookup обычно включают, но не обязательно). В закрывающем списке `~ D2` — только колонки, добавленные этим пакетом.

✅ **Закрывающий список `~ D2` в существующем замещении** (файлы проверены 07.10.2026): замещения, сохранённые Designer, часто перечисляют в этом списке ВСЕ колонки схемы, а не только свои — в реальном проекте одно замещение `Activity` с 80 своими колонками перечисляло 205 UId, другое с 10 — 86. Чужие UId из списка не удаляй, новую колонку допиши в его конец. В новом замещении, созданном вручную, достаточно своих колонок (`TimeZone`, ✅). Подтверждено 07.10.2026: lookup-колонка `TestTicket` дописана в замещение `Activity` (UId — в конец полного списка), после «Обновить из файловой системы» и компиляции колонка `TestTicketId` появилась в таблице `Activity`, деталь активностей на карточке заявки по ней фильтруется.

✅ **Каскадное удаление и ссылка на объект своего пакета** (06.10.2026, `TestTicketComment.Ticket` → `TestTicket`): `"E9": true` — «Удалять зависимые записи». Платформа создаёт внешний ключ `ON DELETE CASCADE` (по коду платформы: при `IsCascade` создаётся `DELETE_ACTION = 'C'`), то есть зависимые записи удаляет СУБД — события объекта и слушатели у них, по всей видимости, не срабатывают (не проверено). Для lookup на новый объект того же пакета `S4` = `UId` из его `descriptor.json`; деталь фильтруется по такой колонке. Удаление заявки вместе с комментариями пользователь подтвердил общим «всё работает».

5. `Resources/<Имя>.Entity/resource.ru-RU.xml` и `resource.en-US.xml` — ТОЛЬКО подписи новых колонок (`Columns.TestContact.Caption`), без `Caption` самой схемы: у override ресурсный файл пакета содержит только то, что добавил этот пакет.

✅ **Замещение в пакете, где его ещё нет** (подтверждено в CRM, 08.10.2026): `Parent.UId` = RealUId базовой схемы из `Autogenerated/Src/<Объект>Schema.<Пакет>.cs` (для `Activity` — `c449d832-a4cc-4b01-b9d5-8a12c42a9f89`); в закрывающем `~ D2` — только свои колонки; пакету хватило зависимости от `ProductCore`.

## ✅ Наследник объекта, родитель которого замещён в другом пакете (подтверждено в CRM, 23.10.2026)
- Признак: компиляция падает с `CS0311` в `Autogenerated/Src/<Объект>Schema.<Пакет>.cs` («The type 'TEntity' cannot be used as type parameter…»), в интерфейсе объект не работает. Причина: родитель объекта (например, `BaseTag`) замещён в пакете, от которого пакет наследника не зависит. Генератор собирает класс объекта от незамещённого родителя (`public class <Объект> : …<Родитель>`), а процесс событий — от замещения (`<Родитель>_<ПакетЗамещения>EventsProcess<TEntity>`), и ограничение `where TEntity` не сходится. Проверка: в БД родитель схемы (`"SysSchema"."ParentId"`) и цепочка `"SysPackageDependency"` пакета наследника — нет ли в ней пакета с замещением родителя.
- Лечение: добавь пакету наследника зависимость от пакета с замещением (`DependsOn` в `descriptor.json` пакета, свежий `ModifiedOnUtc`), затем обнови `ModifiedOnUtc` в `descriptor.json` самой схемы-наследника (без этого компиляция изменённого её не перегенерирует, см. `metadata-editing.md`), «Обновить из файловой системы» и компиляция.

## События объекта
Процесс событий (`EG1`/`CK2`), скрипты «Перед сохранением» и «После сохранения», журнал изменений — в `entity-events-edit.md`.

## ✅ Иерархический справочник (наследник `BaseHierarchicalLookup`)
**Подтверждено записью в CRM (21.10.2026).** Создай справочник по рецепту выше с `Parent`/`D8` = `5a39bd7c-8880-456c-aaf7-7645ce114e62` и переопредели унаследованную колонку `Parent`, иначе «Обновить из файловой системы» падает с «У колонки "Родитель" не указана ссылка на справочник»:
```
+ MetaData.Schema.D2 {
  "UId": "527b9e4e-7dbf-4721-a112-72b423b3365a",
  "A2": "Parent",
  "A3": "5a39bd7c-8880-456c-aaf7-7645ce114e62",
  "A4": "<UId нового объекта>",
  "A5": "<A5 пакета>",
  "S2": "b295071f-7ea9-4e62-8d1a-919bf3732ff2",
  "S4": "<UId нового объекта>",
  "E17": "ParentId",
  "E18": "ParentName"
}
```
UId колонки `527b9e4e-…` добавь в список `~ MetaData.Schema.D2 [...]`. `A3` — схема, где колонка создана (родитель), `A4` и `S4` — новый объект. Результат: колонка `ParentId` с внешним ключом на сам объект. Тот же приём — для любого унаследованного справочного поля, которое должно ссылаться на наследника (так делает код платформы: `CreateParentColumn` с `ReferenceSchemaUId` наследника).

## ✅ Деактивация записей
`= MetaData.Schema.D32 true` в `metadata.json` (подтверждено 21.10.2026): колонка `RecordInactive`. Неактивные записи скрываются только в окнах выбора справочника (`entity.md`); в своих запросах учитывай колонку сам или ставь `useRecordDeactivation: true`.

## ✅ Удалить объект (схему) целиком

Общий порядок удаления схемы (проверка зависимостей, две папки, «Обновить из файловой системы») — `metadata-editing.md`, «Удаление схемы». Объект-специфика:
- Таблица объекта и `Sys<Объект>Lcz` после удаления остаются в БД (`entity.md`, «✅ Удаление объекта оставляет таблицы»). Их удаляет SQL-скрипт пакета, если нужно.
