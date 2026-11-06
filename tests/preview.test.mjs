import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function preview(storage=new Map(),blocked=false){
 let document;
 class Element{
  constructor(){this.children=[];this.value='';this.textContent='';this.hidden=false;this.handlers={};this.attrs={};this.dataset={};this.style={};this.inert=false;this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,fn){this.handlers[k]=fn;}requestSubmit(){return this.handlers.submit?.({preventDefault(){}});}click(){return this.onclick?.();}focus(){document.activeElement=this;}
  querySelector(){return null;}
  querySelectorAll(){return ['menu-close','companion-name','save-name','theme-light','theme-dark','nav-activity','nav-conversation'].map(id=>document.getElementById(id));}
 }
 const elements=new Map(),named=[new Element(),new Element()];
 document={handlers:{},getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),createElementNS:()=>new Element(),querySelectorAll(){return [...named,...[...elements.values()].flatMap(el=>el.children.flatMap(message=>message.children?.[0]?.children?.filter(n=>Object.hasOwn(n.attrs,'data-companion-name'))??[]))];},body:new Element(),documentElement:new Element(),addEventListener(k,fn){this.handlers[k]=fn;}};
 for(const m of readFileSync('ui/index.html','utf8').matchAll(/<[^>]*id="([^"]+)"[^>]*>/g))document.getElementById(m[1]).hidden=/\bhidden\b/.test(m[0]);
 const localStorage={getItem(k){if(blocked)throw Error('bloqueado');return storage.get(k)??null;},setItem(k,v){if(blocked)throw Error('bloqueado');storage.set(k,v);},removeItem(k){storage.delete(k);}};
 const window={handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}};const navigator={mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('negada'),{name:'NotAllowedError'});}}};
 const timers=new Map();let timerId=0;const context=vm.createContext({document,localStorage,console,window,navigator,AbortController,setTimeout,clearTimeout,setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);}});
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
 const p=preview();assert.equal(p.elements.get('choice').textContent,'Observando');assert.equal(p.timers.size,2);
 for(let i=0;i<80;i++)for(const fn of p.timers.values())fn();
 assert.notEqual(p.elements.get('choice').textContent,'Observando');assert.match(p.elements.get('network-metrics').textContent,/passo 80/);
 p.elements.get('reward-good').onclick();assert.match(p.elements.get('network-metrics').textContent,/1 atualizações/);p.elements.get('network-toggle').onclick();assert.equal(p.timers.size,0);assert.equal(p.storage.size,1);
});
function mockModel(p){
 vm.runInContext("modelStatus={configured:true,model:'mock-local',destination:'http://127.0.0.1:1'}",p.context);
 p.context.fetch=async(url,init)=>{const request=JSON.parse(init.body);return {ok:true,json:async()=>request.phase==='interpret'?{interpretation:{features:[1,1,.8,0,1,0],uncertainty:.2,suggestedIds:['fazer'],rationale:'Pedido de ajuda'},model:'mock-local'}:{reply:'Resposta local conforme '+request.choiceId,model:'mock-local'}};};
}
async function sendMessage(p,text){p.elements.get('chat-text').value=text;const pending=p.submit('chat-form');await new Promise(setImmediate);for(let i=0;i<80;i++)for(const fn of p.timers.values())fn();await pending;}
test('conversa ligada usa texto seguro e resposta do transporte; feedback fica no turno',async()=>{
 const p=preview();mockModel(p);p.elements.get('companion-name').value='Nilo';p.submit('name-form');await sendMessage(p,'<img src=x onerror=alert(1)>');const messages=p.elements.get('messages').children;assert.equal(messages[0].children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(messages[1].children[0].children[1].textContent,'MODELO LOCAL · RESPOSTA EM TEXTO');assert.match(messages[1].children[1].textContent,/Resposta local conforme/);assert.equal(p.timers.size,0);p.elements.get('reward-good').onclick();const saved=JSON.parse(p.storage.get('companheiro.friends.v1'));assert.equal(saved.friends[0].messages[1].turn.feedback,1);assert.equal(saved.friends[0].brain.updates,1);
});
test('sem conexão/consentimento não envia mensagem nem cria resposta fixa',async()=>{const p=preview();p.elements.get('chat-text').value='Oi';await p.submit('chat-form');assert.equal(p.elements.get('messages').children.length,0);assert.match(p.elements.get('chat-status').textContent,/Não consegui conectar/);});
test('preferências inválidas não impedem abrir a prévia',()=>{
 const p=preview(new Map([['companheiro.preview.preferences.v1','{invalido']]));assert.equal(p.named[0].textContent,'Companheiro');assert.equal(p.document.documentElement.dataset.theme,'light');
});
function mockVoice(p){
 p.context.fetch=async url=>({ok:true,json:async()=>({configured:true,voiceAvailable:true,model:'mock',destination:'http://127.0.0.1'})});
 p.context.AudioContext=class{sampleRate=16000;destination={};createMediaStreamSource(){return {connect(){},disconnect(){}};}createAnalyser(){return {getFloatTimeDomainData(buffer){buffer.fill(.025);},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){},disconnect(){}};}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
}
test('controle principal inicia só por clique e encerra ao sair da página',async()=>{
 const p=preview();mockVoice(p);let requests=0,stops=0;const makeStream=()=>{const track={readyState:'live',stop(){stops++;},addEventListener(){}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};p.navigator.mediaDevices.getUserMedia=async options=>{assert.deepEqual(JSON.parse(JSON.stringify(options)),{audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});requests++;return makeStream();};assert.equal(requests,0);
 p.elements.get('toggle-mic').onclick();await new Promise(setImmediate);assert.equal(requests,1);assert.equal(p.elements.get('mic-status').textContent,'Escutando');assert.equal(p.elements.get('toggle-mic').textContent,'Desativar microfone');p.window.handlers.pagehide();assert.equal(stops,1);assert.equal(p.elements.get('mic-status').textContent,'Desligado');p.elements.get('toggle-mic').onclick();await new Promise(setImmediate);p.window.handlers.beforeunload();assert.equal(stops,2);
});
test('analisador usa amostras do stream e desconecta recursos ao encerrar',async()=>{
 const p=preview();mockVoice(p);let closed=0,sourceDisconnected=0,analyserDisconnected=0;const track={readyState:'live',stop(){},addEventListener(){}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 p.navigator.mediaDevices.getUserMedia=async()=>stream;
 p.context.AudioContext=class{
  createMediaStreamSource(value){assert.equal(value,stream);return {connect(){},disconnect(){sourceDisconnected++;}};}
  createAnalyser(){return {getFloatTimeDomainData(buffer){buffer.fill(.025);},disconnect(){analyserDisconnected++;}};}
  createScriptProcessor(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){},disconnect(){}};}sampleRate=16000;destination={};
  resume(){return Promise.resolve();}close(){closed++;return Promise.resolve();}
 };
 p.elements.get('toggle-mic').onclick();await new Promise(setImmediate);for(const fn of p.timers.values())fn();assert.match(p.elements.get('situation').textContent,/energia do microfone/);const inputs=p.elements.get('network').children.filter(node=>node.attrs.class?.startsWith('input-node'));assert.match(inputs[2].attrs['aria-label'],/0.200/);
 p.elements.get('toggle-mic').onclick();p.window.handlers.pagehide();assert.equal(p.timers.size,0);assert.equal(closed,1);assert.equal(sourceDisconnected,1);assert.equal(analyserDisconnected,1);
});
test('trocar amigo encerra microfone e timer e restaura aprendizado e conversa ao voltar',async()=>{
 const p=preview();mockVoice(p);let stops=0;const track={readyState:'live',stop(){stops++;},addEventListener(){}};p.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]});
 const initial=JSON.parse(p.storage.get('companheiro.friends.v1')).active;for(let i=0;i<80;i++)for(const fn of p.timers.values())fn();p.elements.get('reward-good').onclick();mockModel(p);await sendMessage(p,'Conversa do primeiro amigo');mockVoice(p);p.elements.get('toggle-mic').onclick();await new Promise(setImmediate);
 p.elements.get('friend-create').onclick();p.elements.get('friend-new-name').value='Segundo';p.submit('friend-create-form');assert.equal(stops,1);assert.equal(p.timers.size,0);assert.equal(p.elements.get('mic-status').textContent,'Desligado');assert.equal(p.elements.get('messages').children.length,0);assert.match(p.elements.get('network-metrics').textContent,/0 atualizações/);
 p.elements.get('friend-list').children[0].onclick();assert.equal(p.timers.size,0);assert.equal(p.elements.get('messages').children[0].children[1].textContent,'Conversa do primeiro amigo');assert.match(p.elements.get('network-metrics').textContent,/1 atualizações/);assert.equal(JSON.parse(p.storage.get('companheiro.friends.v1')).active,initial);
});
test('cancelar exclusão não modifica dados; último amigo apagado não retorna ao recarregar',()=>{
 const p=preview();const before=p.storage.get('companheiro.friends.v1');p.elements.get('friend-delete').onclick();assert.match(p.elements.get('delete-warning').textContent,/Companheiro.*definitivamente/);p.elements.get('friend-delete-cancel').onclick();assert.equal(p.storage.get('companheiro.friends.v1'),before);p.elements.get('friend-delete').onclick();p.elements.get('friend-delete-yes').onclick();assert.equal(p.elements.get('session-toggle').disabled,true);assert.equal(p.timers.size,0);const next=preview(p.storage);assert.equal(next.named[0].textContent,'Sem amigo');assert.equal(next.elements.get('friend-list').children.length,0);next.elements.get('friend-create').onclick();next.elements.get('friend-new-name').value='Novo';next.submit('friend-create-form');assert.equal(next.named[0].textContent,'Novo');
});
test('menu bloqueia quarto amigo e permite criar após exclusão confirmada',()=>{
 const p=preview();for(const name of ['Segundo','Terceiro']){p.elements.get('friend-create').onclick();p.elements.get('friend-new-name').value=name;p.submit('friend-create-form');}
 assert.equal(p.elements.get('friend-create').disabled,true);assert.equal(p.elements.get('friend-limit').hidden,false);const before=p.storage.get('companheiro.friends.v1');p.elements.get('friend-new-name').value='Quarto';p.submit('friend-create-form');assert.equal(p.storage.get('companheiro.friends.v1'),before);p.elements.get('friend-delete').onclick();p.elements.get('friend-delete-yes').onclick();assert.equal(p.elements.get('friend-create').disabled,false);p.elements.get('friend-create').onclick();p.elements.get('friend-new-name').value='Substituto';p.submit('friend-create-form');assert.equal(JSON.parse(p.storage.get('companheiro.friends.v1')).friends.length,3);
});
test('formulário salva habilidade, amplia rede e permite ensinar seleção real',()=>{
 const p=preview();p.elements.get('skill-new').onclick();p.elements.get('skill-name').value='Pergunta local';let row=p.elements.get('skill-steps').children[0];row.children[1].value='Quer continuar?';row.children[1].oninput();p.submit('skill-form');const saved=JSON.parse(p.storage.get('companheiro.friends.v1'));assert.equal(saved.friends[0].skills.length,1);assert.equal(saved.friends[0].brain.weights.length,5);assert.equal(p.elements.get('skill-count').textContent,'5');assert.match(p.elements.get('neuron-count').textContent,/197 neurônios/);
 p.elements.get('input-source').value='demo';p.elements.get('input-source').onchange();p.elements.get('teach-target').value='4';for(let i=0;i<8;i++)p.elements.get('teach').onclick();for(let i=0;i<80;i++)for(const fn of p.timers.values())fn();assert.equal(p.elements.get('choice').textContent,'Pergunta local');p.elements.get('review-selected').onclick();assert.equal(p.elements.get('execution-review').hidden,false);assert.match(p.elements.get('execution-plan').textContent,/Quer continuar/);
 p.elements.get('friend-new-name').value='Outro';p.submit('friend-create-form');assert.equal(p.elements.get('skill-list').children.length,0);assert.equal(p.elements.get('skill-count').textContent,'4');
});
test('troca de amigo cancela resposta atrasada sem inserir texto no amigo novo',async()=>{
 const p=preview();mockModel(p);let resolve;p.context.fetch=async(url,init)=>url==='/api/model/stop'?{ok:true,json:async()=>({})}:new Promise(r=>resolve=r);
 p.elements.get('chat-text').value='Mensagem pendente';const pending=p.submit('chat-form');await new Promise(setImmediate);p.elements.get('friend-new-name').value='Outro';p.submit('friend-create-form');resolve({ok:true,json:async()=>({interpretation:{features:[1,1,0,0,1,0],uncertainty:.8,suggestedIds:['perguntar'],rationale:'Mock'},model:'mock-local'})});await pending;assert.equal(p.elements.get('messages').children.length,0);assert.equal(p.named[0].textContent,'Outro');assert.equal(p.timers.size,0);
});
test('Iniciar companheiro inicia sessão textual sem solicitar microfone',async()=>{
 const p=preview();mockModel(p);let microphones=0,starts=0;p.navigator.mediaDevices.getUserMedia=async()=>{microphones++;throw Error('não usar');};p.context.fetch=async url=>{if(url==='/api/model/start')starts++;return {ok:true,json:async()=>url==='/api/model/start'?{ready:true}:{stopped:true}};};await p.elements.get('session-toggle').onclick();assert.equal(starts,1);assert.equal(microphones,0);assert.equal(p.elements.get('mic-status').textContent,'Pronto para conversar');assert.equal(p.elements.get('session-toggle').textContent,'Encerrar');await p.elements.get('session-toggle').onclick();assert.equal(p.timers.size,0);assert.equal(p.elements.get('mic-status').textContent,'Desligado');
});
test('voz reconhecida chega ao mesmo fluxo de conversa sem ligar microfone no teste',async()=>{
 const p=preview();mockModel(p);const original=p.context.fetch;p.context.fetch=async(url,init)=>url==='/api/transcribe'?{ok:true,json:async()=>({text:'Olá, preciso de ajuda.'})}:original(url,init);
 await vm.runInContext('sendVoice(new ArrayBuffer(44))',p.context);await new Promise(setImmediate);for(let i=0;i<80;i++)for(const fn of p.timers.values())fn();await new Promise(setImmediate);const messages=p.elements.get('messages').children;assert.equal(messages[0].children[1].textContent,'Olá, preciso de ajuda.');assert.match(messages[1].children[1].textContent,/Resposta local conforme/);
});
test('transcrição tardia é descartada após trocar de amigo',async()=>{
 const p=preview();mockModel(p);let resolve;const original=p.context.fetch;p.context.fetch=async(url,init)=>url==='/api/transcribe'?new Promise(r=>resolve=r):original(url,init);const pending=vm.runInContext('sendVoice(new ArrayBuffer(44))',p.context);p.elements.get('friend-new-name').value='Novo';p.submit('friend-create-form');resolve({ok:true,json:async()=>({text:'Não inserir no novo amigo'})});await pending;assert.equal(p.elements.get('chat-text').value,'');assert.equal(p.elements.get('messages').children.length,0);
});
test('falha de configuração de áudio não deixa a tela dizer que está escutando',async()=>{
 const p=preview();mockVoice(p);const track={readyState:'live',stop(){},addEventListener(){}};p.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]});p.context.AudioContext=class{constructor(){throw Error('indisponível');}};await p.elements.get('toggle-mic').onclick();await new Promise(setImmediate);assert.equal(p.elements.get('mic-error').hidden,false);assert.match(p.elements.get('mic-error').textContent,/não consegui iniciar/i);assert.notEqual(p.elements.get('mic-status').textContent,'Escutando');
});
