import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function preview(storage=new Map(),blocked=false){
 let document;
 class Element{
  constructor(){this.children=[];this.value='';this.textContent='';this.hidden=false;this.handlers={};this.attrs={};this.dataset={};this.style={};this.inert=false;}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.handlers[k]=fn;}focus(){document.activeElement=this;}
  querySelectorAll(){return ['menu-close','companion-name','save-name','theme-light','theme-dark','nav-activity','nav-conversation'].map(id=>document.getElementById(id));}
 }
 const elements=new Map(),named=[new Element(),new Element()];
 document={handlers:{},getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),createElementNS:()=>new Element(),querySelectorAll(){return [...named,...[...elements.values()].flatMap(el=>el.children.flatMap(message=>message.children?.[0]?.children?.filter(n=>Object.hasOwn(n.attrs,'data-companion-name'))??[]))];},body:new Element(),documentElement:new Element(),addEventListener(k,fn){this.handlers[k]=fn;}};
 for(const m of readFileSync('ui/index.html','utf8').matchAll(/id="([^"]+)"/g))document.getElementById(m[1]);
 const localStorage={getItem(k){if(blocked)throw Error('bloqueado');return storage.get(k)??null;},setItem(k,v){if(blocked)throw Error('bloqueado');storage.set(k,v);}};
 const context=vm.createContext({document,localStorage,console});
 vm.runInContext(readFileSync('dist/preview.js','utf8')+'\n'+readFileSync('dist/ui.js','utf8'),context);
 const submit=id=>elements.get(id).handlers.submit({preventDefault(){}});
 const key=(key,shiftKey=false)=>{let prevented=false;document.handlers.keydown({key,shiftKey,preventDefault(){prevented=true;}});return prevented;};
 return {elements,document,named,storage,submit,key};
}
test('nome e tema persistem e são recuperados em uma nova visita',()=>{
 const p=preview();p.elements.get('companion-name').value='  Aurora  ';p.submit('name-form');p.elements.get('theme-dark').onclick();assert.equal(p.named[0].textContent,'Aurora');assert.equal(p.document.documentElement.dataset.theme,'dark');
 const next=preview(p.storage);assert.equal(next.named[0].textContent,'Aurora');assert.equal(next.elements.get('companion-name').value,'Aurora');assert.equal(next.elements.get('theme-dark').attrs['aria-pressed'],'true');assert.equal(next.document.documentElement.dataset.theme,'dark');next.elements.get('theme-light').onclick();assert.equal(next.document.documentElement.dataset.theme,'light');
});
test('nome vazio não substitui o nome anterior e armazenamento bloqueado é explicado',()=>{
 const p=preview(undefined,true);p.elements.get('companion-name').value='   ';p.submit('name-form');assert.equal(p.named[0].textContent,'Companheiro');assert.match(p.elements.get('name-status').textContent,/nome/);p.elements.get('companion-name').value='Luna';p.submit('name-form');assert.equal(p.named[0].textContent,'Luna');assert.match(p.elements.get('name-status').textContent,/não foi possível salvar/);
});
test('menu confina foco, fecha com Escape ou overlay e devolve foco ao botão',()=>{
 const p=preview(),el=p.elements;p.elements.get('menu-open').onclick();assert.equal(el.get('drawer').hidden,false);assert.equal(el.get('main').inert,true);assert.equal(p.document.activeElement,el.get('menu-close'));
 assert.equal(p.key('Tab',true),true);assert.equal(p.document.activeElement,el.get('nav-conversation'));assert.equal(p.key('Tab'),true);assert.equal(p.document.activeElement,el.get('menu-close'));
 p.key('Escape');assert.equal(el.get('drawer').hidden,true);assert.equal(el.get('main').inert,false);assert.equal(el.get('menu-open').attrs['aria-expanded'],'false');assert.equal(p.document.activeElement,el.get('menu-open'));el.get('menu-open').onclick();el.get('overlay').onclick();assert.equal(el.get('drawer').hidden,true);
});
test('decisões ilustrativas alternam sem aprendizado, ferramentas ou persistência',()=>{
 const p=preview();assert.equal(p.elements.get('choice').textContent,'Aguardar');p.elements.get('next-decision').onclick();assert.equal(p.elements.get('choice').textContent,'Perguntar');p.elements.get('next-decision').onclick();assert.equal(p.elements.get('choice').textContent,'Sugerir uma página');p.elements.get('next-decision').onclick();assert.equal(p.elements.get('choice').textContent,'Aguardar');assert.equal(p.storage.size,0);
});
test('conversa usa texto seguro, nome escolhido e resposta identificada, sem salvar mensagens',()=>{
 const p=preview();p.elements.get('companion-name').value='Nilo';p.submit('name-form');const saved=[...p.storage.values()][0];p.elements.get('chat-text').value='<img src=x onerror=alert(1)>';p.submit('chat-form');const messages=p.elements.get('messages').children;
 assert.equal(messages[0].children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(messages[1].children[0].children[1].textContent,'Nilo');assert.equal(messages[1].children[0].children[2].textContent,'RESPOSTA SIMULADA');assert.match(messages[1].children[1].textContent,/simulada/);assert.equal([...p.storage.values()][0],saved);assert.equal(p.elements.get('chat-text').value,'');
});
test('preferências inválidas não impedem abrir a prévia',()=>{
 const p=preview(new Map([['companheiro.preview.preferences.v1','{invalido']]));assert.equal(p.named[0].textContent,'Companheiro');assert.equal(p.document.documentElement.dataset.theme,'light');
});
