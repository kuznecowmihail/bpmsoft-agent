#!/usr/bin/env node
// check-process.js — валидация схем процессов BPMSoft на диске
// Запуск: node check-process.js <путь> [<путь> ...]
// <путь> = папка процесса или папка пакета (проверяются все процессы в Schemas/)
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

const isProcessMetadata = (obj) => obj && obj.MetaData && obj.MetaData.Schema && obj.MetaData.Schema.ManagerName === 'ProcessSchemaManager';

const getProcessFolders = (target) => {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return [];

  const metaPath = path.join(target, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    const meta = readJSON(metaPath);
    if (isProcessMetadata(meta)) return [target];
  }

  const schemasPath = path.join(target, 'Schemas');
  if (fs.existsSync(schemasPath)) {
    const result = [];
    const items = fs.readdirSync(schemasPath);
    for (const item of items) {
      const schemaPath = path.join(schemasPath, item);
      const schemaMetaPath = path.join(schemaPath, 'metadata.json');
      if (fs.existsSync(schemaMetaPath)) {
        const rawText = fs.readFileSync(schemaMetaPath, 'utf8');
        if (rawText[0] === '=' || rawText[0] === '+' || rawText[0] === '-' || rawText[0] === '~') continue;
        const meta = JSON.parse(rawText.replace(/^﻿/, ''));
        if (isProcessMetadata(meta)) result.push(schemaPath);
      }
    }
    return result;
  }

  return [];
};

const getPkgRoot = (processFolder) => {
  let current = processFolder;
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

const walkStrings = (obj, callback, currentElement = null) => {
  if (typeof obj === 'string') {
    callback(obj, currentElement);
  } else if (Array.isArray(obj)) {
    obj.forEach(item => walkStrings(item, callback, currentElement));
  } else if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      walkStrings(value, callback, currentElement);
    }
  }
};

const stripCSharpCode = (code) => {
  if (!code || typeof code !== 'string') return code;
  // Remove line comments
  let stripped = code.replace(/\/\/.*$/gm, '');
  // Remove block comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove string literals: "..." (with \" handling) and @"..."
  stripped = stripped.replace(/"(?:\\"|[^"])*"/g, '""');
  stripped = stripped.replace(/@"(?:""|[^"])*"/g, '""');
  return stripped;
};

const getResourceCaption = (resPath, elementName) => {
  if (!fs.existsSync(resPath)) return null;
  const text = fs.readFileSync(resPath, 'utf8');
  const match = text.match(new RegExp(`<Item Name="BaseElements\\.${elementName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.Caption" Value="([^"]*)"`, 'g'));
  if (!match || !match[0]) return null;
  const captionMatch = match[0].match(/Value="([^"]*)"/);
  return captionMatch ? captionMatch[1] : null;
};

const validateProcess = (processFolder) => {
  const errors = [];
  const warnings = [];

  const descriptorPath = path.join(processFolder, 'descriptor.json');
  const metadataPath = path.join(processFolder, 'metadata.json');

  let descriptorRaw, descriptor;
  let metadataRaw, metadata;
  let schema;

  // Parse descriptor
  if (!fs.existsSync(descriptorPath)) {
    errors.push('descriptor.json: файл не найден');
    return { errors, warnings };
  }

  const desc = parseRawMetadata(descriptorPath);
  descriptorRaw = desc.raw;
  descriptor = desc.data;

  // Check 1: descriptor.json format
  if (!/"ModifiedOnUtc":\s*"\\?\/Date\(\d{13}\)\\?\/"/m.test(descriptorRaw)) {
    errors.push('descriptor.json: ModifiedOnUtc в неверном формате (нужно "\\/Date(<мс>)\\/" — один обратный слеш или без него)')
  }

  // Parse metadata
  if (!fs.existsSync(metadataPath)) {
    errors.push('metadata.json: файл не найден');
    return { errors, warnings };
  }

  const meta = parseRawMetadata(metadataPath);
  metadataRaw = meta.raw;
  metadata = meta.data;

  if (!isProcessMetadata(metadata)) {
    errors.push('metadata.json: ManagerName не ProcessSchemaManager');
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


  // Check 1: ModifiedOnUtc recency
  if (descriptor.Descriptor.ModifiedOnUtc) {
    const match = descriptor.Descriptor.ModifiedOnUtc.match(/\/Date\((\d+)\)\//);
    if (match) {
      const modTs = parseInt(match[1]);
      const metaMtime = fs.statSync(metadataPath).mtimeMs;
      const now = Date.now();
      const withinLast24h = (now - metaMtime) < 24 * 60 * 60 * 1000;
      if (withinLast24h && metaMtime > modTs + 10 * 60 * 1000) {
        warnings.push('descriptor.json: ModifiedOnUtc старше правки metadata.json — обнови штамп');
      }
    }
  }

  // Check 2: B6 equals package descriptor UId (ВНИМАНИЕ, not ОШИБКА)
  const pkgRoot = getPkgRoot(processFolder);
  if (pkgRoot) {
    const pkgDescPath = path.join(pkgRoot, 'descriptor.json');
    if (fs.existsSync(pkgDescPath)) {
      const pkgDescriptor = readJSON(pkgDescPath);
      if (pkgDescriptor && schema.B6 !== pkgDescriptor.Descriptor.UId) {
        warnings.push('процесс: B6 не совпадает с UId пакета');
      }
    }
  }

  // Check 3: template placeholders
  if (metadataRaw.includes('<UId ') || metadataRaw.includes('<Id ')) {
    errors.push('процесс: остался плейсхолдер шаблона');
  }

  // Collect all BK4 elements (for lane and flow checks)
  const bk4 = schema.BK4 || [];
  const bk3 = schema.BK3 || [];
  const bk15 = schema.BK15 || [];
  const fj1 = schema.FJ1 || [];

  // Build lane UId set
  const laneUIds = new Set();
  for (const laneSet of bk3) {
    if (laneSet.BM4) {
      for (const lane of laneSet.BM4) {
        laneUIds.add(lane.UId);
      }
    }
  }

  // Build element map for quick lookup
  const elementMap = {};
  const flowMap = {};
  const elementNames = {};
  for (let i = 0; i < bk4.length; i++) {
    const el = bk4[i];
    const isFlow = el.BL1 && (el.BL1.includes('SequenceFlow') || el.BL1.includes('ConditionalFlow'));
    if (isFlow) {
      flowMap[el.UId] = { ...el, index: i };
    } else {
      elementMap[el.UId] = { ...el, index: i };
      if (el.A2) elementNames[el.A2] = el.UId;
    }
  }

  // Read resource file once
  const pkgRoot2 = getPkgRoot(processFolder);
  let ruResPath, enResPath;
  if (pkgRoot2) {
    const resBase = path.join(pkgRoot2, 'Resources', `${schema.A2}.Process`);
    ruResPath = path.join(resBase, 'resource.ru-RU.xml');
    enResPath = path.join(resBase, 'resource.en-US.xml');
  } else {
    const resFolder = path.join(processFolder, '..', `${schema.A2}.Process`);
    ruResPath = path.join(resFolder, 'resource.ru-RU.xml');
    enResPath = path.join(resFolder, 'resource.en-US.xml');
  }

  // Check 4: Coordinates format
  for (const el of bk4) {
    const elLabel = el.A2 ? `${el.A2}` : 'элемент';
    if (el.BL3 && !/^-?\d+;-?\d+$/.test(el.BL3)) {
      errors.push(`элемент ${elLabel}: BL3 "${el.BL3}" — координаты только целые (дробные ломают «Обновить из файловой системы»)`);
    }
    if (el.BN2 && !/^-?\d+;-?\d+$/.test(el.BN2)) {
      errors.push(`элемент ${elLabel}: BN2 "${el.BN2}" — координаты только целые`);
    }
    if (el.CI11 && !/^-?\d+;-?\d+$/.test(el.CI11)) {
      errors.push(`связь ${el.A2}: CI11 "${el.CI11}" — координаты только целые`);
    }
    if (el.CI12 && !/^-?\d+;-?\d+$/.test(el.CI12)) {
      errors.push(`связь ${el.A2}: CI12 "${el.CI12}" — координаты только целые`);
    }
  }

  // Check 5: Lanes - every non-flow element with IL2 must reference lane
  for (const el of bk4) {
    if (!el.BL1 || (!el.BL1.includes('SequenceFlow') && !el.BL1.includes('ConditionalFlow'))) {
      if (el.IL2 && !laneUIds.has(el.IL2)) {
        errors.push(`элемент ${el.A2}: IL2 ссылается на несуществующую дорожку`);
      }
    }
  }

  // Check 6: Flows
  for (const flow of Object.values(flowMap)) {
    const ci1Uid = flow.CI1;
    const ci2Uid = flow.CI2;

    if (!ci1Uid || !elementMap[ci1Uid]) {
      errors.push(`связь ${flow.A2}: CI1 ссылается на несуществующий элемент`);
    }
    if (!ci2Uid || !elementMap[ci2Uid]) {
      errors.push(`связь ${flow.A2}: CI2 ссылается на несуществующий элемент`);
    }

    if (ci1Uid && elementMap[ci1Uid] && ci2Uid && elementMap[ci2Uid]) {
      const srcIdx = elementMap[ci1Uid].index;
      const tgtIdx = elementMap[ci2Uid].index;
      if (flow.index <= srcIdx || flow.index <= tgtIdx) {
        errors.push(`связь ${flow.A2}: связь стоит в BK4 раньше своей фигуры`);
      }
    }

    if (!flow.CI11 || !flow.CI12) {
      warnings.push(`связь ${flow.A2}: нет координат концов линии`);
    }

    // Check line endpoints are inside rectangles (with 6px expansion)
    if (flow.CI11 && flow.CI12 && elementMap[ci1Uid] && elementMap[ci2Uid]) {
      const srcEl = elementMap[ci1Uid];
      const tgtEl = elementMap[ci2Uid];

      if (srcEl.BL3 && srcEl.BN2 && flow.CI11) {
        const [sx, sy] = srcEl.BL3.split(';').map(Number);
        const [sw, sh] = srcEl.BN2.split(';').map(Number);
        const [cx, cy] = flow.CI11.split(';').map(Number);
        if (!(cx >= sx - 6 && cx <= sx + sw + 6 && cy >= sy - 6 && cy <= sy + sh + 6)) {
          warnings.push(`связь ${flow.A2}: конец линии CI11 не на фигуре — Designer нарисует линию мимо; пересчитай CI11/CI12`);
        }
      }

      if (tgtEl.BL3 && tgtEl.BN2 && flow.CI12) {
        const [tx, ty] = tgtEl.BL3.split(';').map(Number);
        const [tw, th] = tgtEl.BN2.split(';').map(Number);
        const [cx, cy] = flow.CI12.split(';').map(Number);
        if (!(cx >= tx - 6 && cx <= tx + tw + 6 && cy >= ty - 6 && cy <= ty + th + 6)) {
          warnings.push(`связь ${flow.A2}: конец линии CI12 не на фигуре — Designer нарисует линию мимо; пересчитай CI11/CI12`);
        }
      }
    }
  }

  // Check 7: Duplicate UIds
  const seenUIds = new Set();
  for (const el of bk4) {
    if (seenUIds.has(el.UId)) {
      errors.push(`процесс: дублирующийся UId в BK4: ${el.UId}`);
    }
    seenUIds.add(el.UId);
  }
  for (const param of fj1) {
    if (seenUIds.has(param.UId)) {
      errors.push(`процесс: дублирующийся UId в FJ1: ${param.UId}`);
    }
    seenUIds.add(param.UId);
  }

  // Check for duplicate params in elements
  for (const el of bk4) {
    if (el.BP2) {
      const paramUIds = new Set();
      for (const param of el.BP2) {
        if (paramUIds.has(param.UId)) {
          errors.push(`элемент ${el.A2}: дублирующийся UId в BP2: ${param.UId}`);
        }
        paramUIds.add(param.UId);
        if (seenUIds.has(param.UId)) {
          errors.push(`процесс: дублирующийся UId параметра: ${param.UId}`);
        }
        seenUIds.add(param.UId);
      }
    }
  }

  // Check for duplicate UIds in mappings
  const mappingUIds = new Set();
  for (const mapping of bk15) {
    if (mappingUIds.has(mapping.UId)) {
      errors.push(`процесс: дублирующийся UId в маппинге: ${mapping.UId}`);
    }
    mappingUIds.add(mapping.UId);
    if (seenUIds.has(mapping.UId)) {
      errors.push(`процесс: дублирующийся UId маппинга: ${mapping.UId}`);
    }
    seenUIds.add(mapping.UId);
  }

  // Check 8: Mappings - F1 fix: include L18 nested params
  const buildParamLookup = () => {
    const lookup = {};
    // Direct BP2 params
    for (const el of bk4) {
      if (el.BP2) {
        for (const param of el.BP2) {
          if (!lookup[param.UId]) lookup[param.UId] = [];
          lookup[param.UId].push({ elName: el.A2, nested: false });
        }
      }
    }
    // L18 nested params
    for (const el of bk4) {
      if (el.BP2) {
        for (const param of el.BP2) {
          if (param.L18 && Array.isArray(param.L18)) {
            for (const nestedParam of param.L18) {
              if (nestedParam.UId) {
                if (!lookup[nestedParam.UId]) lookup[nestedParam.UId] = [];
                lookup[nestedParam.UId].push({ elName: el.A2, nested: true });
              }
            }
          }
        }
      }
    }
    return lookup;
  };

  const paramLookup = buildParamLookup();

  for (const mapping of bk15) {
    const gt3 = mapping.GT3;
    if (!gt3) continue;

    const locations = paramLookup[gt3] || [];
    if (locations.length === 0) {
      warnings.push(`маппинг ${mapping.A2}: ссылается на несуществующий параметр ${gt3} — лишний маппинг, удали или проверь параметр`);
    }
  }

  // Check 9: Filters (dataSourceFilters and serializedFilterEditData)
  const checkFilters = (str, elemName) => {
    try {
      if (!str || typeof str !== 'string') return;
      if (!str.startsWith('{')) return;
      const obj = JSON.parse(str);
      if (!obj || typeof obj !== 'object') return;

      const checkFilterObj = (filterObj, isWarning) => {
        const walk = (o) => {
          if (o && typeof o === 'object') {
            if (o.parameter && typeof o.parameter === 'object' && typeof o.parameter.value === 'string' && o.parameter.value.startsWith('[')) {
              if (isWarning) {
                warnings.push(`элемент ${elemName}: в фильтре ссылка на параметр строкой`);
              } else {
                errors.push(`элемент ${elemName}: в фильтре ссылка на параметр строкой — нужен объект {"value": "..."}`);
              }
            }
            for (const value of Object.values(o)) {
              walk(value);
            }
          } else if (Array.isArray(o)) {
            o.forEach(walk);
          }
        };
        walk(filterObj);
      };

      if (obj.dataSourceFilters) {
        try {
          const dsf = JSON.parse(obj.dataSourceFilters);
          checkFilterObj(dsf, false);
        } catch (e) {
          // not JSON
        }
      }

      if (obj.serializedFilterEditData) {
        try {
          const sfe = JSON.parse(obj.serializedFilterEditData);
          checkFilterObj(sfe, true);
        } catch (e) {
          // not JSON
        }
      }
    } catch (e) {
      // not JSON
    }
  };

  for (const el of bk4) {
    walkStrings(el, (str) => {
      if (typeof str === 'string' && str.startsWith('{')) {
        checkFilters(str, el.A2 || 'элемент');
      }
    });
  }

  for (const mapping of bk15) {
    walkStrings(mapping, (str) => {
      if (typeof str === 'string' && str.startsWith('{')) {
        checkFilters(str, mapping.A2 || 'маппинг');
      }
    });
  }

  // Check 10: Instance caption
  if (schema.BK37 && schema.BK37.L8 && schema.BK37.L8.GS2) {
    if (schema.BK37.L8.GS2 !== '[#[PropertyValue:Caption]#]') {
      errors.push('процесс: BK37.L8.GS2 должно быть "[#[PropertyValue:Caption]#]"');
    }
  }

  // Check for [#PropertyValue:...#] without inner brackets
  walkStrings(schema, (str) => {
    if (typeof str === 'string' && str.includes('[#PropertyValue:') && !str.includes('[#[PropertyValue:')) {
      errors.push('процесс: формула [#PropertyValue:...#] без внутренних скобок');
    }
  });

  // Check 11: Script code - G3 fix: only if IsInterpretable=True
  const propertiesPath = path.join(processFolder, 'properties.json');
  let isInterpretable = false;
  if (fs.existsSync(propertiesPath)) {
    try {
      const props = readJSON(propertiesPath);
      isInterpretable = props && props.IsInterpretable === 'True';
    } catch (e) {
      // skip
    }
  }

  if (isInterpretable) {
    for (const el of bk4) {
      const isScriptTask = el.BL1 && el.BL1.includes('ProcessSchemaScriptTask');
      if (isScriptTask && el.CH1) {
        const originalCode = el.CH1;
        const code = stripCSharpCode(originalCode);

        for (const [elName, uid] of Object.entries(elementNames)) {
          if (elName.length >= 3) {
            const regex = new RegExp('\\b' + elName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\.', 'g');
            let match;
            while ((match = regex.exec(code)) !== null) {
              // Check preceding text (up to 20 chars)
              const start = Math.max(0, match.index - 20);
              const preceding = code.substring(start, match.index);
              if (!/<\s*$|new\s+$|typeof\s*\(\s*$|,\s*$/.test(preceding)) {
                errors.push(`элемент ${el.A2}: сценарий обращается к элементу ${elName} по имени — CS0103; передай значение формулой в параметр процесса`);
                break;
              }
            }
          }
        }

        if (/Get\s*<\s*Entity\s*>\s*\(\s*"[^"]+\.ResultEntity"/.test(originalCode)) {
          warnings.push(`элемент ${el.A2}: Get<Entity>(...ResultEntity) ломает обновление, если колонка есть в условии шлюза`);
        }
      }
    }

    // Check BK32 (methods code)
    if (schema.BK32) {
      const code = stripCSharpCode(schema.BK32);
      for (const [elName, uid] of Object.entries(elementNames)) {
        if (elName.length >= 3) {
          const regex = new RegExp('\\b' + elName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\.', 'g');
          let match;
          while ((match = regex.exec(code)) !== null) {
            const start = Math.max(0, match.index - 20);
            const preceding = code.substring(start, match.index);
            if (!/<\s*$|new\s+$|typeof\s*\(\s*$|,\s*$/.test(preceding)) {
              errors.push(`процесс: сценарий обращается к элементу ${elName} по имени — CS0103; передай значение формулой в параметр процесса`);
              break;
            }
          }
        }
      }
    }
  }

  // Check 12: «Читать данные» element - F2 and F3 fixes
  const readDataUId = 'cb455b6f-78ff-4b1e-b241-c2bbc0b37e9f';
  for (const el of bk4) {
    if (el.J6 === readDataUId && el.BP2) {
      const resultCompositeObjParam = el.BP2.find(p => p.A2 === 'ResultCompositeObjectList');
      if (resultCompositeObjParam && resultCompositeObjParam.L18) {
        // G2: Check captions - group by both-missing, one-missing
        const ruFileExists = fs.existsSync(ruResPath);
        const enFileExists = fs.existsSync(enResPath);

        if (ruFileExists || enFileExists) {
          let ruContent = '';
          let enContent = '';
          if (ruFileExists) ruContent = fs.readFileSync(ruResPath, 'utf8');
          if (enFileExists) enContent = fs.readFileSync(enResPath, 'utf8');

          const bothMissing = [];
          const l18Cols = resultCompositeObjParam.L18;

          for (const colParam of l18Cols) {
            const colName = colParam.A2;
            const captionKey = `BaseElements.${el.A2}.Parameters.ResultCompositeObjectList.${colName}.Caption`;
            const escapedKey = captionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`<Item Name="${escapedKey}" Value=`);

            const ruExists = ruFileExists && regex.test(ruContent);
            const enExists = enFileExists && regex.test(enContent);

            if (ruFileExists && enFileExists && !ruExists && !enExists) {
              bothMissing.push(colName);
            } else if (ruExists && enFileExists && !enExists) {
              warnings.push(`элемент ${el.A2}: подпись колонки ${colName} только в ru-RU — добавь en-US`);
            } else if (ruFileExists && !ruExists && enExists) {
              warnings.push(`элемент ${el.A2}: подпись колонки ${colName} только в en-US — добавь ru-RU`);
            }
          }

          if (bothMissing.length > 0) {
            if (bothMissing.length === l18Cols.length) {
              errors.push(`элемент ${el.A2}: нет подписей колонок ${bothMissing.join(', ')} (BaseElements.${el.A2}.Parameters.ResultCompositeObjectList.<Колонка>.Caption) — Designer не откроет элемент`);
            } else {
              warnings.push(`элемент ${el.A2}: нет подписи колонок ${bothMissing.join(', ')} — добавь в обе культуры`);
            }
          }
        }
      }

      // F3: Check ResultCount usage - INVERTED logic: warn if REFERENCED
      const resultTypeParam = el.BP2.find(p => p.A2 === 'ResultType');
      if (resultTypeParam && resultTypeParam.L8 && resultTypeParam.L8.GS2 === '0') {
        const resultCountParam = el.BP2.find(p => p.A2 === 'ResultCount');
        if (resultCountParam) {
          const rcUId = resultCountParam.UId;
          const paramRef = `[Parameter:{${rcUId}}]`;

          // Count occurrences in other BK4 entries
          let refCount = 0;
          for (const other of bk4) {
            if (other.UId === el.UId) continue;
            refCount += (JSON.stringify(other).match(new RegExp(paramRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          }

          // Count in BK15 mappings with different A2
          for (const mapping of bk15) {
            if (mapping.A2 !== el.A2) {
              refCount += (JSON.stringify(mapping).match(new RegExp(paramRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            }
          }

          if (refCount > 0) {
            warnings.push(`элемент ${el.A2}: ResultCount в режиме «первая запись» всегда 0 — используй режим Count`);
          }
        }
      }
    }
  }

  // Check 13: Start for programmatic run - F8 fix: scan whole Pkg
  let hasStartEvent = false;
  for (const el of bk4) {
    if (el.BL1 && el.BL1.includes('ProcessSchemaStartEvent')) {
      hasStartEvent = true;
      break;
    }
  }

  if (!hasStartEvent && pkgRoot) {
    const processName = schema.A2;

    // Pre-check: name must be in text to bother scanning
    const skipDirs = new Set(['Files', 'Autogenerated', 'Assemblies', 'Resources', 'Data', 'SqlScripts']);

    const scanDir = (dir, depth = 0) => {
      if (depth > 3 || !fs.existsSync(dir)) return { executeFound: false, executeFile: null, sysFound: false, sysFile: null };

      const dirName = path.basename(dir);
      if (skipDirs.has(dirName)) return { executeFound: false, executeFile: null, sysFound: false, sysFile: null };

      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const p = path.join(dir, item);
          try {
            const stat = fs.statSync(p);
            if (stat.size > 3 * 1024 * 1024) continue;

            if (stat.isDirectory()) {
              const res = scanDir(p, depth + 1);
              if (res.executeFound || res.sysFound) return res;
            } else if ((item.endsWith('.cs') || item.endsWith('.js') || item === 'metadata.json')) {
              try {
                const text = fs.readFileSync(p, 'utf8');
                if (!text.includes(processName)) continue;

                const execRegex = new RegExp(`ProcessExecutor\\s*\\.\\s*Execute(?:<[^>]*>)?\\s*\\(\\s*"${processName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
                const sysRegex = new RegExp(`sysProcessName:\\s*"${processName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);

                if (execRegex.test(text)) {
                  return { executeFound: true, executeFile: path.relative(pkgRoot, p), sysFound: false, sysFile: null };
                }
                if (sysRegex.test(text)) {
                  return { executeFound: false, executeFile: null, sysFound: true, sysFile: path.relative(pkgRoot, p) };
                }
              } catch (e) {
                // skip unreadable files
              }
            }
          } catch (e) {
            // skip
          }
        }
      } catch (e) {
        // skip
      }
      return { executeFound: false, executeFile: null, sysFound: false, sysFile: null };
    };

    const result = scanDir(pkgRoot);
    if (result.executeFound) {
      errors.push(`процесс: процесс запускают через ProcessExecutor.Execute (${result.executeFile}), а простого старта нет — ProcessCannotBeManuallyStartedException`);
    }
    if (result.sysFound) {
      warnings.push(`процесс: процесс запускают через sysProcessName (${result.sysFile}), а простого старта нет`);
    }
  }

  // Check 14: User signal data - F4 fix: only warn when RecordId is referenced
  for (const el of bk4) {
    if (el.BL1 && el.BL1.includes('ProcessSchemaStartSignalEvent')) {
      if (el.DZ1 && el.DZ1 !== 'null' && typeof el.DZ1 === 'string') {
        const recordIdParam = el.FC1 && el.FC1.find(p => p.A2 === 'RecordId');
        if (recordIdParam) {
          const rIdUId = recordIdParam.UId;
          const paramRef = `[Parameter:{${rIdUId}}]`;
          let found = false;

          // Check other BK4 elements
          for (const other of bk4) {
            if (other.UId === el.UId) continue;
            if (JSON.stringify(other).includes(paramRef)) {
              found = true;
              break;
            }
          }

          // Check BK15 mappings
          if (!found) {
            for (const mapping of bk15) {
              if (JSON.stringify(mapping).includes(paramRef)) {
                found = true;
                break;
              }
            }
          }

          if (!found) {
            warnings.push(`элемент ${el.A2}: произвольный сигнал не передаёт данные — RecordId будет пустым`);
          }
        }
      }
    }
  }

  // Check 15: Resources - F5 fix
  const processCaption = `BaseElements.${schema.A2}.Caption`;
  const elementCaptionRegex = /^BaseElements\.[^.]+\.Caption$/;

  if (fs.existsSync(ruResPath) && fs.existsSync(enResPath)) {
    const ruRes = fs.readFileSync(ruResPath, 'utf8');
    const enRes = fs.readFileSync(enResPath, 'utf8');

    const ruKeys = new Set();
    const enKeys = new Set();

    for (const match of ruRes.matchAll(/<Item Name="([^"]+)" Value=/g)) {
      ruKeys.add(match[1]);
    }

    for (const match of enRes.matchAll(/<Item Name="([^"]+)" Value=/g)) {
      enKeys.add(match[1]);
    }


    // Compare element captions only
    const ruElementCaptions = [...ruKeys].filter(k => elementCaptionRegex.test(k));
    const enElementCaptions = [...enKeys].filter(k => elementCaptionRegex.test(k));

    const ruOnly = ruElementCaptions.filter(k => !enKeys.has(k));
    const enOnly = enElementCaptions.filter(k => !ruKeys.has(k));

    if (ruOnly.length > 0) {
      const samples = ruOnly.slice(0, 5);
      warnings.push(`ресурсы: ${ruOnly.length} ключ(ей) в ru-RU, но не в en-US: ${samples.join(', ')}`);
    }
    if (enOnly.length > 0) {
      const samples = enOnly.slice(0, 5);
      warnings.push(`ресурсы: ${enOnly.length} ключ(ей) в en-US, но не в ru-RU: ${samples.join(', ')}`);
    }
  } else if (!fs.existsSync(ruResPath) || !fs.existsSync(enResPath)) {
    warnings.push(`ресурсы: отсутствует файл ресурсов`);
  }

  return { errors, warnings };
};

const main = () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Использование: node check-process.js <путь> [<путь> ...]');
    console.log('<путь> = папка процесса (содержит metadata.json) или пакета (содержит Schemas/)');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let processCount = 0;

  for (const target of args) {
    const folders = getProcessFolders(target);

    for (const folder of folders) {
      const meta = readJSON(path.join(folder, 'metadata.json'));
      if (!meta) continue;

      const schema = meta.MetaData.Schema;
      const name = schema.A2;

      const { errors, warnings } = validateProcess(folder);

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
      processCount++;
    }
  }

  if (processCount > 1) {
    console.log(`Всего: ${totalErrors} ошибок, ${totalWarnings} предупреждений в ${processCount} процессах`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
};

if (require.main === module) {
  main();
}

module.exports = { validateProcess, getProcessFolders };
