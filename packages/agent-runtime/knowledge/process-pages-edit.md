# Процессы: страницы пользователю — рецепты

Часть рецептов из `process-edit.md` (там — общее для всех: чек-лист «Проверка перед сдачей процесса», создание процесса, настройки и параметры). Здесь: «Преднастроенная страница», «Автогенерируемая страница». Факты о страницах процесса — `process-user-pages.md`, модель действий — `user-task.md`. Общая механика — `metadata-editing.md`. ✅ — проверено записью в CRM, 🧪 — не проверено.

## ✅ Элемент «Преднастроенная страница» (страница пользователю посреди процесса)
**Шаблоны**: элемент — `templates/process/preconfigured-page.json`, страница — папка `templates/process/preconfigured-page-schema/` (из подтверждённого теста; что заменить — в поле `about`). Бери их, если в проекте нет своих образцов.
**Подтверждено записью в CRM**: процесс открыл текущему пользователю страницу с заголовком из `Title`, полем «Комментарий» и кнопками «Подтвердить»/«Закрыть» (задача появилась в панели задач справа); после «Подтвердить» формула прочитала введённое значение, задание-сценарий записал его.

**Способ — клонирование** (общий приём — `process-data-edit.md`, «Общий приём клонирования элемента-действия»): страница — клон любой страницы проекта с родителем `BasePageSimpleProcessTemplate` (`rg -l 5826ff24-46c6-4169-9223-2aaad9ec2e18 Pkg`); элемент — клон любого элемента проекта с `J6` = `ac2ef13c-30dd-4023-9c04-58f580743b48` (`rg -l ac2ef13c-30dd-4023-9c04-58f580743b48 Pkg`): сам элемент из `BK4`, все его маппинги из `BK15` (у которых `GT2` содержит UId элемента) и строки ресурсов `BaseElements.<Имя элемента>.*` обеих локалей. Если образцов нет — попроси пользователя собрать элемент и страницу в Designer.

### 1. Страница (клиентская схема)
- `descriptor.json`: `Parent` = `{"UId": "5826ff24-46c6-4169-9223-2aaad9ec2e18", "Name": "BasePageSimpleProcessTemplate"}`, `ManagerName: "ClientUnitSchemaManager"`; `properties.json`: `"SchemaType": "EditViewModelSchema"`. Другие шаблоны в проекте: `BasePageProcessTemplate`, `BasePageLeftContainerProcessTemplate`.
- `metadata.json` (журнал):
```
= MetaData.Schema.UId "<UId страницы>"
= MetaData.Schema.A2 "<Имя>"
= MetaData.Schema.A5 "<Id пакета>"
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "<версия платформы>"
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
- При клонировании по общему приёму замени UId процесса, элемента, дорожки, параметров и маппингов; дополнительно: UId страницы образца в `ClientUnitSchemaUId` и его маппинге, UId параметра страницы образца в `SourceParameterUId`. `A5` = UId пакета.
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

## ✅ Элемент «Автогенерируемая страница» (AutoGeneratedPageUserTask)
**Шаблон**: `templates/process/auto-page.json` — элемент, маппинги и ресурсы из подтверждённого теста (что заменить — в поле `about`). Бери его, если в проекте нет своего элемента с тем же `J6`.
**Подтверждено записью в CRM**: исполнителю пришла задача с заголовком страницы, страница открылась с обязательным полем «Комментарий» и кнопками Ok/Отмена; после ввода и Ok формулы прочитали текст поля и код кнопки.

**Способ — клонирование**: образец — любой элемент проекта с `J6` = `b5936328-09b2-45fd-b763-48d37c265644` (`rg -l b5936328-09b2-45fd-b763-48d37c265644 Pkg`; ресурсы `BaseElements.<Имя элемента>.*`); кнопки — с такого же элемента, где есть нужный набор кнопок. Приём клонирования — `process-data-edit.md`, «Общий приём клонирования элемента-действия»; `A5` = UId пакета.
- `BL7` = `J6` = `b5936328-09b2-45fd-b763-48d37c265644`, `BO2: true`, `BP7` = `{JH1: <UId OwnerId>, JH2: <UId RoleId>, JH3: 1}`.
- Поле страницы — свой параметр элемента в `BP2` (`A3` = UId процесса, без маппинга; у образца `Message`, `L1` `8b3f29bb-ea14-4ce5-a5c5-293a929b6ba2`), `L8` — `{GS5: <UId процесса>}` или начальное значение. Введённое значение читай ссылкой `[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId элемента>}].[Parameter:{<UId параметра поля>}]#]`; нажатую кнопку — так же, параметр `PressedButtonCode` (значение = `name` кнопки, например `Ok`).
- Содержимое страницы — в ресурсах элемента (обе локали, значения XML-экранированы):
  - `Parameters.Title.Value` и `.DisplayValue` — заголовок страницы и задачи;
  - `Parameters.Elements.Value` и `.DisplayValue` — JSON-список полей; `$type` списка и элемента — как у образца (`List` и `Dictionary` из `mscorlib`, строку `$type` скопируй из ресурса образца); элемент поля: `{"Id": "<GUID>", "controlEditType": "1", "caption": "Комментарий", "name": "Message", "text": "", "isMultiline": true, "isRequired": true, "canBeMinimized": true, "minimized": false, "dataSource": null, "dataFilter": "", "controlDataValueType": "10", "dateTimeFormat": "7"}` — `name` поля = `A2` параметра в `BP2`;
  - `Parameters.Buttons.Value` и `.DisplayValue` — JSON-список кнопок того же `$type`: элементы `{"Id", "isEnabled": true, "performValidation": true|false, "caption", "name": "Ok", "style": "green"|"blue", "generateSignal": "Ok"}`.
- В `BP2` элемента параметры `Title`, `Buttons`, `Elements` — `{GS1: 1, GS5: <UId процесса>}`: значение берётся из ресурса.
- ✅ **Ветвление по нажатой кнопке прямо от страницы, без шлюза** : от элемента страницы выходят условный поток к записи данных с `"CI3": "[#[IsOwnerSchema:false].[IsSchema:false].[Element:{<UId страницы>}].[Parameter:{<UId параметра PressedButtonCode>}]#] == \"Ok\""` и поток по умолчанию к завершению — «Отмена» заканчивает процесс без записи. Типы потоков — `process-flow-edit.md`, «Шлюзы и условные потоки». Подтверждающей кнопке — `"performValidation": true` (с пустым обязательным полем страница не проходит дальше), кнопке «Отмена» — `"performValidation": false`.
- ✅ **Остальные типы полей** (подтверждено записью в CRM: поля собраны в Designer, страница показала все поля, процесс завершился после Ok): `controlEditType` — `"1"` строка (`isMultiline: false`), `"12"` логическое, `"4"` целое, `"5"` дробное, `"DateTimeField"` дата и время (`dateTimeFormat` `"7"`; `"8"` — дата; в списке Designer есть ещё «Время»). `controlDataValueType` у этих полей Designer пишет `null`. Тип параметра поля в `BP2` (`L1`, GUID — `crm-db.md`, «Типы данных: GUID и коды»): `TEXT`, `BOOLEAN`, `INTEGER`, `FLOAT`, `DATE_TIME`; у логического `L8` = `{GS2: "false", GS5: <UId процесса>}`. Designer дублирует JSON `Elements` и `Buttons` в `GT1.GS2` их маппингов `BK15` (`GS1: 1`). Кнопка со стилем «По умолчанию» — `"style": "transparent-orange"`, `"generateSignal": ""`. Типы элементов в списке Designer: комментарий, группа полей, строковое, справочник, логическое, дата/время, целое, дробное.

- ✅ **Поля автогенерируемой страницы** (подтверждено в CRM, шаблон `templates/process/auto-page.json` на проекте без образцов): многострочный текст; справочник — `controlEditType` `SelectionField`, `controlDataValueType` `10`, `dataSource` = UId объекта справочника; дата без времени — `DateTimeField` с `dateTimeFormat` `8`. Обязательное поле не пускает дальше; значение справочника подставляется из параметра процесса.
