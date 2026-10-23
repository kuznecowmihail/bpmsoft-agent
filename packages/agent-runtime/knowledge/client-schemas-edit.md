# Клиентские схемы (ClientUnitSchemaManager) — рецепты создания/редактирования

Общая механика — см. `metadata-editing.md`. **Статус: ни один рецепт ниже НЕ проверен реальной записью** — это производные выводы из чтения `client-schemas.md`.

**Не забывай про 2 обязательных правила из `metadata-editing.md`: (1) обе локали `ru-RU`+`en-US` для ресурсов, (2) актуальный `ModifiedOnUtc` при каждом изменении `descriptor.json`.**

**Рецепты клиентских схем разбиты на файлы**: здесь — обязательная иерархия родителя, константы, миксины, патчи, стили; карточки, разделы, мини-карточки и детали — `client-pages-edit.md`; модули, ESQ, проверки, реестры и окна — `client-logic-edit.md`.

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

## ✅ Константы: клиентский модуль идентификаторов

**Подтверждено в CRM (14.10.2026).** Сырые идентификаторы записей (UId справочников и т.п.) в карточках, модулях и деталях не пишем — они лежат в отдельном Module-модуле констант пакета, по одному на объект или тему. Внутри модуля — по вложенному объекту на справочник: одна переменная — одна таблица, идентификаторы в корне не лежат.

Файлы модуля — как у обычного Module (см. «Новый модуль (Module) и встраивание в карточку с обменом сообщениями»), `properties.json` — `"SchemaType": "Module"`. Сам файл:
```js
define("TestConstants", [], function() {
	Ext.define("BPMSoft.configuration.TestConstants", {
		extend: "BPMSoft.BaseModule",
		alternateClassName: "BPMSoft.TestConstants",
		statics: {
			/** Записи справочника «<Справочник>». */
			TestSource: {
				/** <Запись 1>. */
				First: "<UId записи>",
				/** <Запись 2>. */
				Second: "<UId записи>"
			}
		}
	});
	return BPMSoft.TestConstants;
});
```
Карточка подключает модуль зависимостью `define("<Схема>", [..., "TestConstants"], function(..., TestConstants) {` и берёт значения как `TestConstants.TestSource.First`. Сравнивая с `Id` выбранного значения, приводи обе стороны к нижнему регистру: в колонке lookup регистр UId может отличаться от записанного в константах.

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

## Бывшие черновые рецепты — закрыты записью
- **Локализуемая строка** (`B2` + `LocalizableStrings.<Ключ>.Value` в обоих `resource.xml` + `resources.localizableStrings.<Ключ>` в `.js`) — ✅ (`TestColumnsPage`, замещение `ContactPageV2`).
- **Правка вёрстки родителя**: `insert`, `merge`, `remove`, порядок вкладок через `order` — ✅ («Замещение (override) существующей карточки», «Замещение … раздела» в `client-pages-edit.md`). 🧪 `move` обычного элемента (не вкладки) записью не проверен; `move` вкладки порядок не меняет — см. выше.
- **Новые Section, MiniPage, Detail, Module, Mixin** — ✅, см. разделы выше.
- **Регистрация раздела, карточки, мини-карточки, детали** — ✅ `registration-edit.md`.
