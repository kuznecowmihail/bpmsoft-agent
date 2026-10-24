# Файлы и вложения — факты и рецепты

Файлы записей: где лежат, как записать, прочитать и удалить файл из C# и через OData. Проверено записью в CRM 24.10.2026 на файлах контакта.

## ✅ Как хранятся
- Файлы записи — отдельный объект `<Объект>File` (например `ContactFile`), наследник `File`; вкладка «Файлы и примечания» карточки показывает его записи. Колонки: `Name`, `Data` (содержимое), `Size`, `TypeId`, `Version`, `<Объект>Id` (ссылка на запись), `SysFileStorageId`, `Notes`.
- `TypeId` — справочник `FileType`: `529bc2f8-0ee0-df11-971b-001d60e938c6` — файл, `539bc2f8-0ee0-df11-971b-001d60e938c6` — ссылка, `549bc2f8-0ee0-df11-971b-001d60e938c6` — ссылка на объект.
- Где лежит содержимое — системная настройка `ActiveFileContentStorage` (Id записи `SysFileContentStorage`): `38ab9812-9bba-4eb8-86d0-8f352cd0229c` «Database» — в колонке `Data`; есть «S3 storage» `65e42805-0e6d-43c9-8784-32b555f08421`. Код через файловый API (ниже) от хранилища не зависит; читать `Data` SQL-запросом можно только при «Database».
- Удаление записи-владельца удаляет её файлы: `DELETE /odata/Contact(<Id>)` удалил строки `ContactFile`.
- Скачать файл — `GET <CRM>/rest/FileService/GetFile/<UId объекта файлов>/<Id файла>` (ссылка на вкладке «Файлы»), ответ — содержимое.

## ✅ Записать, прочитать, удалить файл из C#
```csharp
// using System.IO; using BPMSoft.File; using BPMSoft.File.Abstractions;
Guid fileId = Guid.NewGuid();
IFile file = UserConnection.CreateFile(new EntityFileLocator("<Объект>File", fileId));
file.Name = "<имя файла>";
file.SetAttribute("<Объект>Id", <Id записи>);
file.Write(<byte[]>);

IFile existing = UserConnection.GetFile(new EntityFileLocator("<Объект>File", fileId));
if (existing.Exists)
{
	using (Stream stream = existing.Read())
	{
		// existing.Name, existing.Length
	}
}
existing.Delete();
```
- `Write` сохраняет и запись, и содержимое: после него строка `<Объект>File` есть, `Size` — длина, `Version` — 1, `TypeId` — «файл». Ссылка на запись — атрибут с именем колонки с суффиксом `Id`.
- `Delete` удаляет строку файла; `Exists` после этого — `false`.
- `using BPMSoft.File;` внутри `namespace BPMSoft.Configuration` компилируется, хотя в конфигурации есть класс объекта `File` (так и в коде платформы).
- Права: `UserConnection.GetFileFactory()` — фабрика с проверкой прав (`UseRights`), `.WithRightsDisabled()` — без проверки; 🧪 под пользователем с ограниченными правами не проверялось. `Copy`, `Move` у `IFile` — 🧪.

## ✅ Файл через OData
1. `POST /odata/<Объект>File` с `{"Name": "<имя>", "<Объект>Id": "<Id записи>", "TypeId": "529bc2f8-0ee0-df11-971b-001d60e938c6"}` → 201 и `Id`.
2. `PUT /odata/<Объект>File(<Id>)/Data`, заголовок `Content-Type: application/octet-stream`, тело — байты файла → 200; `Size` пересчитывается.
3. `GET /odata/<Объект>File(<Id>)/Data` — содержимое.
Вход, cookie и заголовок `BPMCSRF` — `integration-api.md`.

## Загрузка из интерфейса
- Клиент грузит файлы модулем `ConfigurationFileApi` (`[app]/conf/content/ConfigurationFileApi.js`) в `FileApiService/UploadFile` (при функциональности `UseOldFileUploadMethod` — `FileApiService/Upload`); параметры: `fileId`, `fileName`, `mimeType`, `totalFileLength`, `entitySchemaName`, `columnName`, `parentColumnName`, `parentColumnValue`. Свой сервис загрузки — `uploadWebServicePath` в конфигурации загрузки. 🧪 Формат запроса вручную не проверялся.
