# Что подтверждено записью в CRM

Таблица операций по типам схем: что проверено реальной записью, а не только чтением. Рецепты — в файлах `<тип>-edit.md`; общая механика — в `metadata-editing.md`.

## Известный статус: что реально подтверждено ЗАПИСЬЮ (не только чтением)
| Операция | Тип схемы | Статус |
|---|---|---|
| Что дизайнеры пишут в файлы: сразу в `Pkg` (объект, процесс, исходный код, клиентские схемы, действие процесса) или только в БД (веб-сервисы, SQL-сценарии, вебхуки, DCM); выгрузка в ФС после компиляции и сохранения клиентской схемы | любой | ✅ подтверждено записью в CRM, `metadata-editing.md`, «Что дизайнеры пишут в файлы» |
| Добавить простую колонку (`D2`) и её подпись в `resource.xml` | Entity | ✅ подтверждено, `entity-columns-edit.md` |
| Создать объект с нуля за один шаг: 4 файла + ресурсы, колонка, событие `EG1`/`CK2` с флагом `D20.FA11` | Entity | ✅ подтверждено; шаблон содержит обязательную `- MetaData.Schema.D1`, без неё объект виртуальный, `entity-edit.md` |
| Скрипты событий «Перед сохранением» / «После сохранения» (что сохраняется, как дописать после сохранения) | Entity | ✅ `entity-events-edit.md` |
| Соответствие чекбоксов событий объекта и флагов `D20.FA<N>` | Entity | ✅ подтверждено, `entity-schema.md` |
| Проверка записи: строка `- MetaData.Schema.D20.FA15` в `metadata.json` выключает чекбокс (без неё чекбокс у нового объекта включён) | Entity | ✅ подтверждено записью в CRM, `entity-schema.md` |
| Удаление таблиц объекта SQL-ом: сначала `Sys<Объект>Lcz` (внешний ключ на объект), потом `<Объект>` | Entity | ✅ подтверждено записью в CRM, `entity.md`, «Удаление объекта оставляет таблицы» |
| Override существующего объекта (`ExtendParent: true`) + lookup-колонка (`S4`/`E6`/`E17`/`E18`) | Entity | ✅ подтверждено, `entity-edit.md` |
| Колонки разных типов со свойствами: обязательность `E2`, значение по умолчанию `E12` (константа и системное значение), индексируемая `E6`, журнал `E16`, многострочный `E19` | Entity | ✅ подтверждено, `entity-columns-edit.md` |
| Удалить схему: папки `Schemas/<Имя>/` и `Resources/<Имя>.<Категория>/`, затем «Обновить из файловой системы» в CRM | любой | ✅ подтверждено записью в CRM, `metadata-editing.md`, «Удаление схемы» |
| Собрать полную иерархию клиентской схемы и все секции родителя (скрипт) | ClientUnit | ✅ подтверждено записью в CRM, `client-schemas-edit.md` |
| Добавить индекс (`D6`): уникальный, составной, сортировка «По убыванию» (`G2`) | Entity | ✅ подтверждено, `entity-columns-edit.md` |
| Изменить колонку (подпись, тип `S2`, обязательность `E2` строками журнала) и удалить колонку | Entity | ✅ подтверждено, `entity-columns-edit.md` |
| Новая карточка (Page) с нуля: вёрстка (`insert`), строки, атрибуты с `dependencies`, методы с `callParent`, `rules`, валидация, кнопка | ClientUnit | ✅ подтверждено, `client-pages-edit.md` |
| Бизнес-правила карточки: `rules` BINDPARAMETER, FILTRATION, POPULATE_ATTRIBUTE; `businessRules` BINDPARAMETER; `businessRulesMultiplyActions` (VISIBLE + REQUIRED, вложенная группа ИЛИ); отключение правила родителя через `businessRules` с `removed: true`, через `rules` с `enabled: false` и правила `businessRulesMultiplyActions` тем же Id с `enabled: false`; правило без `metaPath` | ClientUnit | ✅ подтверждено, `client-rules-edit.md` |
| Замещение карточки: `merge`/`remove` элементов родителя, порядок вкладок через `order`, частичное переопределение атрибута, `getActions`, совмещённый режим | ClientUnit | ✅ подтверждено, `client-pages-edit.md` |
| Новая деталь-реестр, подключение к карточке (`details` + `diff`, заголовок `<Ключ>DetailCaptionOnPage`), регистрация `SysDetail`, правка боевого замещения (CRLF) | ClientUnit / Data | ✅ подтверждено, `client-pages-edit.md`, `registration-edit.md` |
| Замещение детали: `initDefaultCaption` с `callParent`, кнопка на панели, `remove` колонки реестра | ClientUnit | ✅ подтверждено, `client-pages-edit.md` |
| Новый раздел (Section) с `getSectionActions`; кнопка карточки в совмещённом режиме (`publishPropertyValueToSection` + `CombinedModeActionButtonsCardLeftContainer` / `onCardAction`) | ClientUnit | ✅ подтверждено, `client-pages-edit.md` |
| Замещение раздела: кнопка в панели реестра, `merge` кнопки родителя, `getSectionActions`, кнопка раздела → метод замещения карточки (`onCardAction` + `tag`) | ClientUnit | ✅ подтверждено, `client-pages-edit.md` |
| Признак замещения `B7` в metadata замещающей схемы (клиентской и объекта) | ClientUnit / Entity | ✅ подтверждено: без `= MetaData.Schema.B7 true` клиент собирает замещение без базовых слоёв, `client-schemas.md` |
| Наследник своей карточки (`B7 false`) и одноимённые элементы в разных контейнерах (`merge`/`remove` берут первый по обходу вёрстки) | ClientUnit | ✅ `client-schemas-hierarchy.md`, `client-pages-edit.md` |
| Замещение мини-карточки (`merge`/`insert` в `MiniPage`, `onEntityInitialized`) | ClientUnit | ✅ подтверждено, `client-pages-edit.md` |
| Новая мини-карточка + регистрация в `SysModuleEdit` (`MiniPageSchemaUId`, `MiniPageModes`, `IsForceUpdate`) | ClientUnit / Data | ✅ подтверждено, `client-pages-edit.md` |
| Новый модуль (`BaseModule`, формат B), встраивание через контейнер + `sandbox.loadModule`, сообщения PTP в обе стороны | ClientUnit | ✅ подтверждено, `client-logic-edit.md` |
| Новый миксин (`configuration.mixins.*`, `Ext.create`), подключение через зависимость `define` + блок `mixins`, строки миксина | ClientUnit | ✅ подтверждено, `client-schemas-edit.md` |
| Патч существующего класса (`Ext override`, отдельная схема `Module`), подключение через зависимость `define` | ClientUnit | ✅ подтверждено, `client-schemas-edit.md` |
| Стили схемы (`.less` + `css!<Схема>`), отдельная схема стилей, картинки (`HD8` + `Images.<GUID>.Image`, `imageConfig`) | ClientUnit | ✅ подтверждено, `client-schemas-edit.md` |
| Процесс с нуля (Старт → Задание-сценарий → Завершение) | Process | ✅ `process-edit.md` |
| Настройки процесса, параметры процесса, элементы «Читать данные» (в т.ч. агрегация), «Формула», «Добавить данные» (в том числе по выборке), «Изменить данные», «Удалить данные» | Process | ✅ `process-edit.md` (настройки, параметры), `process-data-edit.md` (элементы) |
| Шлюзы (исключающий, параллельный, «ИЛИ»), условные потоки и потоки по умолчанию | Process | ✅ `process-flow-edit.md` |
| Методы процесса (`BK32`), `using` (`B3`), `Set`/`Get` между заданиями | Process | ✅ `process-flow-edit.md` |
| Стартовый сигнал по объекту (добавлена / изменена колонка + фильтр) | Process | ✅ `process-flow-edit.md` |
| Стартовый таймер (cron), промежуточный таймер, ожидание сигнала по записи | Process | ✅ `process-flow-edit.md` |
| Запуск процесса с клиента (`ProcessModuleUtilities`) и из C# (`ProcessExecutor`) | Process | ✅ `process-run-edit.md` |
| Подпроцесс с входными и выходными параметрами | Process | ✅ `process-flow-edit.md` |
| «Связать объект с процессом»; дорожки (в Designer стенда не поддерживаются — одна дорожка) | Process | ✅ `process-tasks-edit.md`, дорожки — `process-edit.md` |
| Своё действие процесса (`ProcessUserTaskSchemaManager`, `.cs`) с нуля, элемент «Выполнить действие процесса» в процессе, изменение действия и обновление процессов, где оно стоит, удаление и переименование параметра действия | ProcessUserTask / Process | ✅ `user-task-edit.md` |
| Флажок «Пользовательское действие» в диалоге действия = `FK7`; `FK16` появляется, когда в действии написан свой код | ProcessUserTask | ✅ подтверждено записью в CRM, `user-task.md`, `user-task-edit.md` |
| Преднастроенная страница: своя страница (наследник `BasePageSimpleProcessTemplate`, поля в `HD11`) и элемент процесса клонированием | Process / ClientUnit | ✅ `process-pages-edit.md` |
| Элемент «Отправить email» (произвольное письмо) | Process | ✅ `process-tasks-edit.md` (структура и Designer; доставка не проверена — на стенде нет почтового ящика) |
| Сквозной процесс по событию объекта: сигнал с фильтром по пути, «Читать данные» и «Изменить данные» с фильтром по параметру, формулы с датами (задача 3 — возраст контакта при создании лида) | Process | ✅ `process-tasks-edit.md` |
| Генерирующий сигнал и старт по произвольному сигналу (формат Designer, запуск проверен) | Process | ✅ `process-flow-edit.md` |
| Элемент «Автогенерируемая страница» (поле, кнопки, чтение введённого значения и нажатой кнопки; типы полей строка, логическое, целое, дробное, дата и время) | Process | ✅ `process-pages-edit.md` |
| Подпроцесс по коллекции записей (multi-instance) и «Читать данные» в режиме коллекции | Process | ✅ `process-flow-edit.md`, «Читать данные» в режиме коллекции — `process-data-edit.md` |
| Макросы в значениях параметров (текущие дата, время, пользователь, системная настройка, запись справочника) | Process | ✅ `process-edit.md` |
| Элементы «Выполнить задачу», «Открыть страницу редактирования» (с предзаполнением полей), «Вопрос пользователю» | Process | ✅ `process-activity-edit.md` (с ветвлением по ответу и чтением выбранного ответа) |
| Веб-сервис (`ServiceSchemaManager`): сервис, метод, параметры; элемент «Вызвать веб-сервис» | Service / Process | ✅ подтверждено записью в CRM, `web-service.md`, `web-service-edit.md` |
| Аутентификация REST-сервиса (`IQ5` Basic, `IR4`), значения из системных настроек (`IV2: 2`), вызов из C# (`IServiceSchemaClient`) | Service / SourceCode | ✅ подтверждено, `web-service.md`, `web-service-edit.md` |
| SqlScript (новый скрипт, выполняется при «Обновить из файловой системы») | SqlScript | ✅ `sql-script-edit.md` |
| Смена только текста `.sql` без `ModifiedOnUtc`: скрипт не выполняется, «Изменений не найдено» | SqlScript | ✅ подтверждено записью в CRM, `sql-script.md` |
| Скрипт пакета выполняется одной транзакцией: при ошибке последнего оператора предыдущие `DELETE` откатываются (`DROP TABLE` с внешним ключом → `2BP01`); `LastError` при этом пустой | SqlScript | ✅ подтверждено записью в CRM, `sql-script.md`, «Выполнение» |
| SourceCode: класс-помощник с локализуемой строкой, REST-сервис, слушатель событий объекта, изменение кода, вызов из процесса, слушатель событий приложения и ClassFactory, подмена платформенного класса (ReBind), чтение системной настройки | SourceCode | ✅ `source-code-edit.md`, `server-events-edit.md` |
| Data: системная настройка и её значение (`SysSettings` + `SysSettingsValue`), записи справочника с переводом, изменение данных и IsForceUpdate, удаление записей SQL-скриптом, набор для таблицы с колонками-справочниками, числом, логическим и датой (`InstallType` 1 при обновлении из ФС строк не загружает (🧪, см. `data.md`); `InstallType` 2 обновляет существующие записи, см. «Набор данных с InstallType: 2») | Data | ✅ `data-edit.md` |
| Набор данных без `filter.json` (системная настройка) загружается | Data | ✅ подтверждено записью в CRM, `data-edit.md` |
| Data: наборы регистрации, справочника, детали, иконки, системной настройки | Data | ✅ `registration-edit.md`, `data-edit.md`, `templates/data/`; прочие таблицы — 🧪 |
| Регистрация раздела (`SysModuleEntity`, `SysModule`, `SysModuleEdit`, `SysModuleInWorkplace`) и детали (`SysDetail`) | Data | ✅ подтверждено; мини-карточка (`MiniPageSchemaUId` + `MiniPageModes` в строке `SysModuleEdit` нужного типа) — ✅, `registration-edit.md` |
| Справочник в разделе «Справочники» (набор `Lookup_<Объект>`, таблица `Lookup`) | Data | ✅ `registration-edit.md` |
| Колонки реестра нового раздела по умолчанию (переопределение `getDefaultSectionGridProfile`) | ClientUnit | ✅ подтверждено, `client-logic-edit.md` |
| Редактируемая деталь (`ConfigurationGrid`, запреты по строке) | ClientUnit | ✅ подтверждено, `client-logic-edit.md` |
| Деталь только для просмотра (без добавления, изменения, копирования, удаления) | ClientUnit | ✅ подтверждено, `client-logic-edit.md` |
| Подсказка у поля карточки (`tip` с `bindTo` на строку ресурсов) | ClientUnit | ✅ подтверждено записью в CRM, `client-pages-edit.md` |
| Журнал изменений объекта (`D24` + `E16` у колонок, таблица `Sys<Объект>Log`) | Entity | ✅ подтверждено, `entity-events-edit.md` |
| Администрирование по операциям (`D15`), по записям (`D17`), по колонкам (`D16`); права по операциям и системные операции данными, права по умолчанию и на колонки SQL-скриптом | Entity / Data / SqlScript | ✅ подтверждено, `rights-edit.md` |
| Порядок SQL-скриптов через `DependsOn` (`{UId, Name}`) | SqlScript | ✅ подтверждено, `sql-script.md` |
| Набор данных с `InstallType: 2` при «Обновить из файловой системы» (обновляет существующие записи, новые не добавляет) | Data | ✅ подтверждено, `data.md` |
| Набор данных и SQL-скрипт `InstallType: 2` в одном обновлении: набор ставится первым, скрипт видит его значение и перезаписывает | Data / SqlScript | ✅ подтверждено записью в CRM, `data.md` |
| Иерархический справочник (наследник `BaseHierarchicalLookup`, переопределение `Parent`), деактивация записей `D32`, значения по умолчанию `CurrentDate`/`CurrentUser`/`SequentialGuid`, ссылка на представление с `E8` | Entity | ✅ подтверждено, `entity-edit.md` |
| Группы в разделе: `<Объект>Folder` (`BaseFolder`) и `<Объект>InFolder` (`BaseItemInFolder`), `FolderMode`, `UseStaticFolders` в разделе | Entity / Data / ClientUnit | ✅ подтверждено, `registration-edit.md` |
| Новое рабочее место (`SysWorkplace` + `SysModuleInWorkplace` + `SysAdminUnitInWorkplace` данными) | Data | ✅ подтверждено, `registration-edit.md` |
| Карточки по типам (`TypeColumnUId` в `SysModuleEntity`, строки `SysModuleEdit` с `TypeColumnValue`, `ActionKindName`/`ActionKindCaption`) | Data | ✅ подтверждено, `registration-edit.md` |
| Задание по расписанию на C# (`IJobExecutor`, `AppScheduler`): постановка, обновление, внеочередной и разовый запуск, снятие кодом и SQL | SourceCode | ✅ подтверждено, `server-background-edit.md` |
| Фоновая задача (`Task.StartNewWithUserConnection`) | SourceCode | ✅ подтверждено, `server-background-edit.md` |
| Файлы записи: запись, чтение и удаление из C#, загрузка и чтение через OData | SourceCode / OData | ✅ подтверждено, `files.md` |
| Свой кеш (`ApplicationCache`, `WorkspaceCache`, `SessionCache`), Redis | SourceCode | ✅ подтверждено, `platform-api.md` |
| Дата и время: UTC в БД, `GetCurrentDateTime` и `UtcNow` через `Entity` | SourceCode | ✅ подтверждено, `platform-api.md` |
| ESQ: постраничность, функции, агрегат по детали с условием, `IsDistinct`; `CustomQuery`; проверка псевдонимов | SourceCode | ✅ подтверждено, `server-data-api.md` |
| Пользователь через `AdministrationService.UpdateOrCreateUser` | REST | ✅ подтверждено, `rights.md` |
| Порядок замещений между пакетами | любой | ✅ на реальных схемах стенда, `metadata-editing.md` |
| OData: `$count`, `$metadata`, `$batch` (JSON) | OData | ✅ подтверждено, `integration-api.md` |
| Своя запись в журнале аудита (`SysOperationAudit`) | SourceCode | ✅ подтверждено, `server-data-api.md` |
| Удаление пользователя (`AdministrationService.DeleteUser`) | REST | ✅ подтверждено, `rights.md` |
| Исключение в задании-сценарии и `ProcessExecutor.Execute` (`ProcessStatus`) | Process | ✅ подтверждено, `processes.md`, `process-run-edit.md` |
| Функциональная роль и роли пользователя через `AdministrationService` | REST | ✅ подтверждено, `rights.md` |
| CSP через `appsettings.json`; анонимный сервис без `SpecifyWebOperationIdentity` | appsettings | ✅ подтверждено, `client-schemas.md`, `integration-api.md` |
| Компиляция без обновления теряет новые файлы | любой | ✅ подтверждено, `metadata-editing.md` |
| Вебхук файлами (`WebhookSchemaManager`): метаданные, публикация при старте по `IR9`, вызов с cookie пользователя | Webhook | ✅ подтверждено, `webhook.md`, `webhook-edit.md` |
| Импорт из Excel: сохранение через `Entity` (события объекта), тег импорта, ключевые колонки, `FileImportParameters`, требования к файлу | FileImport | ✅ подтверждено, `file-import.md` |
| Поиск дублей при сохранении (`SearchDuplicatesService`), правила `DuplicatesRule` | REST / данные | ✅ подтверждено, `duplicates.md` |
| Веб-форма: анонимная отправка, проверка `Referer` | REST | ✅ подтверждено, `integration-api.md` |
| Текущий пользователь запроса (`UserInfoService.svc/GetCurrentUserInfo`, только POST) | REST | ✅ подтверждено, `integration-api.md` |
| `Web` контрагента, заданный в карточке до сохранения, сохраняется на базовой платформе | Account | ✅ подтверждено, `process-tasks-edit.md` |
| Кейс файлами (`DcmSchemaManager`): стадии, переходы, наборы `SysDcmSettings` и `SysDcmSchemaInSettings`, шаг «Выполнить задачу» со связью с записью, автопереход, условие запуска, удаление | Dcm | ✅ подтверждено, `dcm.md`, `dcm-edit.md` |
| Кейс: новая версия файлами, выключение (`Enabled`) | Dcm | 🧪 версия снята с дизайнера, файлами не проверена; `Enabled` в `properties.json` ❌ не выключает, `dcm.md` |
| Раздел «Переводы» (`SysTranslation`): формат `Key` | данные | ✅ подтверждено на реальных схемах проекта, `metadata-editing.md` |
| Раздел «Переводы»: применение переводов | данные | 🧪 не проверено, `metadata-editing.md` |
| Колонка активности на свой объект: связь в `EntityConnection` | Entity | ✅ подтверждено, `entity-columns-edit.md` |
| Константы: клиентский модуль идентификаторов | ClientUnit | ✅ подтверждено, `client-schemas-edit.md` |
| Константы серверной логики (статический класс) | SourceCode | ✅ подтверждено компиляцией и работой, `source-code-edit.md` |
| Регистрация реализации через `[DefaultBinding]` без `OnAppStart` | SourceCode | ✅ подтверждено, `source-code-edit.md` |
| Сообщение пользователю в браузер и уведомление в «колокольчике» | SourceCode | ✅ подтверждено, `source-code-edit.md` |
| Удалить SourceCode-схему | SourceCode | ✅ `source-code-edit.md`, `metadata-editing.md`, «Удаление схемы» |
| Фильтр выпадающего списка справочника на карточке; клиентский ESQ и запросы данных (JS) | ClientUnit | ✅ `client-logic-edit.md` |
| Сохранение без закрытия карточки (`save({isSilent: true})`), окна, ModalBox | ClientUnit | ✅ подтверждено, `client-logic-edit.md` |
| Агрегат с условием в клиентском ESQ | ClientUnit | ✅ подтверждено, `client-logic-edit.md` |
| Выключить процесс: строка в `SysProcessDisabled` и удаление заданий планировщика (поле `BK36` не выключает) | Process | ✅ `process-edit.md`, `sql-script-edit.md` |
| Коллекции в задании-сценарии: результат «Читать данные» в режиме коллекции и параметр-коллекция | Process | ✅ подтверждено, `process-flow-edit.md` |
| Асинхронное действие процесса: процесс ждёт, пока элемент завершат | ProcessUserTask | ✅ подтверждено, `user-task-edit.md` |
| Удалить действие процесса целиком | ProcessUserTask | ✅ подтверждено, `user-task-edit.md` |
| Добавить метод или параметр в существующий веб-сервис; вызов нового метода из процесса | Service | ✅ подтверждено, `web-service-edit.md` |
| Удалить вебхук | Webhook | ✅ подтверждено, `webhook-edit.md` |
| Типы параметра ответа веб-сервиса в Designer («Обработка ответа»): `IU2` = `Float`, `DateTime`, `Guid`, `Date`, `Time`; служебные поля параметра ответа | Service | ✅ подтверждено записью в CRM, `web-service.md`, «Параметр» |
| Удалить набор данных целиком | Data | ✅ подтверждено, `data-edit.md` |
| Перевести запись кейса на стадию из кода или запросом | Dcm | ✅ `dcm-edit.md` |
| Признак «запись не изменена» на карточке: «Закрыть» vs «Сохранить»/«Отмена», префикс «Редактирование: » | UI | ✅ подтверждено на реальных схемах проекта, `browser-check.md` |
| Служебные поля `D29`–`D31` при сохранении объекта (`"null"`), перезапись diff-файла при сохранении | Entity | ✅ подтверждено записью в CRM, `entity.md`, «Служебные поля D29–D31» |
| `E12` с `FB1: 2` (значение по умолчанию из системной настройки, `FB2` — код) | Entity | ✅ подтверждено записью в CRM, `entity.md`, «Значение по умолчанию» |
| Событие «После сохранения записи» без флага `D20.FA<N>` не срабатывает; `InsertQuery` через DataService запускает события объекта | Entity | ✅ подтверждено записью в CRM, `entity-events-edit.md` |
| SqlScript: DO-блок PL/pgSQL, `CREATE TABLE IF NOT EXISTS` и `CREATE INDEX IF NOT EXISTS` в одном скрипте | SqlScript | ✅ подтверждено записью в CRM, `sql-script-edit.md` |
| «Отмена» на новой карточке (`…/add`) после ввода значения: закрывает карточку без вопроса о сохранении | ClientUnit | ✅ подтверждено записью в CRM, `browser-check.md` |
| Замещение карточки: `move` обычного элемента (позиция в сетке задаётся `layout`, порядок в DOM не меняется) | ClientUnit | ✅ подтверждено записью в CRM, `client-pages-edit.md` |
| OData после «Обновить из файловой системы» с не скомпилированным новым объектом: HTTP 500 для всех объектов, после компиляции 200 | Entity | ✅ подтверждено записью в CRM, `errors.md` |
