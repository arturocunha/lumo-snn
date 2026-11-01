import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function preview(storage=new Map(),blocked=false){
 let document;
 class Element{
  constructor(){this.children=[];this.value='';this.textContent='';this.hidden=false;this.handlers={};this.attrs={};this.dataset={};this.style={};this.inert=false;this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.handlers[k]=fn;}focus(){document.activeElement=this;}
  querySelector(){return null;}
  querySelectorAll(){return ['menu-close','companion-name','save-name','theme-light','theme-dark','nav-activity','nav-conversation'].map(id=>document.getElementById(id));}
 }
 const elements=new Map(),named=[new Element(),new Element()];
 document={handlers:{},getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),createElementNS:()=>new Element(),querySelectorAll(){return [...named,...[...elements.values()].flatMap(el=>el.children.flatMap(message=>message.children?.[0]?.children?.filter(n=>Object.hasOwn(n.attrs,'data-companion-name'))??[]))];},body:new Element(),documentElement:new Element(),addEventListener(k,fn){this.handlers[k]=fn;}};
 for(const m of readFileSync('ui/index.html','utf8').matchAll(/<[^>]*id="([^"]+)"[^>]*>/g))document.getElementById(m[1]).hidden=/\bhidden\b/.test(m[0]);
 const localStorage={getItem(k){if(blocked)throw Error('bloqueado');return storage.get(k)??null;},setItem(k,v){if(blocked)throw Error('bloqueado');storage.set(k,v);},removeItem(k){storage.delete(k);}};
 const window={handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}};const navigator={mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('negada'),{name:'NotAllowedError'});}}};
 const timers=new Map();let timerId=0;const context=vm.createContext({document,localStorage,console,window,navigator,setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);}});
 vm.runInContext(readFileSync('dist/browser.js','utf8'),context);
 const submit=id=>elements.get(id).handlers.submit({preventDefault(){}});
 const key=(key,shiftKey=false)=>{let prevented=false;document.handlers.keydown({key,shiftKey,preventDefault(){prevented=true;}});return prevented;};
 return {elements,document,named,storage,submit,key,window,navigator,timers,context};
}
test('nome e tema persistem e são recuperados em uma nova visita',()=>{
 const p=preview();p.elements.get('companion-name').value='  Aurora  ';p.submit('name-form');p.elements.get('theme-dark').onclick();assert.equal(p.named[0].textContent,'Aurora');assert.equal(p.document.documentElement.dataset.theme,'dark');
 const next=preview(p.storage);assert.equal(next.named[0].textContent,'Aurora');assert.equal(next.elements.get('companion-name').value,'Aurora');assert.equal(next.elements.get('theme-dark').attrs['aria-pressed'],'true');assert.equal(next.document.documentElement.dataset.theme,'dark');next.elements.get('theme-light').onclick();assert.equal(next.document.documentElement.dataset.theme,'light');
});
test('armazenamento bloqueado não cria amigos silenciosos nem substitui dados',()=>{
 const p=preview(undefined,true);assert.equal(p.named[0].textContent,'Sem amigo');assert.equal(p.elements.get('session-toggle').disabled,true);assert.match(p.elements.get('status').textContent,/preservados/);
});
test('menu confina foco, fecha com Escape ou overlay e devolve foco ao botão',()=>{
 const p=preview(),el=p.elements;p.elements.get('menu-open').onclick();assert.equal(el.get('drawer').hidden,false);assert.equal(el.get('main').inert,true);assert.equal(p.document.activeElement,el.get('menu-close'));
 assert.equal(p.key('Tab',true),true);assert.equal(p.document.activeElement,el.get('nav-conversation'));assert.equal(p.key('Tab'),true);assert.equal(p.document.activeElement,el.get('menu-close'));
 p.key('Escape');assert.equal(el.get('drawer').hidden,true);assert.equal(el.get('main').inert,false);assert.equal(el.get('menu-open').attrs['aria-expanded'],'false');assert.equal(p.document.activeElement,el.get('menu-open'));el.get('menu-open').onclick();el.get('overlay').onclick();assert.equal(el.get('drawer').hidden,true);
});
test('visualização usa decisão e pesos da rede real; pausa limpa o timer',()=>{
 const p=preview();assert.equal(p.elements.get('choice').textContent,'Observando');assert.equal(p.timers.size,1);
 for(let i=0;i<16;i++)for(const fn of p.timers.values())fn();
 assert.notEqual(p.elements.get('choice').textContent,'Observando');assert.match(p.elements.get('network-metrics').textContent,/passo 80/);
 p.elements.get('reward-good').onclick();assert.match(p.elements.get('network-metrics').textContent,/1 atualizações/);p.elements.get('network-toggle').onclick();assert.equal(p.timers.size,0);assert.equal(p.storage.size,1);
});
test('conversa usa texto seguro, nome escolhido e resposta identificada, com histórico próprio',()=>{
 const p=preview();p.elements.get('companion-name').value='Nilo';p.submit('name-form');const saved=[...p.storage.values()][0];p.elements.get('chat-text').value='<img src=x onerror=alert(1)>';p.submit('chat-form');const messages=p.elements.get('messages').children;
 assert.equal(messages[0].children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(messages[1].children[0].children[0].textContent,'Nilo');assert.equal(messages[1].children[0].children[1].textContent,'RESPOSTA SIMULADA');assert.notEqual([...p.storage.values()][0],saved);const next=preview(p.storage);assert.equal(next.elements.get('messages').children[0].children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(p.elements.get('chat-text').value,'');
});
test('preferências inválidas não impedem abrir a prévia',()=>{
 const p=preview(new Map([['companheiro.preview.preferences.v1','{invalido']]));assert.equal(p.named[0].textContent,'Companheiro');assert.equal(p.document.documentElement.dataset.theme,'light');
});
test('controle principal inicia só por clique e encerra ao sair da página',async()=>{
 const p=preview();let requests=0,stops=0;const makeStream=()=>{const track={readyState:'live',stop(){stops++;},addEventListener(){}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};p.navigator.mediaDevices.getUserMedia=async options=>{assert.deepEqual(JSON.parse(JSON.stringify(options)),{audio:true,video:false});requests++;return makeStream();};assert.equal(requests,0);
 p.elements.get('session-toggle').onclick();await new Promise(setImmediate);assert.equal(requests,1);assert.equal(p.elements.get('mic-status').textContent,'Microfone ativo');assert.equal(p.elements.get('session-toggle').textContent,'Encerrar');p.window.handlers.pagehide();assert.equal(stops,1);assert.equal(p.elements.get('mic-status').textContent,'Desligado');p.elements.get('session-toggle').onclick();await new Promise(setImmediate);p.window.handlers.beforeunload();assert.equal(stops,2);
});
test('analisador usa amostras do stream e desconecta recursos ao encerrar',async()=>{
 const p=preview();let closed=0,sourceDisconnected=0,analyserDisconnected=0;const track={readyState:'live',stop(){},addEventListener(){}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 p.navigator.mediaDevices.getUserMedia=async()=>stream;
 p.context.AudioContext=class{
  createMediaStreamSource(value){assert.equal(value,stream);return {connect(){},disconnect(){sourceDisconnected++;}};}
  createAnalyser(){return {getFloatTimeDomainData(buffer){buffer.fill(.025);},disconnect(){analyserDisconnected++;}};}
  resume(){return Promise.resolve();}close(){closed++;return Promise.resolve();}
 };
 p.elements.get('session-toggle').onclick();await new Promise(setImmediate);for(const fn of p.timers.values())fn();assert.match(p.elements.get('situation').textContent,/energia do microfone/);const inputs=p.elements.get('network').children.filter(node=>node.attrs.class?.startsWith('input-node'));assert.match(inputs[2].attrs['aria-label'],/0.200/);
 p.elements.get('session-toggle').onclick();assert.equal(p.timers.size,0);assert.equal(closed,1);assert.equal(sourceDisconnected,1);assert.equal(analyserDisconnected,1);
});
test('trocar amigo encerra microfone e timer e restaura aprendizado e conversa ao voltar',async()=>{
 const p=preview();let stops=0;const track={readyState:'live',stop(){stops++;},addEventListener(){}};p.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]});
 const initial=JSON.parse(p.storage.get('companheiro.friends.v1')).active;for(let i=0;i<16;i++)for(const fn of p.timers.values())fn();p.elements.get('reward-good').onclick();p.elements.get('chat-text').value='Conversa do primeiro amigo';p.submit('chat-form');p.elements.get('session-toggle').onclick();await new Promise(setImmediate);
 p.elements.get('friend-create').onclick();p.elements.get('friend-new-name').value='Segundo';p.submit('friend-create-form');assert.equal(stops,1);assert.equal(p.timers.size,0);assert.equal(p.elements.get('mic-status').textContent,'Desligado');assert.equal(p.elements.get('messages').children.length,0);assert.match(p.elements.get('network-metrics').textContent,/0 atualizações/);
 p.elements.get('friend-list').children[0].onclick();assert.equal(p.timers.size,0);assert.equal(p.elements.get('messages').children[0].children[1].textContent,'Conversa do primeiro amigo');assert.match(p.elements.get('network-metrics').textContent,/1 atualizações/);assert.equal(JSON.parse(p.storage.get('companheiro.friends.v1')).active,initial);
});
test('cancelar exclusão não modifica dados; último amigo apagado não retorna ao recarregar',()=>{
 const p=preview();const before=p.storage.get('companheiro.friends.v1');p.elements.get('friend-delete').onclick();assert.match(p.elements.get('delete-warning').textContent,/Companheiro.*definitivamente/);p.elements.get('friend-delete-cancel').onclick();assert.equal(p.storage.get('companheiro.friends.v1'),before);p.elements.get('friend-delete').onclick();p.elements.get('friend-delete-yes').onclick();assert.equal(p.elements.get('session-toggle').disabled,true);assert.equal(p.timers.size,0);const next=preview(p.storage);assert.equal(next.named[0].textContent,'Sem amigo');assert.equal(next.elements.get('friend-list').children.length,0);next.elements.get('friend-create').onclick();next.elements.get('friend-new-name').value='Novo';next.submit('friend-create-form');assert.equal(next.named[0].textContent,'Novo');
});
