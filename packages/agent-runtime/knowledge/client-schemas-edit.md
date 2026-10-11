# Клиентские схемы (ClientUnitSchemaManager) — рецепты создания/редактирования

Общая механика — см. `metadata-editing.md`. **Статус: ни один рецепт ниже НЕ проверен реальной записью** — это производные выводы из чтения `client-schemas.md`.

**Не забывай про 2 обязательных правила из `metadata-editing.md`: (1) обе локали `ru-RU`+`en-US` для ресурсов, (2) актуальный `ModifiedOnUtc` при каждом изменении `descriptor.json`.**

## ✅ Обязательный шаг перед созданием или переопределением схемы: собери иерархию и все секции родителя

**Зачем**: прежде чем писать новую схему-наследника или override существующей, нужно знать, что родитель уже определяет во ВСЕХ секциях — методы, атрибуты, сообщения, детали, модули, правила, элементы вёрстки (`diff`). Любую секцию можно переопределить или переиспользовать из родителя, но правила объединения у секций разные — см. `client-schemas.md`, подраздел «Как объединяются секции конфига между слоями».

**Статус**: сбор иерархии и всех секций — ✅ подтверждён (скрипт ниже проверен на реальных схемах — 49, 17 и 48 слоёв, ноль ошибок разбора; модель `diff` сверена с исходным кодом `JsonApplier`). Запись кода, опирающегося на результат, — ✅ проверена: по отчёту скрипта написаны и подтверждены в CRM все клиентские схемы шагов 1–13 (28–29.09.2026).

### Скрипт
Готовый скрипт лежит в каталоге знаний: `scripts/hierarchy.js` (тот же код, что ниже). Запуск: `APP=<корень приложения> node <каталог знаний>/scripts/hierarchy.js <ИмяСхемы>` — сохранять его во временный файл не нужно (запись вне `Pkg` агенту запрещена). Корень приложения — папка, в которой лежат `BPMSoft.Configuration` и `conf`. Для новой, ещё не созданной схемы запускай скрипт на её будущем родителе.

```js
// hierarchy.js — полная иерархия клиентской схемы и все секции её конфига (methods, attributes, diff, details, rules и т.д.).
// Запуск: APP=<корень приложения> node hierarchy.js <ИмяСхемы>
const fs=require('fs'),path=require('path');
const APP=process.env.APP, PKG=path.join(APP,'BPMSoft.Configuration/Pkg'), CC=path.join(APP,'conf/content');
const rd=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));
const deep=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>'':deep(),apply:()=>deep(),construct:()=>deep()});
globalThis.BPMSoft=deep(); globalThis.Ext=deep(); // код слоёв обращается к this.BPMSoft.* и this.Ext.* через глобальный this
['window','document','navigator','localStorage','sessionStorage','location','ResizeObserver','MutationObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','jQuery','$','Image','FileReader','Notification','Audio','HTMLElement','getComputedStyle','screen','alert','require'].forEach(k=>{ if(!(k in globalThis)) globalThis[k]=deep(); }); // браузерные глобалы, которые код слоёв трогает при загрузке
// 1. Зависимости пакетов: топологический порядок и транзитивное замыкание
const deps={}; for(const p of fs.readdirSync(PKG)){ const f=path.join(PKG,p,'descriptor.json'); if(fs.existsSync(f)) deps[p]=(rd(f).Descriptor.DependsOn||[]).map(d=>d.Name); }
const topo=[],seen={}; const visit=p=>{ if(seen[p])return; seen[p]=1; (deps[p]||[]).forEach(visit); topo.push(p); }; Object.keys(deps).sort().forEach(visit);
const idx=Object.fromEntries(topo.map((p,i)=>[p,i]));
const closure=(p,s=new Set())=>{ if(s.has(p))return s; s.add(p); (deps[p]||[]).forEach(d=>closure(d,s)); return s; };
// 2. Выполнить файл схемы с заглушками: define() -> конфиги слоёв, Ext.define() -> тела классов миксинов
function run(file){ const mods={},cls={};
  const define=(n,d,f)=>{ if(typeof d==='function'){f=d;d=[];} try{ const r=typeof f==='function'?f(...d.map(()=>deep())):f; mods[n]=r&&typeof r==='object'&&!Array.isArray(r)?r:{__notcfg:true}; }catch(e){ mods[n]={__err:e.message}; } };
  const Ext=new Proxy({},{get:(t,k)=>k==='define'?(c,b)=>{cls[c]=b;}:deep()});
  try{ new Function('define','Ext',fs.readFileSync(file,'utf8'))(define,Ext); }catch(e){ /* ошибка кода вне define() — конфиги, определённые до неё, уже собраны */ } return {mods,cls}; }
const pkgOf=d=>path.relative(PKG,d).split(path.sep)[0];
const pkgDirs=n=>Object.keys(deps).map(p=>path.join(PKG,p,'Schemas',n)).filter(d=>fs.existsSync(path.join(d,n+'.js'))).sort((a,b)=>idx[pkgOf(a)]-idx[pkgOf(b)]);
const desc=d=>rd(path.join(d,'descriptor.json')).Descriptor;
// 3. Рекурсивно: слои из conf/content (или собственный слой в Pkg) + override из Pkg, затем родитель
function resolve(name){
  const dirs=pkgDirs(name), own=dirs.filter(d=>!desc(d).ExtendParent), over=dirs.filter(d=>desc(d).ExtendParent);
  const cc=path.join(CC,name+'.js'); let layers=[], parent;
  if(fs.existsSync(cc)){ const h=fs.readFileSync(cc,'utf8').split('\n')[0];
    const stack=JSON.parse(h.match(/innerHierarchyStack: (\[[^\]]*\])/)[1]); parent=(h.match(/structureParent: "([^"]+)"/)||[])[1];
    const {mods}=run(cc); layers=stack.map(l=>({layer:l,pkg:null,cfg:mods[l]}));
  } else if(own.length){ parent=(desc(own[0]).Parent||{}).Name; layers=[{layer:name,pkg:pkgOf(own[0]),cfg:run(path.join(own[0],name+'.js')).mods[name]}]; }
  else throw new Error('Схема не найдена ни в Pkg, ни в conf/content (или у неё нет .js — например схема стилей только с .less): '+name);
  over.forEach(d=>layers.push({layer:name+' (override)',pkg:pkgOf(d),cfg:run(path.join(d,name+'.js')).mods[name]}));
  return (parent?resolve(parent):[]).concat(layers);
}
function mixinMethods(alias){ const n=alias.replace(/^BPMSoft\./,'');
  const f=[...pkgDirs(n).map(d=>path.join(d,n+'.js')),path.join(CC,n+'.js')].find(fs.existsSync); if(!f) return null;
  const body=Object.values(run(f).cls)[0]||{}; return Object.keys(body).filter(k=>typeof body[k]==='function'); }
// 4. Модель вёрстки (как JsonApplier платформы): дерево строится из diff всех слоёв, начиная с []
const clone=v=>JSON.parse(JSON.stringify(v===undefined?null:v));
function find(node,name){ if(!name) return null;
  if(Array.isArray(node)){ for(let i=0;i<node.length;i++){ const x=node[i]; if(x&&typeof x==='object'&&x.name===name) return {arr:node,i}; const r=find(x,name); if(r) return r; } }
  else if(node&&typeof node==='object'){ for(const v of Object.values(node)){ const r=find(v,name); if(r) return r; } }
  return null; }
function tag(node,layer){ if(Array.isArray(node)) node.forEach(x=>tag(x,layer)); else if(node&&typeof node==='object'){ if(node.name&&!node.__layer) node.__layer=layer; Object.values(node).forEach(x=>tag(x,layer)); } return node; }
function dedupe(node){ if(Array.isArray(node)){ const seen=new Set(); for(let i=node.length-1;i>=0;i--){ const x=node[i]; dedupe(x); if(x&&x.name){ if(seen.has(x.name)) node.splice(i,1); else seen.add(x.name); } } }
  else if(node&&typeof node==='object') Object.values(node).forEach(dedupe); }
function insert(view,o,item){ const p=o.parentName?find(view,o.parentName):null;
  if(!p){ typeof o.index==='number'?view.splice(o.index,0,item):view.push(item); return o.parentName?'root':'ok'; }
  const cont=p.arr[p.i][o.propertyName];
  if(Array.isArray(cont)){ typeof o.index==='number'?cont.splice(o.index,0,item):cont.push(item); return 'ok'; }
  if(cont&&typeof cont==='object'){ p.arr[p.i][o.propertyName]=item; return 'ok'; }
  return 'throw'; }
function applyDiff(view,diff,layer,log){ // порядок платформы: merge -> remove/move/insert -> remove свойств -> set
  const ops=(Array.isArray(diff)?diff:[]).filter(o=>o&&o.operation), by=t=>ops.filter(o=>o.operation===t);
  const start=clone(view), miss=o=>find(start,o.name)?'gone':'missing', from=r=>r.arr[r.i].__layer;
  const mk=o=>tag(Object.assign(clone(o.values||{}),o.name?{name:o.name}:{}),layer);
  by('merge').forEach(o=>{ const r=find(view,o.name); log('merge',o,r?'ok':'missing',r&&from(r)); if(r) Object.assign(r.arr[r.i],tag(clone(o.values||{}),layer)); });
  by('remove').filter(o=>!o.properties).forEach(o=>{ const r=find(view,o.name); log('remove',o,r?'ok':miss(o),r&&from(r)); if(r) r.arr.splice(r.i,1); });
  by('move').forEach(o=>{ const r=find(view,o.name); if(!r) return log('move',o,miss(o)); const f=from(r); log('move',o,insert(view,o,r.arr.splice(r.i,1)[0]),f); });
  by('insert').forEach(o=>{ const d=find(view,o.name), f=d&&from(d), res=insert(view,o,mk(o)); log('insert',o,d&&res!=='throw'?'dup':res,f); });
  by('remove').filter(o=>o.properties).forEach(o=>{ const r=find(view,o.name); log('removeProps',o,r?'ok':miss(o),r&&from(r)); if(r) [].concat(o.properties).forEach(p=>delete r.arr[r.i][p]); });
  by('set').forEach(o=>{ const r=find(view,o.name); log('set',o,r?'ok':'missing',r&&from(r)); if(r) r.arr[r.i]=mk(o); else insert(view,o,mk(o)); });
  dedupe(view); }
const MSG={ 'merge:ok':'OK','merge:missing':'⚠ элемента нет у родителей — merge молча не сработает',
  'remove:ok':'OK','remove:gone':'уже удалён вместе с контейнером в этом слое (избыточно)','remove:missing':'⚠ элемента нет у родителей — ничего не удалит',
  'removeProps:ok':'OK','removeProps:gone':'элемент уже удалён в этом слое','removeProps:missing':'⚠ элемента нет у родителей',
  'move:ok':'OK','move:root':'⚠ нового контейнера нет — элемент уйдёт в корень вёрстки','move:throw':'⚠ у контейнера нет свойства propertyName — исключение','move:gone':'элемент уже удалён в этом слое','move:missing':'⚠ элемента нет у родителей — не будет перемещён',
  'insert:ok':'новый','insert:dup':'⚠ имя уже занято — в одном контейнере останется последний','insert:root':'⚠ контейнера нет — элемент попадёт в корень вёрстки','insert:throw':'⚠ у контейнера нет свойства propertyName — исключение',
  'set:ok':'OK — элемент заменяется целиком','set:missing':'⚠ элемента нет — будет вставлен как новый' };
// 5. Секции конфига: для каждого имени — в каких слоях оно определено
const target=process.argv[2], chain=resolve(target), home=chain[chain.length-1].pkg, ok=home?closure(home):null;
const KEYED=['methods','attributes','messages','details','modules','dataModels','properties','mixins'], RULES=['rules','businessRules','businessRulesMultiplyActions'];
const names={}, add=(s,n,l)=>((names[s]=names[s]||{})[n]=names[s][n]||[]).push(l);
const ruleKeys=(s,v)=>s==='businessRulesMultiplyActions'?Object.keys(v||{}):Object.entries(v||{}).flatMap(([c,r])=>Object.keys(r||{}).map(n=>c+'.'+n));
const view=[], mix={}, diffRep=[]; let err=0, notcfg=0;
chain.forEach((l,i)=>{ l.out=!!(ok&&l.pkg&&!ok.has(l.pkg)); const c=l.cfg, top=i===chain.length-1; if(!c||c.__notcfg){notcfg++;return;} if(c.__err){err++;return;}
  KEYED.forEach(s=>{ const v=c[s]; if(v) (Array.isArray(v)?v.map(String):Object.keys(v)).forEach(n=>add(s,n,l)); });
  RULES.forEach(s=>ruleKeys(s,c[s]).forEach(n=>add(s,n,l)));
  Object.values(Array.isArray(c.mixins)?{}:(c.mixins||{})).filter(a=>typeof a==='string').forEach(a=>{ if(!(a in mix)) mix[a]=mixinMethods(a); });
  applyDiff(view,c.diff,l.layer,(op,o,res,f)=>{ if(top) diffRep.push({op,o,res,f}); }); });
let els=0; (function c(n){ if(Array.isArray(n)) n.forEach(c); else if(n&&typeof n==='object'){ if(n.name) els++; Object.values(n).forEach(c);} })(view);
// 6. Отчёт
console.log(`Слоёв: ${chain.length}, ошибок разбора: ${err}${notcfg?`, слоёв без конфига (модуль/миксин — класс Ext, или пустой .js схемы стилей; секций нет): ${notcfg}`:''}, пакет схемы: ${home||'залоченный (conf/content)'}`);
chain.forEach((l,i)=>console.log(String(i+1).padStart(2), l.layer.padEnd(40), l.pkg?'Pkg/'+l.pkg+(l.out?'  ⚠ вне зависимостей пакета':''):'conf/content'));
console.log('Уникальных имён по секциям: '+Object.entries(names).map(([s,v])=>s+'='+Object.keys(v).length).join(', ')+`, элементов вёрстки=${els}`);
for(const [a,m] of Object.entries(mix)) console.log(`Миксин ${a}: ${m?m.length+' методов':'не найден как схема (ядровый класс)'}`);
const top=chain[chain.length-1]; console.log(`\nСобственный слой ${target}:`);
const esn=chain.map(l=>l.cfg&&l.cfg.entitySchemaName).filter(Boolean); console.log(`  entitySchemaName: ${esn[esn.length-1]||'—'}`);
Object.entries(names).forEach(([s,ns])=>{ const mine=Object.entries(ns).filter(([,ls])=>ls[ls.length-1]===top); if(!mine.length) return;
  console.log(`  [${s}]`); mine.forEach(([n,ls])=>{ const p=ls.slice(0,-1).filter(l=>!l.out).pop();
    console.log(`    ${n}: ${p?'override, ближайший родитель — '+p.layer+(p.pkg?' [Pkg/'+p.pkg+']':' [conf/content]'):'новый'}`); }); });
if(diffRep.length){ console.log('  [diff]'); const gone=diffRep.filter(d=>d.res==='gone');
  diffRep.filter(d=>d.res!=='gone').forEach(({op,o,res,f})=>console.log(`    ${op} ${o.name}${o.parentName?' в '+o.parentName:''}: ${MSG[op+':'+res]||res}${f?' (элемент из '+f+')':''}`));
  if(gone.length) console.log(`    + ${gone.length} операций над элементами, уже удалёнными вместе с контейнером в этом слое (избыточно, безвредно)`); }
```

**Исправления скрипта (27.09.2026)**: (1) заглушки `this.Ext` и браузерных глобалов (`window`, `document`, `ResizeObserver`, `require` и др.) — без них падали слои, которые трогают их при загрузке (`ProductPageV2ProductBase` — `this.Ext.create`, `BaseDataViewNUI` у всех разделов — `ResizeObserver`); (2) слои Module/Mixin (возвращают класс Ext, а не конфиг) и пустые `.js` схем стилей больше не считаются ошибкой разбора — отчёт пишет «слоёв без конфига». Проверено: 67 схем всех типов — 0 ошибок разбора; отчёт по самой большой схеме побайтно совпал с прежним.

Для полного списка, а не только отчёта, используй объекты скрипта: `names` — секция → имя → список слоёв снизу вверх, где имя определено; `view` — итоговое дерево вёрстки.

### Как читать отчёт
- **Список слоёв** — снизу вверх. `conf/content` — слой залоченного пакета, `Pkg/<Пакет>` — слой из рабочей области.
- **`⚠ вне зависимостей пакета`** — слой лежит в пакете, от которого пакет твоей схемы транзитивно НЕ зависит. На этом стенде он есть, на другом его может не быть — то, что определено только в таких слоях, использовать нельзя.
- **Уникальных имён по секциям** — сколько разных имён определено во всей цепочке в каждой секции, и сколько элементов в итоговой вёрстке.
- **Собственный слой** — по каждой секции (`[methods]`, `[attributes]`, `[details]`, `[businessRules]` и т.д.) для каждого имени: `override, ближайший родитель — ...` (имя уже есть ниже, указан ближайший безопасный слой, где лежит определение) или `новый`. Для правил имя имеет вид `<Колонка>.<Правило>`.
- **`[diff]`** — каждая операция своего слоя, проверенная на модели вёрстки родителей: `OK (элемент из <слой>)` или предупреждение `⚠` (элемента нет — `merge` молча не сработает; контейнера нет — элемент попадёт в корень; имя уже занято; нет `propertyName` — исключение). Удаления дочерних элементов уже удалённых контейнеров сведены в одну итоговую строку.
- **Миксины** — методы, подмешанные в тот же экземпляр; «не найден как схема» — ядровый класс платформы (`[app]/Resources`), не схема.

### Правила при написании кода
1. **Переопределить метод родителя**: имя должно ТОЧНО совпадать с именем из отчёта. Перед записью открой реализацию в ближайшем родительском слое (слой из отчёта; для `conf/content` — модуль `define("<Имя><Пакет>", ...)` в `conf/content/<Имя>.js`) и повтори его сигнатуру: аргументы, возвращаемое значение, вызов `callback`. Внутри вызывай `this.callParent(arguments)`, если не заменяешь логику намеренно — иначе потеряешь поведение всех нижних слоёв (например, `init` у реальной карточки лида определён в 23 слоях).
2. **Переопределить атрибут, деталь, модуль, сообщение, правило**: укажи то же имя и ТОЛЬКО меняемые свойства — остальные унаследуются от родителя. Вложенные объекты (например `filter` или `defaultValues` у детали) задавай целиком: они заменяются, а не сливаются. У атрибута `dependencies` добавляются к родительским, а не заменяют их.
3. **Добавить новое имя в любую секцию**: убедись, что в отчёте его нет в этой секции — иначе ты не добавишь новое, а молча изменишь родительское. Для атрибутов проверь ещё и колонки объекта: атрибут с именем колонки объекта дополняет эту колонку, а не создаёт новую.
4. **Изменить вёрстку родителя (`diff`)**: меняй элемент родителя через `merge` по его `name` из модели вёрстки; перед `merge`/`move`/`remove` убедись, что элемент есть у родителей (скрипт проверяет каждую операцию). Новый элемент — `insert` с `parentName` существующего контейнера и обязательным `propertyName` (обычно `"items"`). Не делай в одном слое `insert` и `merge` одного и того же элемента — `merge` выполняется раньше вставки.
5. **`rules`, `businessRules`, `details`** работают только в страницах (Page/MiniPage, `EDIT_VIEW_MODEL_SCHEMA`) — в Section/Module/Detail платформа их не применяет.
6. **Использовать то, что есть у родителя**: методы и методы миксинов — через `this.<метод>()`, атрибуты — через `this.get("<Имя>")`/`this.set("<Имя>", значение)`, элементы вёрстки — по `name` в `diff`. Только то, что определено хотя бы в одном слое без `⚠`.
7. **Новая схема-наследник** (своё имя): `descriptor.json.Parent.UId` = канонический UId родителя — `schemaUId` первого слоя стека в `conf/content`, или `Descriptor.UId` собственного слоя родителя в `Pkg`, если родитель есть только в `Pkg`. `ExtendParent` не указывать. Пример: новая карточка-наследник `LeadPageV2` → `Parent: {UId: "ddf8941f-92f3-4b10-9f59-faab18c12f46", Name: "LeadPageV2"}`.
8. **Override существующей схемы** (то же имя): `Parent.Name` = своё имя, `Parent.UId` = тот же канонический UId, `ExtendParent: true`. Пример: `Pkg/<Пакет>/Schemas/LeadPageV2` → `Parent: {UId: "ddf8941f-...", Name: "LeadPageV2"}`, `ExtendParent: true`.
9. **Пакет новой схемы** должен транзитивно зависеть от пакетов всех слоёв, чьи методы, атрибуты, детали или элементы вёрстки ты используешь.

## ✅ Создать новую карточку (Page) с нуля
**Подтверждено**: карточка `TestColumnsPage` (наследник `BaseModulePageV2`, объект `TestColumns`), написанная вручную, после «Обновить из файловой системы» и Ctrl+F5 открылась в CRM без ошибок, все поля, вкладка, группа, строки и значения по умолчанию на месте. Перед записью выполни «Обязательный шаг» выше — имена контейнеров родителя берутся из модели вёрстки.

**Файлы** (`Pkg/<Пакет>/`):
1. `Schemas/<Имя>/descriptor.json`: `UId` (новый GUID), `Name`, `ModifiedOnUtc`, `Parent` = `{UId, Name}` родителя (канонический UId, см. правило 7 выше; `BaseModulePageV2` = `d62293c0-7f14-44b1-b547-735fb40499cd`), `ManagerName: "ClientUnitSchemaManager"`, `Caption`, `DependsOn: []`. Без `ExtendParent`.
2. `Schemas/<Имя>/properties.json`: `{"Properties": {"CreatedInVersion": "7.18.5.1500", "SchemaType": "EditViewModelSchema"}}`.
3. `Schemas/<Имя>/metadata.json` — только свои строки и штампы:
```
= MetaData.Schema.UId "<UId схемы>"
= MetaData.Schema.A2 "<Имя>"
= MetaData.Schema.A5 "93b33147-c4e4-413f-9045-2004bca5f4fb"
+ MetaData.Schema.B2 {"UId": "<GUID строки>", "A2": "<КлючСтроки>", "A3": "<UId схемы>", "A4": "<UId схемы>", "A5": "93b33147-c4e4-413f-9045-2004bca5f4fb"}
~ MetaData.Schema.B2 ["<GUID строки>"]
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "7.18.5.1500"
= MetaData.Schema.HD1 "<UId родителя>"
```
В `~ B2` — только свои строки: унаследованные строки родителя остаются (✅ в дизайнере видны и свои, и все родительские). `HD1` = UId родителя (см. `client-schemas.md`).

**Если родитель — своя схема из `Pkg`** (а не из `conf/content`), добавь в конец `metadata.json` наследника две строки (✅ 05.10.2026, `TestDupChildPage`; так у всех таких схем проекта):
```
- MetaData.Schema.B7
+ MetaData.Schema.B7 false
```
Без них `diff` родителя применяется дважды: в консоли «Дубль элемента … удален» на каждый элемент родителя, вкладки наследника пустые. Карточку-наследника можно открыть без регистрации: `#CardModuleV2/<Имя>/edit/<Id записи>`.
4. `Schemas/<Имя>/<Имя>.js`:
```
define("<Имя>", ["BusinessRuleModule", "<Имя>Resources"], function(BusinessRuleModule, resources) {
	return {
		entitySchemaName: "<Объект>",
		attributes: {},
		rules: {},
		modules: /**SCHEMA_MODULES*/{}/**SCHEMA_MODULES*/,
		details: /**SCHEMA_DETAILS*/{}/**SCHEMA_DETAILS*/,
		businessRules: /**SCHEMA_BUSINESS_RULES*/{}/**SCHEMA_BUSINESS_RULES*/,
		methods: {},
		dataModels: /**SCHEMA_DATA_MODELS*/{}/**SCHEMA_DATA_MODELS*/,
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});
```
Зависимости `BusinessRuleModule` и `<Имя>Resources` нужны, только если используешь `rules` и `resources.localizableStrings`.
5. `Resources/<Имя>.ClientUnit/resource.ru-RU.xml` и `resource.en-US.xml`: `<Item Name="Caption" .../>` и по строке на каждую запись `B2`: `<Item Name="LocalizableStrings.<КлючСтроки>.Value" Value="<Текст>" />`.

**Вёрстка у наследника `BaseModulePageV2`** (✅): поля шапки — `insert` в `"parentName": "Header"`, `"propertyName": "items"`, `layout` без `layoutName`; вкладка — `insert` в `"parentName": "Tabs"`, `"propertyName": "tabs"`, `values: {caption: {bindTo: "Resources.Strings.<Ключ>"}, items: [], order: 0}`; группа — `itemType: 15` в `items` вкладки; сетка — `itemType: 0` в `items` группы; поля сетки — `layout` с `"layoutName": "<имя сетки>"`, `bindTo` = имя колонки; кнопка — `insert` в `"parentName": "LeftContainer"` с `itemType: BPMSoft.ViewItemType.BUTTON`, `caption`, `click: {bindTo: "<метод>"}`. Заголовки полей колонок объекта берутся из объекта; у виртуального атрибута задай `caption: {bindTo: "Resources.Strings.<Ключ>"}`.

**Проверить без регистрации**: `<адрес CRM>/0/Nui/ViewModule.aspx#CardModuleV2/<Имя>/add` (или `/edit/<Id записи>`). Чтобы карточка открывалась из раздела и по ссылкам — `registration-edit.md`.

## ✅ Атрибуты, методы, правила, валидация и кнопка на карточке
**Подтверждено** на `TestColumnsPage`:
- **Виртуальный атрибут с пересчётом**: `attributes: {"<Имя>": {dataValueType: BPMSoft.DataValueType.FLOAT, type: BPMSoft.ViewModelColumnType.VIRTUAL_COLUMN, value: 0, dependencies: [{columns: ["<Колонка>"], methodName: "<метод>"}]}}` — метод вызывается при изменении колонки.
- **Переопределение метода родителя** с `this.callParent(arguments)` (проверено на `onEntityInitialized`).
- **Валидация поля**: переопредели `setValidationConfig` (сначала `this.callParent(arguments)`), внутри `this.addColumnValidator("<Колонка>", this.<валидатор>)`; валидатор вызывается как `validator.call(this, value, column)` и возвращает `{invalidMessage: "<текст или пустая строка>"}`. Сообщение показывается под полем, сохранение блокируется.
- **Правила `rules`** (зависимость `BusinessRuleModule`): `rules: {"<Колонка>": {"<ИмяПравила>": {ruleType: BusinessRuleModule.enums.RuleType.BINDPARAMETER, property: BusinessRuleModule.enums.Property.REQUIRED | VISIBLE | ENABLED, conditions: [{leftExpression: {type: BusinessRuleModule.enums.ValueType.ATTRIBUTE, attribute: "<Колонка>"}, comparisonType: BPMSoft.ComparisonType.GREATER | EQUAL | IS_NOT_NULL, rightExpression: {type: BusinessRuleModule.enums.ValueType.CONSTANT, value: <значение>}}]}}}` (у `IS_NOT_NULL` без `rightExpression`). Проверены REQUIRED + GREATER и VISIBLE + IS_NOT_NULL.
- **Локализуемая строка в коде**: `resources.localizableStrings.<Ключ>` (модуль `<Имя>Resources` в зависимостях) или `this.get("Resources.Strings.<Ключ>")` — оба работают.
- **Кнопка**: обработчик — метод из `methods`, `this.showInformationDialog(<текст>)` показывает сообщение. Стиль `BPMSoft.controls.ButtonEnums.style.GREEN` в BPMSoft заменён на `ORANGE` — для выделенной кнопки используй `ORANGE`.
- **Где искать базовые методы модели**: `setValidationConfig`, `addColumnValidator`, `showInformationDialog`, `validateColumn` определены не в схемах-конфигах, а в классах `conf/content/BaseSchemaViewModel.js` и `[app]/Resources/ui/BPMSoft/data/models/base-view-model.js`. Скрипт иерархии их не видит и помечает переопределение как «новый» — перед переопределением такого метода проверь его в этих двух файлах (сигнатура, нужен ли `callParent`).
- ✅ **Автономер** (подтверждено в CRM, 08.10.2026): в карточке `getIncrementColumn: function() { return "<Колонка>"; }` и вызов `this.setIncrementCode()` в `onEntityInitialized` до `callParent` (образец — `InvoicePageV2` в `conf/content`). Нужны системные настройки `<Объект>CodeMask` (маска для `string.Format`, например `ЗАЯ-{0:00000}`) и `<Объект>LastNumber` (`data-edit.md`); у значения `LastNumber` в наборе — `IsForceUpdate: false`, чтобы обновление пакета не сбрасывало счётчик. Номер выдаёт сервис `SysSettingsService.GetIncrementValueVsMask`; при `UseDBSequence=true` (`BPMSoft.WebHost.dll.config`) вместо настройки берётся последовательность БД.
- ✅ **Автономер на мини-карточке** (08.10.2026): у `BaseMiniPage` нет `setIncrementCode` (он есть только у `BasePageV2`) — при добавлении вызови `SysSettingsService.GetIncrementValueVsMask` сам. `isNewMode` на мини-карточке совпадает с `isAddMode`.
- ✅ **Переименовать вкладку** (08.10.2026): достаточно поменять `LocalizableStrings.<Ключ>.Value` в обоих `resource.*.xml` и `ModifiedOnUtc` схемы; `.js` и `metadata.json` не трогать.
- ✅ **Обязательность по флажку** (08.10.2026): правило `REQUIRED` с условием `EQUAL` атрибута-флажка и константы `true`.

## ✅ Замещение (override) существующей карточки
**Подтверждено**: новое замещение `ProductPageV2` (раньше не замещалась нигде), написанное вручную, работает в CRM — и в отдельной карточке, и в совмещённом режиме (карточка открыта из реестра раздела).

**Файлы** (`Pkg/<Пакет>/`):
1. `descriptor.json`: `Name` = имя замещаемой схемы, `Parent` = `{UId: <канонический UId>, Name: <то же имя>}`, `ExtendParent: true`. Канонический UId схемы из `conf/content` — `schemaUId` первого слоя (для `ProductPageV2` — `0daec87e-a84d-44bc-9dd0-c90b8d1baa33`), см. «Обязательный шаг».
2. `properties.json`: тот же `SchemaType`, что у родителя (`EditViewModelSchema`).
3. `metadata.json` — только дельта пакета, без `A2` и без `HD1` (как у override объекта):
```
= MetaData.Schema.UId "<UId замещения>"
= MetaData.Schema.A5 "93b33147-c4e4-413f-9045-2004bca5f4fb"
+ MetaData.Schema.B2 {"UId": "<GUID>", "A2": "<Ключ>", "A3": "<UId замещения>", "A4": "<UId замещения>", "A5": "93b33147-c4e4-413f-9045-2004bca5f4fb"}
~ MetaData.Schema.B2 ["<GUID>"]
= MetaData.Schema.B6 "<UId пакета>"
= MetaData.Schema.B8 "7.18.5.1500"
= MetaData.Schema.B7 true
```
**`= MetaData.Schema.B7 true` обязательна** — это признак замещения; без неё клиент может собрать схему без базовых слоёв (см. `client-schemas.md`, `B7`). Designer дополнительно пишет `= MetaData.Schema.HD1 "<UId родителя>"`, `- MetaData.Schema.HD12`, строки `= MetaData.Schema.B2.["<UId>"].A4 ...` для унаследованных строк и копирует в ресурсы несколько строк родителя — это не обязательно (70 рабочих замещений проекта без `HD1`). Версия `CreatedInVersion`/`B8`: текущий Designer стенда пишет `1.9.0.17103`, в старых файлах — `7.18.5.1500`; принимаются обе.
Строки родителя при этом сохраняются (все заголовки вкладок и полей родителя на месте).
4. `.js`: `define("<Имя>", [...], function(...) { return { entitySchemaName, attributes, methods, diff, ... }; });` — только то, что меняет или добавляет замещение.
5. Ресурсы — только свои строки, без `Caption` схемы.

**Что проверено в замещении:**
- `merge` элемента родителя по `name` — указывай только меняемые свойства (новый `caption` поля).
- `remove` элемента родителя — `{"operation": "remove", "name": "<Элемент>"}`.
- **Порядок вкладок задаётся свойством `order`, а не позицией**: `move` вкладки с `"index": 0` видимый порядок НЕ изменил. Чтобы переставить вкладки, сделай `merge` с новым `"order"` КАЖДОЙ вкладке (как делает Designer). Текущие `order` вкладок видны в слоях родителя.
- Частичное переопределение атрибута родителя: `"Unit": {"isRequired": false}` — снимает обязательность, остальные свойства атрибута (например `dependencies`) остаются от родителя.
- Переопределение `getActions` с `this.callParent(arguments)` и `actionMenuItems.addItem(this.getButtonMenuItem({"Caption": ..., "Tag": "<метод>"}))` — пункт добавляется в конец «Действий», по клику вызывается метод с именем из `Tag`. Разделитель — `this.getButtonMenuItem({"Type": "BPMSoft.MenuSeparator"})`.
- **Совмещённый режим** (карточка открыта из реестра раздела): действия карточки отрисовывает раздел, и привязка `"Caption": {"bindTo": "Resources.Strings.<Ключ>"}` ищет строку в модели раздела — у раздела её нет, текст пустой. Решение ✅: передавать готовый текст — `"Caption": resources.localizableStrings.<Ключ>` (модуль `<Имя>Resources` в зависимостях `define`). Другой вариант — добавить ту же строку в схему раздела (проверим при замещении раздела).

## ✅ Новая деталь-реестр и подключение её к карточке
**Подтверждено**: деталь `TestColumnsDetail` (наследник `BaseGridDetailV2`, объект `TestColumns`) на карточке контакта показывает записи, связанные по `TestContact`, кнопка на панели детали работает.

**Схема детали** (`Pkg/<Пакет>/Schemas/<Деталь>/`):
- `descriptor.json`: `Parent` = `{UId: "01eb38ee-668a-42f0-999d-c2534f979089", Name: "BaseGridDetailV2"}`, без `ExtendParent`.
- `properties.json`: `"SchemaType": "GridDetailViewModelSchema"`.
- `metadata.json`: как у новой карточки (`UId`, `A2`, `A5`, свои `B2` + `~ B2`, `B6`, `B8`, `HD1` = UId родителя).
- `.js`: `define("<Деталь>", ["<Деталь>Resources"], function(resources) { return { entitySchemaName: "<Объект детали>", details: {}, methods: {...}, diff: [...] }; });`. Кнопка на панели детали — `insert` в `"parentName": "Detail"`, `"propertyName": "tools"` с `itemType: BPMSoft.ViewItemType.BUTTON`. Записи детали — `this.get("Collection")`.

**Подключение к карточке** (в схеме или замещении карточки):
- `details: {"<Ключ>": {"schemaName": "<Деталь>", "entitySchemaName": "<Объект детали>", "filter": {"detailColumn": "<lookup-колонка объекта детали на мастер>", "masterColumn": "Id"}}}`.
- В `diff`: `{"operation": "insert", "name": "<Ключ>", "values": {"itemType": 2, "markerValue": "added-detail"}, "parentName": "<Вкладка>", "propertyName": "items", "index": N}`.
- **Заголовок детали на карточке** — строка карточки с именем `<Ключ>DetailCaptionOnPage` (так её ищет `BaseEntityPage.getDetailInfo`): запись `B2` в `metadata.json` карточки + `LocalizableStrings.<Ключ>DetailCaptionOnPage.Value` в её ресурсах. Иначе берётся строка `Caption` самой детали.
- Регистрация детали (`SysDetail`) — `registration-edit.md`.

## ✅ Правка существующего замещения (боевого файла)
**Подтверждено** на `ContactPageV2` (добавлены деталь в `details`, элемент в `diff`, строка в `B2` и ресурсы):
- Перед правкой зафиксируй исходное состояние: если `Pkg` — git-репозиторий, сравнивай и откатывай через `git diff` / `git checkout -- <файл>`; если нет — попроси пользователя сделать копию схемы и её ресурсов (запись вне `Pkg` агенту запрещена).
- **Окончания строк**: файлы, сохранённые Designer, бывают в CRLF (`ContactPageV2.js` — CRLF, его `metadata.json` и ресурсы — LF). Определи окончание строк файла и вставляй в том же формате; якоря для поиска строй с ним же.
- Вставляй только свои фрагменты (свой ключ в `details`, свой элемент первым в `diff`, свою запись `+ B2` перед `~ B2` и её UId в конец списка `~ B2`), обнови `ModifiedOnUtc`. Затем сверь с копией: в `diff` должны быть только твои строки.
- Верхним слоем схемы может быть другой пакет: слой пакета, который ты правишь, остаётся в цепочке и работает.

## ✅ Замещение (override) существующей детали
**Подтверждено**: новое замещение `ContactAddressDetailV2` (деталь «Адреса» на карточке контакта) работает.
- Файлы — как у замещения карточки (`ExtendParent: true`, `Parent` = `{UId: <канонический UId>, Name: <то же имя>}`; для `ContactAddressDetailV2` — `e11ebfda-be27-4b0f-b01c-7a82a244b00e`), но `"SchemaType": "GridDetailViewModelSchema"`. `metadata.json` без `A2` и `HD1`, но с обязательной `= MetaData.Schema.B7 true`. ✅ Базовый слой подключается (стек `["ContactAddressDetailV2UIv2", "ContactAddressDetailV2"]`) — проверено после добавления `B7`; до этого база не подключалась.
- Переопределение `initDefaultCaption` (метод `BaseDetailV2`) с `this.callParent(arguments)` и дописыванием текста к `this.get("Caption")` меняет заголовок детали на всех страницах, где она подключена.
- Новая кнопка на панели — `insert` в `"parentName": "Detail"`, `"propertyName": "tools"`; записи — `this.get("Collection")` (`getCount()`, `getByIndex(i)`, у записи `get("<Колонка>")`).
- `remove` колонки реестра родителя (`<Колонка>ListedGridColumn` в `DataGridListedConfig`) — операция находит элемент; видимый эффект есть только у пользователей без сохранённой настройки колонок детали (иначе реестр строится по профилю).

## ✅ Новый раздел (Section) с нуля
**Подтверждено**: раздел `TestColumnsSection` (наследник `BaseSectionV2`, объект `TestColumns`) после регистрации (`registration-edit.md`) появился в меню рабочего места, реестр, действие раздела, открытие и добавление записи через карточку работают.
- `descriptor.json`: `Parent` = `{UId: "7912fb69-4fee-429f-8b23-93943c35d66d", Name: "BaseSectionV2"}`, без `ExtendParent`.
- `properties.json`: `"SchemaType": "ModuleViewModelSchema"`.
- `metadata.json`: как у новой карточки (`UId`, `A2`, `A5`, свои `B2` + `~ B2`, `B6`, `B8`, `HD1` = UId родителя).
- `.js`: `define("<Раздел>", ["<Раздел>Resources"], function(resources) { return { entitySchemaName: "<Объект>", attributes: {}, details: {}, methods: {}, diff: [] }; });` — пустой раздел уже работает (так устроены и реальные разделы). Колонки реестра задаются профилем пользователя, а не схемой.
- **Действие раздела**: переопредели `getSectionActions` с `this.callParent(arguments)`, добавь `actions.addItem(this.getButtonMenuItem({"Caption": resources.localizableStrings.<Ключ>, "Click": {"bindTo": "<метод>"}}))`. Записи реестра — `this.getGridData()` (`getCount()`).
- Без регистрации раздел открывается только по URL `ViewModule.aspx#SectionModuleV2/<Раздел>/`.

## ✅ Кнопка карточки в совмещённом режиме (карточка открыта из реестра)
**Подтверждено** на `TestColumnsPage` + `TestColumnsSection` (исходный кейс — практика пользователя). В совмещённом режиме верхняя панель кнопок принадлежит РАЗДЕЛУ: кнопка, вставленная только в `LeftContainer` карточки, видна лишь при отдельном открытии карточки (после перезагрузки страницы). Решение — кнопка в обеих схемах:
- **Карточка**: атрибут видимости `"<Кнопка>Visible": {dataValueType: BPMSoft.DataValueType.BOOLEAN, type: BPMSoft.ViewModelColumnType.VIRTUAL_COLUMN, value: false}`; в `onEntityInitialized` после `callParent` — `this.set("<Кнопка>Visible", <значение>)` и `this.publishPropertyValueToSection("<Кнопка>Visible", <значение>)` (метод `BasePageV2`: публикует `CardChanged` с `{key, value}`); кнопка в `LeftContainer` с `"visible": {"bindTo": "<Кнопка>Visible"}` и `"click": {"bindTo": "<метод карточки>"}`.
- **Раздел**: тот же атрибут `<Кнопка>Visible` (его значение ставит `BaseDataView.initCardChangedHandler` по сообщению `CardChanged`); кнопка — `insert` в `"parentName": "CombinedModeActionButtonsCardLeftContainer"`, `"propertyName": "items"` с `"click": {"bindTo": "onCardAction"}`, `"tag": "<метод карточки>"` (`onCardAction` отправляет `OnCardAction` в песочницу карточки, и там вызывается метод с именем из `tag`), `"visible": {"bindTo": "<Кнопка>Visible"}`, `"classes": {"textClass": "actions-button-margin-right"}`.
- **Строки для совмещённого режима нужны и в разделе**: заголовок кнопки раздела — строка `B2` и ресурсы самой схемы раздела (у раздела нет строк карточки). То же относится к действиям карточки с `bindTo: "Resources.Strings..."` — либо строка в разделе, либо готовый текст `resources.localizableStrings.<Ключ>` (см. «Замещение карточки»).
- Стиль выделенной кнопки — `BPMSoft.controls.ButtonEnums.style.ORANGE` (`GREEN` в BPMSoft заменён на `ORANGE`).
- ✅ **Пункт «Действия» по условию** (07.10.2026, `TestTicketPage`: «Закрыть заявку» пропадает у закрытой заявки и в отдельной карточке, и при открытии из реестра): `getActions` добавляет пункт только при выполнении условия, а после изменения условия (в `onEntityInitialized` и после смены нужного поля) вызывается `this.initActionButtonMenu()` — метод `BasePageV2` заново собирает меню и публикует `GetCardActions`, раздел пересобирает свою копию (`BaseDataView.initActionButtonMenu` → `cloneBaseViewModel`). Работает, только если меню пересобирается после загрузки записи: проверка поля в `getActions` без `initActionButtonMenu()` не срабатывает — при первой сборке меню данных записи ещё нет. ❌ Опровергнуто (08.10.2026): «скрыть уже скопированный разделом пункт сменой атрибута карточки нельзя» — можно, см. следующий пункт.
- ✅ **Пункт «Действия» по условию через `Visible`** (подтверждено в CRM, 08.10.2026, в отдельной карточке и при открытии из реестра) — основной способ: пункт добавляется в `getActions` всегда, с `"Visible": {"bindTo": "<Признак>"}`; признак — виртуальный логический атрибут и в карточке, и в разделе; карточка пересчитывает его в `onEntityInitialized` и при смене поля (`dependencies`) и передаёт в раздел `this.publishPropertyValueToSection("<Признак>", <значение>)`. Меню не пересобирается. Подпись пункта — готовая строка `resources.localizableStrings.<Ключ>`: у раздела своих строк карточки нет.

⚠️ **Кнопка действия над записью — всегда в двух схемах** (подтверждено 10.10.2026: кнопка только в разделе пропадает после Ctrl+F5 и при переходе по прямой ссылке на запись — карточка открывается отдельно): на карточке в `LeftContainer` (отдельное открытие) и в разделе в `CombinedModeActionButtonsCardLeftContainer` (совмещённый режим), видимость — общим признаком через `publishPropertyValueToSection`. Вариант «только в разделе» пользователю не предлагай. Кнопка для реестра без открытой записи — отдельно, в `SeparateModeActionButtonsLeftContainer`. Подписи кнопок и тексты сообщений — локализуемые строки в обеих схемах.

## ✅ Замещение (override) существующего раздела
**Подтверждено**: новое замещение `ProductSectionV2` (раздел «Продукты») работает.
- Файлы — как у замещения карточки (`ExtendParent: true`, `Parent` = `{UId: <канонический UId>, Name: <то же имя>}`; для `ProductSectionV2` — `f067c01f-590c-48b3-ae22-48e56534cc66`), `"SchemaType": "ModuleViewModelSchema"`, `metadata.json` без `A2` и `HD1`, с обязательной `= MetaData.Schema.B7 true`.
- **Контейнеры верхней панели раздела** (модель вёрстки `BaseDataViewNUI`): режим реестра — `SeparateModeActionButtonsLeftContainer` (`AddFolderButton`, `SeparateModeAddRecordButton`, `SeparateModeActionsButton`) и `SeparateModeActionButtonsRightContainer`; совмещённый режим — `CombinedModeActionButtonsCardLeftContainer` (кнопки карточки: `SaveRecordButton`, `CloseButton`, `CombinedModeActionsButton` и т.д.) и `CombinedModeActionButtonsCardRightContainer`.
- Кнопка в панели реестра — `insert` в `SeparateModeActionButtonsLeftContainer`, `"propertyName": "items"`, обработчик — метод раздела.
- `merge` кнопки родителя (`SeparateModeAddRecordButton` + `"hint": {"bindTo": "Resources.Strings.<Ключ>"}`) — добавляет свойство, не ломая кнопку.
- `getSectionActions` с `callParent`: в разделе заголовок пункта можно привязать `"Caption": {"bindTo": "Resources.Strings.<Ключ>"}` к строке самого раздела — работает.
- **Кнопка раздела, вызывающая метод замещения карточки**: `insert` в `CombinedModeActionButtonsCardLeftContainer` с `"click": {"bindTo": "onCardAction"}`, `"tag": "<метод из замещения карточки>"` — метод карточки выполняется (проверено: раздел `ProductSectionV2` → метод `onTestProductInfoClick` из замещения `ProductPageV2`). Без атрибута видимости кнопка видна всегда, когда карточка открыта в совмещённом режиме.

## ✅ Замещение (override) мини-карточки
**Подтверждено**: замещение `LeadMiniPage` (база — один слой пакета `Lead`, ` a6bcff3c-0159-4547-b143-0b69cf303bd2`): `merge` подписи поля родителя (`Account`), `insert` поля объекта (`Commentary`) и виртуального поля (`TestMark`) в контейнер `MiniPage` с `"isMiniPageModelItem": true` и `layout` `{column, row, colSpan}`, переопределение `onEntityInitialized` с `callParent` — работают в режиме просмотра при наведении. Файлы — как у замещения карточки (`SchemaType: EditViewModelSchema`, `= MetaData.Schema.B7 true` обязательна). Мини-карточка откроется, только если зарегистрирована в `SysModuleEdit` (см. `registration-edit.md`). `"visible": {"bindTo": "isNotViewMode"}` у элемента — показывать только в режиме редактирования.

## ✅ Новая мини-карточка (MiniPage) с нуля
**Подтверждено**: `TestColumnsMiniPage` (объект `TestColumns`) после регистрации открывается при наведении на ссылку записи в реестре раздела (просмотр), по «Добавить» в разделе (добавление) и по карандашу (редактирование).
- `descriptor.json`: `Parent` = `{UId: "8e06a577-08e4-424e-bd89-798a34e1b928", Name: "BaseMiniPage"}`, без `ExtendParent`; `properties.json`: `"SchemaType": "EditViewModelSchema"`; `metadata.json` — как у новой карточки (`UId`, `A2`, `A5`, `B6`, `B8`, `HD1` = `8e06a577-…`; строк `B2` может не быть).
- `.js`: атрибут `"MiniPageModes": {"value": [BPMSoft.ConfigurationEnums.CardOperation.VIEW, BPMSoft.ConfigurationEnums.CardOperation.ADD, BPMSoft.ConfigurationEnums.CardOperation.EDIT]}`; поля — `insert` в `"parentName": "MiniPage"`, `"propertyName": "items"` с `"bindTo": "<Колонка>"`, `"isMiniPageModelItem": true`, `"layout": {"column": 0, "row": N, "colSpan": 24}`; поле только для добавления и редактирования — `"visible": {"bindTo": "isNotViewMode"}`.
- **Обязательные колонки**, которых нет на мини-карточке, в режиме добавления платформа показывает сама (контейнер `RequiredColumnsContainer` из `BaseMiniPageNUI`) — проверено: «Дата старта» появилась автоматически.
- Регистрация — `MiniPageSchemaUId` и `MiniPageModes` в строке `SysModuleEdit` объекта (`registration-edit.md`).
- Проверка цепочки: `BPMSoft.configuration.Structures["<МиниКарточка>"]` → слои `BaseMiniPage…` + свой.

## ✅ Новый модуль (Module) и встраивание в карточку с обменом сообщениями
**Подтверждено**: модуль `TestModule` загружается в карточку `TestColumnsPage`, получает параметр, принимает сообщение от карточки и отправляет ей своё.
- **Файлы модуля**: `descriptor.json` без `Parent`; `properties.json`: `"SchemaType": "Module"`; `metadata.json` — **формат B** (обычный JSON): `{"MetaData": {"Schema": {"ManagerName": "ClientUnitSchemaManager", "UId", "A2", "A5", "B1": [], "B2": [{"UId", "A2": "<Ключ>", "A3", "A4", "A5"}], "B3": [], "B6": "<UId пакета>", "B8", "HD1": "50e3acc0-26fc-4237-a095-849a1d534bd3", "HD4": 1, "HD6": "null", "HD5": [], "HD7": [], "HD8": [], "HD11": [], "HD20": [], "HD21": []}}}`; ресурсы — `Caption` + строки.
- **`.js` модуля**: `define("<Модуль>", ["<Модуль>Resources"], function(resources) { Ext.define("BPMSoft.configuration.<Модуль>", { extend: "BPMSoft.BaseModule", alternateClassName: "BPMSoft.<Модуль>", messages: {...}, init: function() { this.callParent(arguments); this.sandbox.registerMessages(this.messages); this.sandbox.subscribe("<Сообщение>", this.<метод>, this, [this.sandbox.id]); }, render: function(renderTo) { this.callParent(arguments); /* DOM в renderTo */ } }); return BPMSoft.<Модуль>; });`. Параметры загрузки — `this.parameters`. `renderTo` приводи к DOM: `Ext.isString(renderTo) ? Ext.getDom(renderTo) : (renderTo.dom || renderTo)`.
- **Встраивание в карточку** (образец — любая карточка проекта, где модуль грузится через `sandbox.loadModule` в контейнер из `diff`): в `diff` контейнер `{"id": "<Контейнер>", "selectors": {"wrapEl": "#<Контейнер>"}, "itemType": BPMSoft.ViewItemType.CONTAINER, "items": [], "afterrender": {"bindTo": "<загрузчик>"}, "afterrerender": {"bindTo": "<загрузчик>"}}`; загрузчик: `if (!this.get("IsEntityInitialized") || !Ext.get("<Контейнер>")) return; this.sandbox.loadModule("<Модуль>", {renderTo: "<Контейнер>", id: <id модуля>, keepAlive: false, parameters: {...}});` и вызов загрузчика ещё в `onEntityInitialized`. `id` модуля — `this.sandbox.id + "_<Модуль>"`.
- **Сообщения PTP** (объявить в `messages` обеих сторон с `mode: BPMSoft.MessageMode.PTP` и нужным `direction`): карточка → модуль — `this.sandbox.publish("<Сообщение>", <данные>, [<id модуля>])`, модуль подписан с тегом `[this.sandbox.id]`; модуль → карточка — модуль публикует с тегом `[this.sandbox.id]`, карточка подписывается в `init` (после `callParent`) с тегом `[<id модуля>]`.
- ✅ **Адресное PTP-сообщение карточке конкретной записи** (подтверждено записью в CRM, 08.10.2026: модуль → замещение `BasePageV2`, карточка обновилась по сообщению): отправитель — `this.sandbox.publish("<Сообщение>", { entityId, entitySchemaName }, ["<entitySchemaName>_<id в нижнем регистре>"])`; карточка подписывается не в `init`, а в `onEntityInitialized` (после `callParent`), только при `this.isEditMode()`, с тегом `<entitySchemaName>_<PrimaryColumnValue>`; если тег сменился (другая запись в совмещённом режиме), старую подписку снимает `this.sandbox.unsubscribePtp("<Сообщение>", [<старый тег>])`, тег хранится в свойстве схемы. Перечитать поля и детали, как кнопка «Обновить данные», — `this.reloadEntity()`.
- 🧪 По коду ядра (`[app]/Resources/ui/BPMSoft/amd/bootstrap.js`, `[app]/conf/content/BasePageV2.js`), отдельно не проверялось: PTP-сообщение получает только первый подписчик с совпавшим тегом, повторная подписка того же модуля с тем же тегом заменяет старую — запись, открытая в двух живых карточках, обновится в одной. `reloadEntity` вызывает `initEntity`, затем `onEntityInitialized`, затем `updateDetails`; в совмещённом режиме смена строки меняет `PrimaryColumnValue` и вызывает `reloadEntity`, модуль карточки не пересоздаётся.
- ✅ Два экземпляра одного модуля на одной карточке получают сообщение, если карточка публикует его отдельно на id каждого экземпляра (подтверждено в CRM, 08.10.2026). 🧪 Одним вызовом с массивом из двух тегов, по коду ядра, дойдёт только до первого: `publishPtpMessage` в `bootstrap.js` останавливается на первом совпавшем теге.
- ✅ Второй способ встраивания (подтверждено в CRM, 08.10.2026) — блок `modules: {}` + элемент `diff` с `itemType: BPMSoft.ViewItemType.MODULE` (см. `client-schemas.md`): модуль загрузился и обновлялся вместе с контейнером.

## ✅ Новый миксин (Mixin) и подключение к схеме
**Подтверждено**: миксин `TestMixin` подключён к карточке `TestColumnsPage`, его метод работает в отдельной карточке и в совмещённом режиме.
- **Файлы**: как у модуля — `descriptor.json` без `Parent`, `"SchemaType": "Module"`, `metadata.json` в формате B (со своими строками в `B2`), ресурсы `Caption` + строки.
- **`.js`**: `define("<Миксин>", ["<Миксин>Resources"], function(resources) { Ext.define("BPMSoft.configuration.mixins.<Миксин>", { alternateClassName: "BPMSoft.<Миксин>", <методы> }); return Ext.create("BPMSoft.<Миксин>"); });` — без `extend` и без `override`. Внутри методов `this` — модель схемы-хозяина (`this.get("<Колонка хозяина>")` работает), строки миксина — из его собственного модуля ресурсов.
- **Подключение**: имя миксина в зависимостях `define` хозяина + блок `mixins: {<Миксин>: "BPMSoft.<Миксин>"}`; вызов — `this.mixins.<Миксин>.<метод>.call(this, ...)` (или `this.<метод>()`, если имя не пересекается с методами хозяина).

## ✅ Патч существующего класса (`Ext override`)
**Подтверждено**: схема `TestModuleOverride` патчит класс модуля `BPMSoft.TestModule`: метод `onSetText` заменён, `this.callParent([...])` вызывает исходный метод с изменённым аргументом.
- Файлы — как у модуля (`descriptor.json` без `Parent`, `"SchemaType": "Module"`, `metadata.json` формата B, ресурсы — `Caption`).
- `.js`: `define("<Патч>", ["<модуль патчимого класса>"], function() { Ext.define("BPMSoft.configuration.<Патч>", { override: "BPMSoft.<Класс>", <метод>: function(...) { ... this.callParent(arguments) ... } }); return BPMSoft.<Класс>; });` — пространство имён по патчимому классу (см. `client-schemas.md`), не `.mixins.`.
- Подключение: имя патча в зависимостях `define` схемы, которая загружается раньше использования класса (здесь — карточка `TestColumnsPage`, которая загружает модуль).
- ✅ **Патч для всего приложения** (подтверждено в CRM, 08.10.2026): подключи патч зависимостью замещения `BootstrapModulesV2` (родитель — первый слой из `conf/content/BootstrapModulesV2.js`, UId смотри там). Так патч `BPMSoft.controls.Grid.getDefaultRowHtmlConfig` показал подсказку на строках всех реестров разделов и деталей без правки каждого раздела. Привязка коллекции: реестр раздела — `GridData`, деталь — `Collection`, окно выбора из справочника — `gridData` (`markerValue: "LookupGrid"`, патч на него не действует).

## ✅ Стили (`.less`) и картинки схемы
**Подтверждено** на `TestColumnsPage` и `TestModule`.
- **Свой `.less` схемы**: файл `Schemas/<Схема>/<Схема>.less` + зависимость `"css!<Схема>"` в `define` этой же схемы (так же в реальном `EmailTemplateSectionV2`). Без зависимости стиль может не подключиться.
- **Отдельная схема стилей**: схема `<Имя>CSS` с `SchemaType: Module`, `metadata.json` формата B, ресурсами `Caption` и ТОЛЬКО файлом `<Имя>CSS.less` (без `.js`, так устроены реальные схемы стилей); потребитель подключает её зависимостью `"css!<Имя>CSS"` в своём `define`.
- **Картинка схемы**: в `metadata.json` — `+ MetaData.Schema.HD8 {"UId": "<GUID картинки>", "A2": "<ИмяКартинки>", "A3": "<UId схемы>", "A4": "<UId схемы>"}` (без `A5`) и `~ MetaData.Schema.HD8 ["<GUID картинки>"]`; в ресурсах — `<Item Name="Images.<GUID картинки>.Image" Type="Image" ContentType="Data" FileExtension=".svg" Value="<SVG в base64>" />` (ключ — GUID картинки, не имя; достаточно `resource.ru-RU.xml`, как у реальных схем); привязка — `"imageConfig": {"bindTo": "Resources.Images.<ИмяКартинки>"}` (или `this.get("Resources.Images.<ИмяКартинки>")` в коде).
- В совмещённом режиме кнопку карточки рисует раздел — картинку для неё нужно добавить и в раздел.

## ✅ Колонки реестра нового раздела по умолчанию
**Подтверждено 06.10.2026** на `TestTicketSection`: без настройки новый раздел показывает в реестре только отображаемую колонку объекта — `BaseDataView.getDefaultSectionGridProfile` передаёт в `DefaultProfileHelper.getEntityProfile` только её. Свой набор колонок по умолчанию (для пользователей без сохранённой настройки колонок) задаётся переопределением этого метода в схеме раздела; совмещённый режим (вертикальный реестр) остаётся родительским.
```javascript
define("<Объект>Section", ["DefaultProfileHelper"], function(DefaultProfileHelper) {
	return {
		entitySchemaName: "<Объект>",
		methods: {
			getDefaultSectionGridProfile: function() {
				var entitySchema = this.getGridEntitySchema();
				var profilePropertyName = this.getDataGridName();
				if (Ext.isEmpty(entitySchema) || Ext.isEmpty(profilePropertyName) ||
						profilePropertyName.indexOf(this.verticalProfileKeySuffix) > -1) {
					return this.callParent(arguments);
				}
				var columns = [];
				BPMSoft.each(["<Колонка1>", "<Колонка2>"], function(columnName) {
					var column = entitySchema.columns[columnName];
					if (column) {
						columns.push({name: column.name, caption: column.caption,
							dataValueType: column.dataValueType, columnPath: column.name});
					}
				}, this);
				if (columns.length === 0) {
					return this.callParent(arguments);
				}
				var defProfile = DefaultProfileHelper.getEntityProfile("", this.getGridEntitySchemaName(),
					BPMSoft.GridType.LISTED, columns);
				return defProfile && defProfile.DataGrid;
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});
```
Пользователь, уже сохранивший свою настройку колонок, видит её, а не профиль по умолчанию.

## ✅ Редактируемая деталь (ConfigurationGrid)
**Подтверждено 06.10.2026** на `TestTicketCommentDetail` (деталь-наследник `BaseGridDetailV2`, объект `TestTicketComment`): строки добавляются, правятся и удаляются прямо в реестре детали. Образцы в проекте: `PositiveSideDetail`, `AccountBillingDetail`.
- Зависимости `define`: `"ConfigurationGridUtilitiesV2"`, `"ConfigurationGridGenerator"`, `"ConfigurationGrid"` (и `"DefaultProfileHelper"`, если задаёте колонки по умолчанию); блок `mixins: {ConfigurationGridUtilitiesV2: "BPMSoft.ConfigurationGridUtilitiesV2"}`; атрибут `"IsEditable"` (`BOOLEAN`, `VIRTUAL_COLUMN`, `value: true`).
- `diff` — `merge` элемента `DataGrid` со значениями: `"className": "BPMSoft.ConfigurationGrid"`, `"generator": "ConfigurationGridGenerator.generatePartial"`, `"generateControlsConfig": {"bindTo": "generateActiveRowControlsConfig"}`, `"changeRow": {"bindTo": "changeRow"}`, `"unSelectRow": {"bindTo": "unSelectRow"}`, `"onGridClick": {"bindTo": "onGridClick"}`, `"initActiveRowKeyMap": {"bindTo": "initActiveRowKeyMap"}`, `"activeRowAction": {"bindTo": "onActiveRowAction"}`, `"multiSelect": {"bindTo": "MultiSelect"}` и `"activeRowActions"` — кнопки `BPMSoft.Button` со стилем `TRANSPARENT` и `tag` `save` / `cancel` / `remove` (`imageConfig` — `Resources.Images.SaveIcon` / `CancelIcon` / `RemoveIcon`).
- Методы миксина, объявленного в самой схеме, переопределяются вызовом `this.mixins.ConfigurationGridUtilitiesV2.<метод>.apply(this, arguments)`, а не `callParent` (так `generateActiveRowControlsConfig`, `getCellControlsConfig`, `onActiveRowAction`). Методы базовых схем и их миксинов (`checkCanDelete` из `GridUtilities`, `addGridDataColumns`, `initQuerySorting`) — через `this.callParent(arguments)`.
- Ячейку только для чтения задаёт `getCellControlsConfig(entitySchemaColumn)`: получить `config` из миксина и поставить `config.enabled = false`. Чтобы решать по строке (например, «чужая запись»), запомните id в `generateActiveRowControlsConfig(id)` и берите строку из `this.getGridData().get(id)`.
- Запрет удаления — `checkCanDelete(items, callback, scope)`: проверить строки, при отказе `this.showInformationDialog(<текст>)` и `return`, иначе `this.callParent(arguments)`.
- Колонки детали по умолчанию — переопределение `generateEntityProfile`: `DefaultProfileHelper.getEntityProfile(this.getProfileKey(), entitySchema.name, BPMSoft.GridType.LISTED, columns)` (у раздела то же делает `getDefaultSectionGridProfile`, см. выше). Колонки, нужные коду при любой настройке пользователя, добавляйте в запрос в `addGridDataColumns(esq)` (`esq.addColumn("<Колонка>")`).
- Если у записи нет своей карточки, пункты меню «Копировать» и «Изменить» убираются: `getCopyRecordMenuItem: BPMSoft.emptyFn`, `getEditRecordMenuItem: BPMSoft.emptyFn`.
- Запреты на клиенте — только удобство; настоящую защиту дублируйте слушателем на сервере (см. `source-code-edit.md`, «Слушатель событий объекта»).

## ✅ Деталь только для просмотра
**Подтверждено 07.10.2026** на `TestTicketPriorityLogDetail` (наследник `BaseGridDetailV2`, объект `TestTicketPriorityLog`): на детали нет добавления, изменения, копирования и удаления, двойной щелчок запись не открывает.
- `diff`: `{"operation": "remove", "name": "AddRecordButton"}` и `{"operation": "remove", "name": "AddTypedRecordButton"}`.
- Методы: `getAddRecordButtonVisible` → `false`; `addRecordOperationsMenuItems: BPMSoft.emptyFn`; `getEditRecordMenuItem`, `getCopyRecordMenuItem`, `getDeleteRecordMenuItem` → `null`; `editRecord: BPMSoft.emptyFn` (двойной щелчок).
- Колонки по умолчанию — `generateEntityProfile`, как у редактируемой детали выше.
- ✅ Сортировка по умолчанию (новые сверху; подтверждено в CRM, 08.10.2026) — `initQuerySorting(esq)`: после `this.callParent(arguments)`, если ни у одной колонки нет `orderDirection`, взять колонку (`esq.columns.get("<Колонка>")` или `esq.addColumn("<Колонка>")`) и задать `orderPosition = 0`, `orderDirection = BPMSoft.OrderDirection.DESC`.
- Регистрация `SysDetail` и подключение к карточке — как у любой детали.

## Бывшие черновые рецепты — закрыты записью
- **Локализуемая строка** (`B2` + `LocalizableStrings.<Ключ>.Value` в обоих `resource.xml` + `resources.localizableStrings.<Ключ>` в `.js`) — ✅ (`TestColumnsPage`, замещение `ContactPageV2`).
- **Правка вёрстки родителя**: `insert`, `merge`, `remove`, порядок вкладок через `order` — ✅ («Замещение (override) существующей карточки», «Замещение … раздела»). 🧪 `move` обычного элемента (не вкладки) записью не проверен; `move` вкладки порядок не меняет — см. выше.
- **Новые Section, MiniPage, Detail, Module, Mixin** — ✅, см. разделы выше.
- **Регистрация раздела, карточки, мини-карточки, детали** — ✅ `registration-edit.md`.
