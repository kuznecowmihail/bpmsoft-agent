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
