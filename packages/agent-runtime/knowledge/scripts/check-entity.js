#!/usr/bin/env node
// check-entity.js — валидация схем сущностей BPMSoft на диске
// Запуск: node check-entity.js <путь> [<путь> ...]
// <путь> = папка сущности или папка пакета (проверяются все сущности в Schemas/)
// Выход: строки ОШИБКА (исправить до ответа пользователю) и ВНИМАНИЕ (оценить); код возврата 1, если есть ОШИБКА.

const fs = require('fs');
const path = require('path');

const readJSON = (f) => {
  try {
    const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
};

const isEntityMetadata = (obj) => obj && obj.MetaData && obj.MetaData.Schema && obj.MetaData.Schema.ManagerName === 'EntitySchemaManager';

const isEntityDescriptor = (obj) => obj && obj.Descriptor && obj.Descriptor.ManagerName === 'EntitySchemaManager';

const getEntityFolders = (target) => {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return [];

  // Check if this folder itself is an entity (has descriptor.json)
  const descPath = path.join(target, 'descriptor.json');
  if (fs.existsSync(descPath)) {
    const desc = readJSON(descPath);
    if (isEntityDescriptor(desc)) {
      return [target];
    }
  }

  // Check if this is a package folder (has Schemas/)
  const schemasPath = path.join(target, 'Schemas');
  if (fs.existsSync(schemasPath)) {
    const result = [];
    const items = fs.readdirSync(schemasPath);
    for (const item of items) {
      const schemaPath = path.join(schemasPath, item);
      const schemaDescPath = path.join(schemaPath, 'descriptor.json');
      if (fs.existsSync(schemaDescPath)) {
        const desc = readJSON(schemaDescPath);
        if (isEntityDescriptor(desc)) {
          result.push(schemaPath);
        }
      }
    }
    return result;
  }

  return [];
};

const getPkgRoot = (entityFolder) => {
  let current = entityFolder;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'Schemas'))) return current;
    current = path.dirname(current);
  }
  return null;
};

const parseRawMetadata = (f) => {
  const raw = fs.readFileSync(f, 'utf8');
  return { raw, data: JSON.parse(raw.replace(/^﻿/, '')) };
};

// Parse diff format metadata
const parseDiffMetadata = (rawText) => {
  const lines = rawText.split(/\r?\n/);
  const result = {};
  const blocks = {}; // Store multiple blocks per path
  let currentBlock = null;
  let currentBlockLines = [];
  let currentBlockStartLine = 0;
  let currentBlockOp = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (currentBlock !== null) {
      // We're inside a block
      if (line === '}') {
        // Close the block
        try {
          const blockJson = JSON.parse('{' + currentBlockLines.join('\n') + '}');
          if (!blocks[currentBlock]) blocks[currentBlock] = [];
          blocks[currentBlock].push({ value: blockJson, op: currentBlockOp, startLine: currentBlockStartLine });
          result[currentBlock] = { type: 'block', value: blockJson, startLine: currentBlockStartLine };
        } catch (e) {
          result[currentBlock] = { type: 'error', error: `неверный JSON в блоке на строке ${currentBlockStartLine + 1}`, startLine: currentBlockStartLine };
        }
        currentBlock = null;
        currentBlockLines = [];
      } else if (/^[=+~-] MetaData\./.test(line)) {
        // Error: new operation inside block
        result[`__error_${i}`] = { type: 'error', error: `блок ${currentBlock} не закрыт: закрывающая } должна стоять в начале строки без отступа`, line: i };
        // Continue parsing as if block closed
        currentBlock = null;
        currentBlockLines = [];
        // Re-process this line
        i--;
      } else {
        // Inside block - collect JSON lines
        if (line.trim()) currentBlockLines.push(line);
      }
      continue;
    }

    // Not inside a block
    const match = line.match(/^([=+~-]) (MetaData\.Schema\..+?)(?:\s+(.+))?$/);
    if (!match) continue;

    const [, op, path, value] = match;

    if (value && value.endsWith('{')) {
      // Start of block
      currentBlock = path;
      currentBlockLines = [];
      currentBlockStartLine = i;
      currentBlockOp = op;
    } else if (value) {
      // Single-line operation
      try {
        const parsedValue = JSON.parse(value);
        result[path] = { type: 'value', op, value: parsedValue, line: i };
      } catch (e) {
        result[path] = { type: 'value', op, value, line: i };
      }
    } else {
      // Operation with no value (like `- MetaData.Schema.D1`)
      result[path] = { type: 'delete', op, line: i };
    }
  }

  if (currentBlock !== null) {
    result[`__error_eof`] = { type: 'error', error: `блок ${currentBlock} не закрыт: EOF внутри блока`, line: lines.length };
  }

  // Add blocks info to result
  result.__blocks = blocks;

  return result;
};

const validateEntity = (entityFolder) => {
  const errors = [];
  const warnings = [];

  const descriptorPath = path.join(entityFolder, 'descriptor.json');
  const metadataPath = path.join(entityFolder, 'metadata.json');

  let descriptorRaw, descriptor;
  let metadataRaw, metadata;
  let schema;
  let entityName = ''; // Will be used for resource path

  // Parse descriptor
  if (!fs.existsSync(descriptorPath)) {
    errors.push('descriptor.json: файл не найден');
    return { errors, warnings };
  }

  const desc = parseRawMetadata(descriptorPath);
  descriptorRaw = desc.raw;
  descriptor = desc.data;

  // Get entity name from descriptor (primary) with fallback to metadata
  if (descriptor && descriptor.Descriptor && descriptor.Descriptor.Name) {
    entityName = descriptor.Descriptor.Name;
  }

  // Check 1: descriptor.json format - Date format with 13-digit timestamp
  if (!/"ModifiedOnUtc":\s*"\\?\/Date\(\d{13}\)\\?\/"/m.test(descriptorRaw)) {
    errors.push('descriptor.json: ModifiedOnUtc в неверном формате (нужно "\\/Date(<мс>)\\/" — один обратный слеш или без него)')
  }

  // Parse metadata
  if (!fs.existsSync(metadataPath)) {
    errors.push('metadata.json: файл не найден');
    return { errors, warnings };
  }

  metadataRaw = fs.readFileSync(metadataPath, 'utf8');

  // Check if diff format or JSON format (strip BOM first)
  let isDiffFormat = false;
  const cleanMetadataRaw = metadataRaw.replace(/^﻿/, '');
  if (cleanMetadataRaw[0] === '=' || cleanMetadataRaw[0] === '+' || cleanMetadataRaw[0] === '-' || cleanMetadataRaw[0] === '~') {
    isDiffFormat = true;
  }

  if (isDiffFormat) {
    // Parse diff format (use cleaned version without BOM)
    const diffData = parseDiffMetadata(cleanMetadataRaw);

    // Check for parsing errors
    for (const [key, val] of Object.entries(diffData)) {
      if (val.type === 'error') {
        errors.push(`metadata.json: ${val.error}`);
      }
    }

    if (errors.length > 0) {
      return { errors, warnings };
    }

    // Extract key values
    let uid = null;
    let metaName = null;
    let b6 = null;
    let d2Blocks = new Map();
    let d2List = null;
    let d4 = null;
    let eg1BK4Blocks = new Map();
    let eg1BK4List = null;

    // Process blocks stored from parsing
    const blocksMult = diffData.__blocks || {};
    if (blocksMult['MetaData.Schema.D2']) {
      for (const blockInfo of blocksMult['MetaData.Schema.D2']) {
        const blockData = blockInfo.value;
        if (blockData.UId) {
          d2Blocks.set(blockData.UId, blockData);
        }
      }
    }
    if (blocksMult['MetaData.Schema.EG1.BK4']) {
      for (const blockInfo of blocksMult['MetaData.Schema.EG1.BK4']) {
        const blockData = blockInfo.value;
        if (blockData.UId) {
          eg1BK4Blocks.set(blockData.UId, blockData);
        }
      }
    }

    for (const [key, val] of Object.entries(diffData)) {
      if (key === '__blocks') continue; // Skip blocks metadata
      if (key === 'MetaData.Schema.UId' && val.type === 'value') {
        uid = val.value;
      } else if (key === 'MetaData.Schema.A2' && val.type === 'value') {
        metaName = val.value;
      } else if (key === 'MetaData.Schema.B6' && val.type === 'value') {
        b6 = val.value;
      } else if (key === 'MetaData.Schema.D2' && val.type === 'value' && Array.isArray(val.value)) {
        d2List = val.value;
      } else if (key === 'MetaData.Schema.D4' && val.type === 'value') {
        d4 = val.value;
      } else if (key === 'MetaData.Schema.EG1.BK4' && val.type === 'value' && Array.isArray(val.value)) {
        eg1BK4List = val.value;
      }
    }

    // Fallback: use metaName if entityName not set from descriptor
    if (!entityName && metaName) {
      entityName = metaName;
    }

    // Check descriptor matches metadata
    if (uid && descriptor.Descriptor.UId !== uid) {
      errors.push('descriptor.json: Descriptor.UId не совпадает с metadata.UId');
    }
    if (metaName && descriptor.Descriptor.Name !== metaName) {
      errors.push('descriptor.json: Descriptor.Name не совпадает с metadata.A2');
    }

    // Check B6 matches package UId
    const pkgRoot = getPkgRoot(entityFolder);
    if (b6 && pkgRoot) {
      const pkgDescPath = path.join(pkgRoot, 'descriptor.json');
      if (fs.existsSync(pkgDescPath)) {
        const pkgDescriptor = readJSON(pkgDescPath);
        if (pkgDescriptor && b6 !== pkgDescriptor.Descriptor.UId) {
          warnings.push('сущность: B6 не совпадает с UId пакета');
        }
      }
    }

    // Check 3: Columns - all D2 blocks must be in ~ list
    if (d2Blocks.size > 0 && !d2List) {
      errors.push('колонки добавлены, но нет списка ~ MetaData.Schema.D2');
    } else {
      for (const [blockId, blockData] of d2Blocks.entries()) {
        if (d2List && !d2List.includes(blockId)) {
          const colName = blockData.A2 || blockId;
          errors.push(`колонка ${colName} (${blockId}) не перечислена в ~ MetaData.Schema.D2 — список должен содержать все колонки`);
        }
      }
    }

    // Check 4: Display column D4 warning
    if (d4 && d2List && !d2List.includes(d4) && d2Blocks.size > 0) {
      warnings.push('D4 указывает на колонку не из этого файла — проверь, что она есть у родителя');
    }

    // Check 5: Coordinates format (BL3, BN2, CI11, CI12)
    const checkCoordinates = (obj, path = '') => {
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          if ((key === 'BL3' || key === 'BN2' || key === 'CI11' || key === 'CI12') && typeof value === 'string') {
            if (!/^-?\d+;-?\d+$/.test(value)) {
              const elemName = obj.A2 || path;
              errors.push(`${key} "${value}": координаты только целые (дробные ломают «Обновить из файловой системы»)`);
            }
          }
          if (typeof value === 'object') {
            checkCoordinates(value, obj.A2 || path);
          }
        }
      }
    };

    for (const [, blockData] of d2Blocks.entries()) {
      checkCoordinates(blockData);
    }

    for (const [, blockData] of eg1BK4Blocks.entries()) {
      checkCoordinates(blockData);
    }

    // Check 6: Events layout - subprocess elements within bounds
    for (const [blockId, bk4Block] of eg1BK4Blocks.entries()) {
      if (bk4Block.BL1 && bk4Block.BL1.includes('ProcessSchemaEventSubProcess')) {
        // This is a subprocess
        const subprocessBN2 = bk4Block.BN2;
        if (subprocessBN2 && /^-?\d+;-?\d+$/.test(subprocessBN2)) {
          const [subW, subH] = subprocessBN2.split(';').map(Number);
          const subBL3 = bk4Block.BL3;
          const [subX, subY] = subBL3 ? subBL3.split(';').map(Number) : [0, 0];

          if (bk4Block.CK2 && Array.isArray(bk4Block.CK2)) {
            for (const element of bk4Block.CK2) {
              if (element.BL3 && element.BN2) {
                const [elX, elY] = element.BL3.split(';').map(Number);
                const [elW, elH] = element.BN2.split(';').map(Number);

                // Check if element is within subprocess bounds (relative to subprocess origin)
                if (!(elX >= 0 && elX + elW <= subW && elY >= 0 && elY + elH <= subH)) {
                  const elemName = element.A2 || 'элемент';
                  const subName = bk4Block.A2 || 'подпроцесс';
                  errors.push(`элемент ${elemName} подпроцесса ${subName} вне рамки (BL3 "${element.BL3}", рамка "${subprocessBN2}") — координаты внутри подпроцесса считаются от его угла`);
                }
              }
            }
          }
        }
      }
    }

    // Check 7: EG1.BK4 list - all blocks must be in ~ list
    for (const [blockId, ] of eg1BK4Blocks.entries()) {
      if (eg1BK4List && !eg1BK4List.includes(blockId)) {
        const blockData = eg1BK4Blocks.get(blockId);
        const elemName = blockData.A2 || blockId;
        errors.push(`элемент процесса событий ${elemName} не перечислен в ~ MetaData.Schema.EG1.BK4`);
      }
    }

    // Check 10: Template placeholders
    if (metadataRaw.includes('<UId ') || metadataRaw.includes('<Id ')) {
      errors.push('сущность: остался плейсхолдер шаблона');
    }

    // Check 9: Resources
    let ruResPath, enResPath;
    if (entityName) {
      if (pkgRoot) {
        const resBase = path.join(pkgRoot, 'Resources', `${entityName}.Entity`);
        ruResPath = path.join(resBase, 'resource.ru-RU.xml');
        enResPath = path.join(resBase, 'resource.en-US.xml');
      } else {
        const resFolder = path.join(entityFolder, '..', `${entityName}.Entity`);
        ruResPath = path.join(resFolder, 'resource.ru-RU.xml');
        enResPath = path.join(resFolder, 'resource.en-US.xml');
      }

      const ruFileExists = fs.existsSync(ruResPath);
      const enFileExists = fs.existsSync(enResPath);

      if (!ruFileExists || !enFileExists) {
        warnings.push('ресурсы: отсутствует файл ресурсов');
      } else {
        const ruContent = fs.readFileSync(ruResPath, 'utf8');
        const enContent = fs.readFileSync(enResPath, 'utf8');

        for (const [, colData] of d2Blocks.entries()) {
          const colName = colData.A2;
          if (!colName) continue;

          const captionKey = `Columns.${colName}.Caption`;
          const escapedKey = captionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`<Item Name="${escapedKey}" Value=`);

          const ruExists = regex.test(ruContent);
          const enExists = regex.test(enContent);

          if (!ruExists && !enExists) {
            errors.push(`нет подписи колонки ${colName}`);
          } else if (ruExists && !enExists) {
            warnings.push(`подпись колонки ${colName} только в ru-RU`);
          } else if (!ruExists && enExists) {
            warnings.push(`подпись колонки ${colName} только в en-US`);
          }
        }
      }
    }

  } else {
    // JSON format metadata
    try {
      metadata = JSON.parse(metadataRaw.replace(/^﻿/, ''));
    } catch (e) {
      errors.push('metadata.json: неверный JSON');
      return { errors, warnings };
    }

    if (!isEntityMetadata(metadata)) {
      errors.push('metadata.json: ManagerName не EntitySchemaManager');
      return { errors, warnings };
    }

    schema = metadata.MetaData.Schema;

    // Check 1: descriptor UId and Name match
    if (descriptor.Descriptor.UId !== schema.UId) {
      errors.push('descriptor.json: Descriptor.UId не совпадает с metadata.UId');
    }
    if (descriptor.Descriptor.Name !== schema.A2) {
      errors.push('descriptor.json: Descriptor.Name не совпадает с metadata.A2');
    }

    // Check 8: B6 equals package descriptor UId (ВНИМАНИЕ, not ОШИБКА)
    const pkgRoot = getPkgRoot(entityFolder);
    if (pkgRoot) {
      const pkgDescPath = path.join(pkgRoot, 'descriptor.json');
      if (fs.existsSync(pkgDescPath)) {
        const pkgDescriptor = readJSON(pkgDescPath);
        if (pkgDescriptor && schema.B6 !== pkgDescriptor.Descriptor.UId) {
          warnings.push('сущность: B6 не совпадает с UId пакета');
        }
      }
    }

    // Check 10: template placeholders
    if (metadataRaw.includes('<UId ') || metadataRaw.includes('<Id ')) {
      errors.push('сущность: остался плейсхолдер шаблона');
    }

    // Check 3: Columns - collect D2 UIds and check ~ list
    const d2Blocks = schema.D2 || [];
    const d2UIds = new Set();
    for (const col of d2Blocks) {
      d2UIds.add(col.UId);
    }

    // Check if there's a ~ list (which we need to validate in the JSON)
    // In JSON format, the schema directly contains the D2 array, so we validate it exists
    if (d2UIds.size > 0 && !schema.D2) {
      errors.push('колонки определены, но отсутствует D2 список');
    }

    // Check 5: Coordinates
    const checkCoordinatesJSON = (obj) => {
      if (obj && typeof obj === 'object') {
        if ((obj.BL3 || obj.BN2 || obj.CI11 || obj.CI12)) {
          for (const key of ['BL3', 'BN2', 'CI11', 'CI12']) {
            if (obj[key] && !/^-?\d+;-?\d+$/.test(obj[key])) {
              errors.push(`${key} "${obj[key]}": координаты только целые`);
            }
          }
        }
        for (const value of Object.values(obj)) {
          if (typeof value === 'object') {
            checkCoordinatesJSON(value);
          }
        }
      }
    };

    checkCoordinatesJSON(schema);

    // Check 9: Resources - use entityName (from descriptor) or fall back to schema.A2
    let ruResPath, enResPath;
    const resName = entityName || schema.A2;
    if (pkgRoot) {
      const resBase = path.join(pkgRoot, 'Resources', `${resName}.Entity`);
      ruResPath = path.join(resBase, 'resource.ru-RU.xml');
      enResPath = path.join(resBase, 'resource.en-US.xml');
    } else {
      const resFolder = path.join(entityFolder, '..', `${resName}.Entity`);
      ruResPath = path.join(resFolder, 'resource.ru-RU.xml');
      enResPath = path.join(resFolder, 'resource.en-US.xml');
    }

    const ruFileExists = fs.existsSync(ruResPath);
    const enFileExists = fs.existsSync(enResPath);

    if (!ruFileExists || !enFileExists) {
      warnings.push('ресурсы: отсутствует файл ресурсов');
    } else {
      const ruContent = fs.readFileSync(ruResPath, 'utf8');
      const enContent = fs.readFileSync(enResPath, 'utf8');

      for (const col of d2Blocks) {
        if (!col.A2) continue;

        const captionKey = `Columns.${col.A2}.Caption`;
        const escapedKey = captionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`<Item Name="${escapedKey}" Value=`);

        const ruExists = regex.test(ruContent);
        const enExists = regex.test(enContent);

        if (!ruExists && !enExists) {
          errors.push(`нет подписи колонки ${col.A2}`);
        } else if (ruExists && !enExists) {
          warnings.push(`подпись колонки ${col.A2} только в ru-RU`);
        } else if (!ruExists && enExists) {
          warnings.push(`подпись колонки ${col.A2} только в en-US`);
        }
      }
    }
  }

  return { errors, warnings };
};

const main = () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Использование: node check-entity.js <путь> [<путь> ...]');
    console.log('<путь> = папка сущности (содержит metadata.json) или пакета (содержит Schemas/)');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let entityCount = 0;

  for (const target of args) {
    const folders = getEntityFolders(target);

    for (const folder of folders) {
      let name = '';

      // Primary: use descriptor.Descriptor.Name
      const descPath = path.join(folder, 'descriptor.json');
      if (fs.existsSync(descPath)) {
        const desc = readJSON(descPath);
        if (desc && desc.Descriptor && desc.Descriptor.Name) {
          name = desc.Descriptor.Name;
        }
      }

      // Fallback: try metadata A2 if name not found
      if (!name) {
        const metaPath = path.join(folder, 'metadata.json');
        if (fs.existsSync(metaPath)) {
          const metaRaw = fs.readFileSync(metaPath, 'utf8');

          if (metaRaw[0] === '=' || metaRaw[0] === '+') {
            const match = metaRaw.match(/= MetaData\.Schema\.A2 "([^"]+)"/);
            if (match) name = match[1];
          } else {
            try {
              const meta = JSON.parse(metaRaw.replace(/^﻿/, ''));
              if (meta && meta.MetaData && meta.MetaData.Schema && meta.MetaData.Schema.A2) {
                name = meta.MetaData.Schema.A2;
              }
            } catch (e) {
              // skip
            }
          }
        }
      }

      const { errors, warnings } = validateEntity(folder);

      console.log(`== ${name} (${folder})`);

      if (errors.length === 0 && warnings.length === 0) {
        console.log('ОК');
      } else {
        for (const err of errors) {
          console.log(`ОШИБКА ${err}`);
        }
        for (const warn of warnings) {
          console.log(`ВНИМАНИЕ ${warn}`);
        }
      }

      console.log(`Итого: ${errors.length} ошибок, ${warnings.length} предупреждений`);
      console.log('');

      totalErrors += errors.length;
      totalWarnings += warnings.length;
      entityCount++;
    }
  }

  if (entityCount > 1) {
    console.log(`Всего: ${totalErrors} ошибок, ${totalWarnings} предупреждений в ${entityCount} сущностях`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
};

if (require.main === module) {
  main();
}

module.exports = { validateEntity, getEntityFolders };
