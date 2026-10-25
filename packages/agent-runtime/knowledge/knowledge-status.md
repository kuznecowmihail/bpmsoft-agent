# Что подтверждено записью в CRM

Таблица операций по типам схем: что проверено реальной записью, а не только чтением. Рецепты — в файлах `<тип>-edit.md`; общая механика — в `metadata-editing.md`.

## Известный статус: что реально подтверждено ЗАПИСЬЮ (не только чтением)
| Операция | Тип схемы | Статус |
|---|---|---|
| Добавить простую колонку (`D2`) и её подпись в `resource.xml` | Entity | ✅ подтверждено (`TestEntity`, колонка `ManualWrite`), см. `entity-columns-edit.md` |
| Создать объект с нуля за один шаг: 4 файла + ресурсы, колонка, событие `EG1`/`CK2` с флагом `D20.FA11` | Entity | ✅ подтверждено (с 28.09.2026 шаблон содержит обязательную `- MetaData.Schema.D1`, без неё объект виртуальный) (`TestCounter2` открылся в CRM без ошибок, событие активно), см. `entity-edit.md` |
| Скрипты событий «Перед сохранением» / «После сохранения» (что сохраняется, как дописать после сохранения) | Entity | ✅ `entity-events-edit.md` |
| Соответствие чекбоксов событий объекта и флагов `D20.FA<N>` | Entity | ✅ подтверждено (серия из 10 экспериментов), см. `entity-schema.md` |
| Override существующего объекта (`ExtendParent: true`) + lookup-колонка (`S4`/`E6`/`E17`/`E18`) | Entity | ✅ подтверждено (`TimeZone` с колонкой `TestContact` → `Contact`), см. `entity-edit.md` |
| Колонки разных типов со свойствами: обязательность `E2`, значение по умолчанию `E12` (константа и системное значение), индексируемая `E6`, журнал `E16`, многострочный `E19` | Entity | ✅ подтверждено (`TestColumns`, 7 колонок), см. `entity-columns-edit.md` |
| Удалить схему: папки `Schemas/<Имя>/` и `Resources/<Имя>.<Категория>/`, затем «Обновить из файловой системы» в CRM | любой | ✅ подтверждено записью 05.10.2026: 25 схем разных типов и SQL-скрипт за одно обновление, см. `entity-edit.md` |
| Собрать полную иерархию клиентской схемы и все секции родителя (скрипт) | ClientUnit | ✅ проверено чтением на 3 схемах, 0 ошибок; по нему написаны и подтверждены в CRM все клиентские схемы шагов 1–13 (28–29.09.2026) ✅, см. `client-schemas-edit.md` |
| Добавить индекс (`D6`): уникальный, составной, сортировка «По убыванию» (`G2`) | Entity | ✅ подтверждено (`TestColumns`), см. `entity-columns-edit.md` |
| Изменить колонку (подпись, тип `S2`, обязательность `E2` строками журнала) и удалить колонку | Entity | ✅ подтверждено (`TestColumns`), см. `entity-columns-edit.md` |
| Новая карточка (Page) с нуля: вёрстка (`insert`), строки, атрибуты с `dependencies`, методы с `callParent`, `rules`, валидация, кнопка | ClientUnit | ✅ подтверждено (`TestColumnsPage`), см. `client-pages-edit.md` |
| Замещение карточки: `merge`/`remove` элементов родителя, порядок вкладок через `order`, частичное переопределение атрибута, `getActions`, совмещённый режим | ClientUnit | ✅ подтверждено (`ProductPageV2`), см. `client-pages-edit.md` |
| Новая деталь-реестр, подключение к карточке (`details` + `diff`, заголовок `<Ключ>DetailCaptionOnPage`), регистрация `SysDetail`, правка боевого замещения (CRLF) | ClientUnit / Data | ✅ подтверждено (`TestColumnsDetail` на `ContactPageV2`), см. `client-pages-edit.md`, `registration-edit.md` |
| Замещение детали: `initDefaultCaption` с `callParent`, кнопка на панели, `remove` колонки реестра | ClientUnit | ✅ подтверждено (`ContactAddressDetailV2`), см. `client-pages-edit.md` |
| Новый раздел (Section) с `getSectionActions`; кнопка карточки в совмещённом режиме (`publishPropertyValueToSection` + `CombinedModeActionButtonsCardLeftContainer` / `onCardAction`) | ClientUnit | ✅ подтверждено (`TestColumnsSection`), см. `client-pages-edit.md` |
| Замещение раздела: кнопка в панели реестра, `merge` кнопки родителя, `getSectionActions`, кнопка раздела → метод замещения карточки (`onCardAction` + `tag`) | ClientUnit | ✅ подтверждено (`ProductSectionV2`), см. `client-pages-edit.md` |
| Признак замещения `B7` в metadata замещающей схемы (клиентской и объекта) | ClientUnit / Entity | ✅ подтверждено: без `= MetaData.Schema.B7 true` клиент собирает замещение без базовых слоёв; см. `client-schemas.md` |
| Наследник своей карточки (`B7 false`) и одноимённые элементы в разных контейнерах (`merge`/`remove` берут первый по обходу вёрстки) | ClientUnit | ✅ `client-schemas-hierarchy.md`, `client-pages-edit.md` |
| Замещение мини-карточки (`merge`/`insert` в `MiniPage`, `onEntityInitialized`) | ClientUnit | ✅ подтверждено (`LeadMiniPage`), см. `client-pages-edit.md` |
| Новая мини-карточка + регистрация в `SysModuleEdit` (`MiniPageSchemaUId`, `MiniPageModes`, `IsForceUpdate`) | ClientUnit / Data | ✅ подтверждено (`TestColumnsMiniPage`), см. `client-pages-edit.md` |
| Новый модуль (`BaseModule`, формат B), встраивание через контейнер + `sandbox.loadModule`, сообщения PTP в обе стороны | ClientUnit | ✅ подтверждено (`TestModule` в `TestColumnsPage`), см. `client-logic-edit.md` |
| Новый миксин (`configuration.mixins.*`, `Ext.create`), подключение через зависимость `define` + блок `mixins`, строки миксина | ClientUnit | ✅ подтверждено (`TestMixin` в `TestColumnsPage`), см. `client-schemas-edit.md` |
| Патч существующего класса (`Ext override`, отдельная схема `Module`), подключение через зависимость `define` | ClientUnit | ✅ подтверждено (`TestModuleOverride`), см. `client-schemas-edit.md` |
| Стили схемы (`.less` + `css!<Схема>`), отдельная схема стилей, картинки (`HD8` + `Images.<GUID>.Image`, `imageConfig`) | ClientUnit | ✅ подтверждено (`TestColumnsPage`, `TestStylesCSS`), см. `client-schemas-edit.md` |
| Процесс с нуля (Старт → Задание-сценарий → Завершение) | Process | ✅ `process-edit.md` |
| Настройки процесса, параметры процесса, элементы «Читать данные» (в т.ч. агрегация), «Формула», «Добавить данные», «Изменить данные», «Удалить данные» | Process | ✅ `process-edit.md` (настройки, параметры), `process-data-edit.md` (элементы) |
| Шлюзы (исключающий, параллельный, «ИЛИ»), условные потоки и потоки по умолчанию | Process | ✅ `process-flow-edit.md` |
| Методы процесса (`BK32`), `using` (`B3`), `Set`/`Get` между заданиями | Process | ✅ `process-flow-edit.md` |
| Стартовый сигнал по объекту (добавлена / изменена колонка + фильтр) | Process | ✅ `process-flow-edit.md` |
| Стартовый таймер (cron), промежуточный таймер, ожидание сигнала по записи | Process | ✅ `process-flow-edit.md` |
| Запуск процесса с клиента (`ProcessModuleUtilities`) и из C# (`ProcessExecutor`) | Process | ✅ `process-run-edit.md` |
| Подпроцесс с входными и выходными параметрами | Process | ✅ `process-flow-edit.md` |
| «Связать объект с процессом»; дорожки (в Designer стенда не поддерживаются — одна дорожка) | Process | ✅ `process-tasks-edit.md`, дорожки — `process-edit.md` |
| Своё действие процесса (`ProcessUserTaskSchemaManager`, `.cs`) с нуля, элемент «Выполнить действие процесса» в процессе, изменение действия и обновление процессов, где оно стоит, удаление и переименование параметра действия | ProcessUserTask / Process | ✅ `user-task-edit.md` |
| Преднастроенная страница: своя страница (наследник `BasePageSimpleProcessTemplate`, поля в `HD11`) и элемент процесса клонированием | Process / ClientUnit | ✅ `process-tasks-edit.md` |
| Элемент «Отправить email» (произвольное письмо) | Process | ✅ `process-tasks-edit.md` (структура и Designer; доставка не проверена — на стенде нет почтового ящика) |
| Сквозной процесс по событию объекта: сигнал с фильтром по пути, «Читать данные» и «Изменить данные» с фильтром по параметру, формулы с датами (задача 3 — возраст контакта при создании лида) | Process | ✅ `process-tasks-edit.md` |
| Генерирующий сигнал и старт по произвольному сигналу (формат Designer, запуск проверен) | Process | ✅ `process-flow-edit.md` |
| Элемент «Автогенерируемая страница» (поле, кнопки, чтение введённого значения и нажатой кнопки) | Process | ✅ `process-tasks-edit.md` |
| Подпроцесс по коллекции записей (multi-instance) и «Читать данные» в режиме коллекции | Process | ✅ `process-flow-edit.md`, «Читать данные» в режиме коллекции — `process-data-edit.md` |
| Макросы в значениях параметров (текущие дата, время, пользователь, системная настройка, запись справочника) | Process | ✅ `process-edit.md` |
| Элементы «Выполнить задачу», «Открыть страницу редактирования» (с предзаполнением полей), «Вопрос пользователю» | Process | ✅ `process-tasks-edit.md` (с ветвлением по ответу и чтением выбранного ответа) |
| Прочие элементы процессов: «Отправить email», преднастроенная страница, «Вопрос пользователю», «Открыть страницу редактирования», «Связать объект с процессом», «Выполнить действие процесса», сигналы, таймеры, подпроцессы | Process | ✅ 09.10.2026 (process-tasks-edit.md); «Выполнить задачу» и автогенерируемая страница на проекте без образцов — 🧪 |
| Веб-сервис (`ServiceSchemaManager`): сервис, метод, параметры; элемент «Вызвать веб-сервис» | Service / Process | ✅ подтверждено записью в CRM (21.10.2026, `TestWebService` + `TestProcWebService`: сервис, элемент, выполнение); см. `web-service.md`, `web-service-edit.md` |
| Аутентификация REST-сервиса (`IQ5` Basic, `IR4`), значения из системных настроек (`IV2: 2`), вызов из C# (`IServiceSchemaClient`) | Service / SourceCode | ✅ подтверждено (22.10.2026), `web-service.md`, `web-service-edit.md` |
| SqlScript (новый скрипт, выполняется при «Обновить из файловой системы») | SqlScript | ✅ `sql-script-edit.md` |
| SourceCode: класс-помощник с локализуемой строкой, REST-сервис, слушатель событий объекта, изменение кода, вызов из процесса, слушатель событий приложения и ClassFactory, подмена платформенного класса (ReBind), чтение системной настройки | SourceCode | ✅ `source-code-edit.md`, `server-events-edit.md` |
| Data: системная настройка и её значение (`SysSettings` + `SysSettingsValue`), записи справочника с переводом, изменение данных и IsForceUpdate, удаление записей SQL-скриптом, набор для таблицы с колонками-справочниками, числом, логическим и датой (`InstallType` 1/2 при обновлении из ФС строк не загружают) | Data | ✅ `data-edit.md` |
| Data: наборы регистрации, справочника, детали, иконки, системной настройки | Data | ✅ 08.10.2026 (registration-edit.md, data-edit.md, templates/data/); прочие таблицы — 🧪 |
| Регистрация раздела (`SysModuleEntity`, `SysModule`, `SysModuleEdit`, `SysModuleInWorkplace`) и детали (`SysDetail`) | Data | ✅ подтверждено (раздел `TestColumns`); мини-карточка (`MiniPageSchemaUId` + `MiniPageModes` в строке `SysModuleEdit` нужного типа) — ✅ (`LeadMiniPage` для типа «Партнёры»), см. `registration-edit.md` |
| Справочник в разделе «Справочники» (набор `Lookup_<Объект>`, таблица `Lookup`) | Data | ✅ `registration-edit.md` |
| Колонки реестра нового раздела по умолчанию (переопределение `getDefaultSectionGridProfile`) | ClientUnit | ✅ подтверждено 06.10.2026 (`TestTicketSection`), см. `client-logic-edit.md` |
| Редактируемая деталь (`ConfigurationGrid`, запреты по строке) | ClientUnit | ✅ подтверждено 06.10.2026 (`TestTicketCommentDetail`), см. `client-logic-edit.md` |
| Деталь только для просмотра (без добавления, изменения, копирования, удаления) | ClientUnit | ✅ подтверждено 07.10.2026 (`TestTicketPriorityLogDetail`), см. `client-logic-edit.md` |
| Подсказка у поля карточки (`tip` с `bindTo` на строку ресурсов) | ClientUnit | ✅ подтверждено записью в CRM (15.10.2026), рецепт — `client-pages-edit.md` |
| Журнал изменений объекта (`D24` + `E16` у колонок, таблица `Sys<Объект>Log`) | Entity | ✅ подтверждено (21.10.2026), `entity-events-edit.md` |
| Администрирование по операциям (`D15`), по записям (`D17`), по колонкам (`D16`); права по операциям и системные операции данными, права по умолчанию и на колонки SQL-скриптом | Entity / Data / SqlScript | ✅ подтверждено (21.10.2026), `rights-edit.md` |
| Порядок SQL-скриптов через `DependsOn` (`{UId, Name}`) | SqlScript | ✅ подтверждено (21.10.2026), `sql-script.md` |
| Набор данных с `InstallType: 2` при «Обновить из файловой системы» (обновляет существующие записи, новые не добавляет) | Data | ✅ подтверждено (21.10.2026), `data.md` |
| Иерархический справочник (наследник `BaseHierarchicalLookup`, переопределение `Parent`), деактивация записей `D32`, значения по умолчанию `CurrentDate`/`CurrentUser`/`SequentialGuid`, ссылка на представление с `E8` | Entity | ✅ подтверждено (21.10.2026), `entity-edit.md` |
| Группы в разделе: `<Объект>Folder` (`BaseFolder`) и `<Объект>InFolder` (`BaseItemInFolder`), `FolderMode`, `UseStaticFolders` в разделе | Entity / Data / ClientUnit | ✅ подтверждено (21.10.2026), `registration-edit.md` |
| Новое рабочее место (`SysWorkplace` + `SysModuleInWorkplace` + `SysAdminUnitInWorkplace` данными) | Data | ✅ подтверждено (21.10.2026), `registration-edit.md` |
| Карточки по типам (`TypeColumnUId` в `SysModuleEntity`, строки `SysModuleEdit` с `TypeColumnValue`, `ActionKindName`/`ActionKindCaption`) | Data | ✅ подтверждено (21.10.2026), `registration-edit.md` |
| Задание по расписанию на C# (`IJobExecutor`, `AppScheduler`): постановка, обновление, внеочередной и разовый запуск, снятие кодом и SQL | SourceCode | ✅ подтверждено (24.10.2026), `server-background-edit.md` |
| Фоновая задача (`Task.StartNewWithUserConnection`) | SourceCode | ✅ подтверждено (24.10.2026), `server-background-edit.md` |
| Файлы записи: запись, чтение и удаление из C#, загрузка и чтение через OData | SourceCode / OData | ✅ подтверждено (24.10.2026), `files.md` |
| Свой кеш (`ApplicationCache`, `WorkspaceCache`, `SessionCache`), Redis | SourceCode | ✅ подтверждено (24.10.2026), `platform-api.md` |
| Дата и время: UTC в БД, `GetCurrentDateTime` и `UtcNow` через `Entity` | SourceCode | ✅ подтверждено (24.10.2026), `platform-api.md` |
| ESQ: постраничность, функции, агрегат по детали с условием, `IsDistinct`; `CustomQuery`; проверка псевдонимов | SourceCode | ✅ подтверждено (24.10.2026), `server-data-api.md` |
| Пользователь через `AdministrationService.UpdateOrCreateUser` | REST | ✅ подтверждено (24.10.2026), `rights.md` |
| Порядок замещений между пакетами | любой | ✅ на реальных схемах стенда (24.10.2026), `metadata-editing.md` |
| OData: `$count`, `$metadata`, `$batch` (JSON) | OData | ✅ подтверждено (24.10.2026), `integration-api.md` |
| Своя запись в журнале аудита (`SysOperationAudit`) | SourceCode | ✅ подтверждено (24.10.2026), `server-data-api.md` |
| Удаление пользователя (`AdministrationService.DeleteUser`) | REST | ✅ подтверждено (24.10.2026), `rights.md` |
| Исключение в задании-сценарии и `ProcessExecutor.Execute` (`ProcessStatus`) | Process | ✅ подтверждено (24.10.2026), `processes.md`, `process-run-edit.md` |
| Функциональная роль и роли пользователя через `AdministrationService` | REST | ✅ подтверждено (24.10.2026), `rights.md` |
| CSP через `appsettings.json`; анонимный сервис без `SpecifyWebOperationIdentity` | appsettings | ✅ подтверждено (24.10.2026), `client-schemas.md`, `integration-api.md` |
| Компиляция без обновления теряет новые файлы | любой | ✅ подтверждено (24.10.2026), `metadata-editing.md` |
| Вебхук файлами (`WebhookSchemaManager`): метаданные, публикация при старте по `IR9`, вызов с cookie пользователя | Webhook | ✅ подтверждено (25.10.2026), `webhook.md`, `webhook-edit.md` |
| Импорт из Excel: сохранение через `Entity` (события объекта), тег импорта, ключевые колонки, `FileImportParameters`, требования к файлу | FileImport | ✅ подтверждено (25.10.2026), `file-import.md` |
| Поиск дублей при сохранении (`SearchDuplicatesService`), правила `DuplicatesRule` | REST / данные | ✅ подтверждено (25.10.2026), `duplicates.md` |
| Веб-форма: анонимная отправка, проверка `Referer` | REST | ✅ подтверждено (25.10.2026), `integration-api.md` |
| Текущий пользователь запроса (`UserInfoService.svc/GetCurrentUserInfo`, только POST) | REST | ✅ подтверждено (25.10.2026), `integration-api.md` |
| `Web` контрагента, заданный в карточке до сохранения, сохраняется на базовой платформе | Account | ✅ подтверждено (25.10.2026), `process-tasks-edit.md` |
| Кейс файлами (`DcmSchemaManager`): стадии, переходы, наборы `SysDcmSettings` и `SysDcmSchemaInSettings`, шаг «Выполнить задачу» со связью с записью, автопереход, условие запуска, удаление | Dcm | ✅ подтверждено (25.10.2026), `dcm.md`, `dcm-edit.md` |
| Кейс: новая версия файлами, выключение (`Enabled`) | Dcm | 🧪 версия снята с дизайнера, файлами не проверена; `Enabled` в `properties.json` ❌ не выключает, `dcm.md` |
| Раздел «Переводы» (`SysTranslation`), применение переводов | данные | 🧪 не проверено, `metadata-editing.md` |
