import {recurrence} from './reservoir.js';
import {SkillExecutor,compilePlan,basePlan,validateSkills,type Skill,type Step} from './skills.js';
import {LiveNetwork,type LiveSnapshot} from './live.js';
import {Brain} from './core.js';
import {FriendsStore,maxFriends,friendsLimitMessage,type ChatMessage} from './friends.js';
/** Prévia visual isolada. Somente nome e aparência usam armazenamento local. */
const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let preferences=loadPreferences(),menuOpen=false;
let friends:FriendsStore|null=null,loadError='';
try{friends=new FriendsStore(localStorage,preferences.name);}catch(error){loadError=`Não foi possível abrir os amigos: ${String(error)}. Os dados foram preservados.`;}
let activeFriend=friends?.current()??null,messages:ChatMessage[]=activeFriend?.messages??[];
let skills:Skill[]=activeFriend?.skills??[];
preferences.name=activeFriend?.name??'Sem amigo';
let pendingDelete:{id:string;name:string}|null=null;

function applyPreferences(){
 document.documentElement.dataset.theme=preferences.theme;
 document.title=`${preferences.name} · prévia`;
 document.querySelectorAll<HTMLElement>('[data-companion-name]').forEach(node=>node.textContent=preferences.name);
 element<HTMLInputElement>('companion-name').value=activeFriend?.name??'';
 element('name-form').hidden=!activeFriend;
 element('theme-light').setAttribute('aria-pressed',String(preferences.theme==='light'));
 element('theme-dark').setAttribute('aria-pressed',String(preferences.theme==='dark'));
}
function storePreference(message:string){const saved=savePreferences(preferences);element('status').textContent=saved?message:'Preferência aplicada nesta página. O navegador não permitiu salvá-la.';return saved;}
function setTheme(theme:'light'|'dark'){
 preferences={...preferences,theme};applyPreferences();storePreference(`Modo ${theme==='dark'?'noturno':'claro'} selecionado. Salvo neste navegador.`);
}
element('theme-light').onclick=()=>setTheme('light');element('theme-dark').onclick=()=>setTheme('dark');
element('name-form').addEventListener('submit',event=>{
 event.preventDefault();
 try{if(!friends)throw Error(loadError);friends.rename(cleanName(element<HTMLInputElement>('companion-name').value));activeFriend=friends.current();preferences.name=activeFriend!.name;applyPreferences();renderFriends();element('name-status').textContent='Nome do amigo salvo neste navegador.';}
 catch(error){element('name-status').textContent=error instanceof Error?error.message:String(error);element('companion-name').focus();}
});
function setMenu(open:boolean){
 if(!open)cancelFriendForms();
 menuOpen=open;element('drawer').hidden=!open;element('overlay').hidden=!open;
 element('menu-open').setAttribute('aria-expanded',String(open));
 element('main').inert=open;element('topbar').inert=open;
 document.body.style.overflow=open?'hidden':'';
 if(open)element('menu-close').focus();else element('menu-open').focus();
}
element('menu-open').onclick=()=>setMenu(true);element('menu-close').onclick=()=>setMenu(false);element('overlay').onclick=()=>setMenu(false);
document.addEventListener('keydown',event=>{
 if(!menuOpen)return;
 if(event.key==='Escape'){event.preventDefault();if(!element('friend-delete-confirm').hidden||!element('friend-create-form').hidden){cancelFriendForms();element('friend-current').focus();}else setMenu(false);return;}
 if(event.key==='Tab'){
  const focusable=Array.from(element('drawer').querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')).filter(node=>!node.closest?.('[hidden]'));
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
for(const id of ['nav-activity','nav-conversation'])element(id).onclick=()=>setMenu(false);
function svg(tag:string,attrs:Record<string,string|number>,text?:string){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;return node;}
let outputLabels=['Ouvir','Perguntar','Tirar dúvidas','Fazer',...skills.map(skill=>skill.name)];
const network=element('network');
const inputNodes:SVGElement[]=[],outputNodes:SVGElement[]=[],potentialNodes:SVGElement[]=[],connectionNodes:SVGElement[][]=[];
let latest:LiveSnapshot|null=null,inspected:number|null=null,inspectedHidden:number|null=null;
const inputLabels=()=>latest?.source==='audio'?['Presença','Sem fala interpretada','Energia do áudio','Sem ocupação lida','Sem pedido interpretado','Sem silêncio inferido']:['Presença','Conversa','Página relevante','Ocupado','Pedido de ajuda','Silêncio'];
function inspect(index:number){
 inspectedHidden=null;inspected=index;if(!latest)return;
 const frame=latest.frame;
 element('neuron-inspect').textContent=index<6?`${inputLabels()[index]} · entrada ${(latest.input[index]??0).toFixed(3)} · disparo ${frame?.inputSpikes[index]??0}`:`${outputLabels[index-6]} · potencial ${(frame?.potentials[index-6]??0).toFixed(3)} / 1 · antes do reset ${(frame?.beforeReset[index-6]??0).toFixed(3)} · disparos na janela ${frame?.counts[index-6]??0} · 192 conexões de leitura plásticas · pesos iniciais ${live.brain.readoutWeights[index-6].slice(0,8).map(w=>w.toFixed(3)).join(", ")} · média ${(live.brain.readoutWeights[index-6].reduce((a,b)=>a+b,0)/192).toFixed(3)}`;
}
function buildNetwork(){
 network.replaceChildren();inputNodes.length=0;outputNodes.length=0;potentialNodes.length=0;connectionNodes.length=0;inputTexts.length=0;
 const height=Math.max(240,outputLabels.length*44);network.setAttribute('viewBox',`0 0 740 ${height}`);network.style.height=height+'px';
 const inputY=(i:number)=>20+i*(height-40)/5,outputY=(j:number)=>22+j*(height-44)/Math.max(1,outputLabels.length-1);
 for(let j=0;j<outputLabels.length;j++){connectionNodes[j]=[];for(let i=0;i<6;i++){const line=svg('line',{x1:175,y1:inputY(i),x2:500,y2:outputY(j),class:'connection'});connectionNodes[j].push(line);network.append(line);}}
 for(let i=0;i<6;i++){const label=svg('text',{x:0,y:inputY(i)+4},inputLabels()[i]);inputTexts.push(label);network.append(label);const node=svg('circle',{cx:175,cy:inputY(i),r:6,class:'input-node',tabindex:0,role:'img'});node.addEventListener('mouseenter',()=>inspect(i));node.addEventListener('focus',()=>inspect(i));inputNodes.push(node);network.append(node);}
 outputLabels.forEach((label,j)=>{const y=outputY(j);const ring=svg('circle',{cx:500,cy:y,r:16,class:'potential-ring',fill:'none','stroke-dasharray':'0 101',transform:`rotate(-90 500 ${y})`});potentialNodes.push(ring);network.append(ring);const node=svg('circle',{cx:500,cy:y,r:8,class:'output-node',tabindex:0,role:'img'});node.addEventListener('mouseenter',()=>inspect(j+6));node.addEventListener('focus',()=>inspect(j+6));outputNodes.push(node);network.append(node);network.append(svg('text',{x:530,y:y+5},label.length>25?label.slice(0,23)+'…':label));});
}
const inputTexts:SVGElement[]=[];
function renderNetwork(snapshot:LiveSnapshot){
 if(connectionNodes.length!==snapshot.weights.length)buildNetwork();
 latest=snapshot;const frame=snapshot.frame,d=snapshot.decision;
 const choiceLabel=d?outputLabels[d.choice]:snapshot.running?'Observando':'Pausado';if(element('choice').textContent!==(activeFriend?choiceLabel:'Crie um amigo'))element('choice').textContent=activeFriend?choiceLabel:'Crie um amigo';
 element('situation').textContent=`${snapshot.source==='demo'?'Demonstração: '+live.demoContext:snapshot.source==='audio'?'Entrada real: energia do microfone':'Entrada fixa: sem atividade informada'}${snapshot.running?'':' · pausada'}`;
 element('network-toggle').textContent=snapshot.running?'Pausar rede':'Retomar rede';
 element<HTMLButtonElement>('review-selected').disabled=!d||!activeFriend;
 element<HTMLButtonElement>('reward-good').disabled=!d;element<HTMLButtonElement>('reward-bad').disabled=!d;
 element('network-metrics').textContent=`Janela ${snapshot.window} · passo ${frame?.tick??0}/80 · disparos ${frame?.counts.join(' / ')??'0 / 0 / 0'} · ${snapshot.updates} atualizações de pesos${d?' · saída após política: '+outputLabels[d.effective]:''}. Nenhuma ferramenta é executada.`;
 inputNodes.forEach((node,i)=>{node.setAttribute('class','input-node'+(frame?.inputSpikes[i]?' fired':''));node.setAttribute('aria-label',`${inputLabels()[i]}: ${snapshot.input[i].toFixed(3)}`);inputTexts[i].textContent=inputLabels()[i];});
 outputNodes.forEach((node,j)=>{node.setAttribute('class','output-node'+(frame?.fired.includes(j)?' fired':''));node.setAttribute('aria-label',`${outputLabels[j]}: potencial ${(frame?.potentials[j]??0).toFixed(3)}, ${frame?.counts[j]??0} disparos`);potentialNodes[j].setAttribute('stroke-dasharray',`${Math.min(1,frame?.potentials[j]??0)*101} 101`);});
 connectionNodes.forEach((row,j)=>row.forEach((line,i)=>{const weight=snapshot.weights[j][i];line.setAttribute('stroke-width',String(.4+weight*5));line.setAttribute('opacity',String(.1+weight*.7));line.setAttribute('aria-label',`Peso ${weight.toFixed(4)}`);}));
 drawReservoir(snapshot);if(inspectedHidden!==null)inspectHidden(inspectedHidden);else if(inspected!==null)inspect(inspected);
}
function inspectHidden(index:number){
 inspectedHidden=index;const state=latest?.frame?.hidden;const edges=recurrence[index];
 element('neuron-inspect').textContent=`Interno ${index+1}/192 · potencial ${(state?.voltage[index]??0).toFixed(3)} / 1 · disparo ${state?.spikes[index]??0} · refratário ${state?.refractory[index]??0} · entradas recorrentes fixas: ${edges.map(edge=>`${edge.from+1}:${edge.weight.toFixed(3)}`).join(', ')}`;
}
function drawReservoir(snapshot:LiveSnapshot){
 const canvas=element<HTMLCanvasElement>('reservoir-view'),cr=canvas.getContext?.('2d');if(!cr)return;
 cr.clearRect(0,0,600,160);const state=snapshot.frame?.hidden;
 if(inspectedHidden!==null){const target=inspectedHidden;for(const edge of recurrence[target]){cr.beginPath();cr.moveTo((edge.from%24)*25+12,Math.floor(edge.from/24)*20+10);cr.lineTo((target%24)*25+12,Math.floor(target/24)*20+10);cr.strokeStyle=edge.weight<0?'#b87979':'#8f839f';cr.lineWidth=Math.abs(edge.weight)*12;cr.stroke();}}

 for(let i=0;i<192;i++){
  const x=(i%24)*25,y=Math.floor(i/24)*20;cr.fillStyle=state?.spikes[i]?'#ba9fdf':`rgba(142,135,155,${.18+(state?.voltage[i]??0)*.65})`;cr.fillRect(x+3,y+3,18,13);
  if(i===inspectedHidden){cr.strokeStyle='#9686ae';cr.strokeRect(x+1,y+1,22,17);}
 }
}
element('reservoir-view').addEventListener('pointermove',event=>{const canvas=element('reservoir-view'),rect=canvas.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width*600,y=(event.clientY-rect.top)/rect.height*160;inspectHidden(Math.min(191,Math.max(0,Math.floor(y/20)*24+Math.floor(x/25))));});
element('reservoir-view').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const delta=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-24:24;inspectHidden(Math.max(0,Math.min(191,(inspectedHidden??0)+delta)));}});
let analyser:AnalyserNode|null=null,audioContext:AudioContext|null=null,audioSource:MediaStreamAudioSourceNode|null=null,audioSamples:Float32Array<ArrayBuffer>|null=null;
function audioEnergy(){if(!analyser||!audioSamples)return 0;analyser.getFloatTimeDomainData(audioSamples);let sum=0;for(const n of audioSamples)sum+=n*n;return Math.min(1,Math.sqrt(sum/audioSamples.length)*8);}
let live=new LiveNetwork(renderNetwork,activeFriend?new Brain(activeFriend.brain):undefined,audioEnergy);
function stopAudioAnalysis(){audioSource?.disconnect();audioSource=null;analyser?.disconnect();analyser=null;audioSamples=null;const old=audioContext;audioContext=null;if(old)void old.close().catch(()=>{});}
function setInput(){const source=element<HTMLSelectElement>('input-source').value as 'idle'|'audio'|'demo';live.setSource(source,element<HTMLSelectElement>('demo-context').value||'Usuário ocupado');element('demo-context').hidden=source!=='demo';element<HTMLButtonElement>('teach').disabled=source!=='demo';}
element('input-source').onchange=setInput;element('demo-context').onchange=setInput;
element('network-toggle').onclick=()=>{if(activeFriend)live.snapshot().running?live.stop():live.start();};
function learning(action:()=>void){try{if(!activeFriend)throw Error('Crie um amigo primeiro.');action();persistFriend();element('status').textContent='Aprendizado salvo para '+activeFriend.name+'.';}catch(error){element('status').textContent=String(error);}}
element('reward-good').onclick=()=>learning(()=>live.feedback(1));element('reward-bad').onclick=()=>learning(()=>live.feedback(-1));element('teach').onclick=()=>learning(()=>live.teach(Number(element<HTMLSelectElement>('teach-target').value)));
const executor=new SkillExecutor();
let draftSteps:{kind:string;value:string}[]=[],pendingExecution:{friendId:string;plan:Step;catalog:Skill[];name:string}|null=null;
function renderSkills(){
 element('skill-count').textContent=String(outputLabels.length);element('neuron-count').textContent=`${192+outputLabels.length} neurônios LIF: 192 internos e ${outputLabels.length} saídas. 6 canais de entrada, não contados como neurônios. Todos os 192 internos são mostrados; recorrência fixa e leitura plástica.`;
 const target=element<HTMLSelectElement>('teach-target');target.replaceChildren();outputLabels.forEach((label,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=label;target.append(option);});
 const list=element('skill-list');list.replaceChildren();for(const skill of skills){const row=document.createElement('div');row.className='skill-item';row.textContent=skill.name+' · ensino humano';list.append(row);}
 element<HTMLButtonElement>('skill-new').disabled=!activeFriend||skills.length>=12;
}
function renderDraft(){
 const container=element('skill-steps');container.replaceChildren();draftSteps.forEach((step,index)=>{
  const row=document.createElement('div');row.className='skill-step';const select=document.createElement('select');select.setAttribute('aria-label',`Etapa ${index+1}`);
  const choices=[['wait','Aguardar (ms)'],['text','Mostrar texto local'],['prompt','Pedir informação'],['search_proposal','Propor pesquisa (sem pesquisar)'],['observe_audio','Observar energia de áudio (ms)'],...skills.map(skill=>['ref:'+skill.id,skill.name])];
  for(const [value,label]of choices){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=step.kind;
  const input=document.createElement('input');input.value=step.value;input.maxLength=500;input.setAttribute('aria-label',`Texto ou duração da etapa ${index+1}`);input.placeholder=step.kind==='wait'||step.kind==='observe_audio'?'Duração em ms':'Texto a mostrar';input.hidden=step.kind.startsWith('ref:');
  select.onchange=()=>{step.kind=select.value;step.value=step.kind==='wait'||step.kind==='observe_audio'?'500':'';renderDraft();};input.oninput=()=>{step.value=input.value;};
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remover etapa ${index+1}`);remove.onclick=()=>{draftSteps.splice(index,1);renderDraft();};row.append(select,input,remove);container.append(row);
 });
 element<HTMLButtonElement>('skill-add-step').disabled=draftSteps.length>=8;
}
element('skill-new').onclick=()=>{if(!activeFriend)return;draftSteps=[{kind:'prompt',value:''}];element('skill-form').hidden=false;element<HTMLInputElement>('skill-name').value='';renderDraft();element('skill-name').focus();};
element('skill-add-step').onclick=()=>{if(draftSteps.length<8){draftSteps.push({kind:'wait',value:'500'});renderDraft();}};
element('skill-cancel').onclick=()=>{element('skill-form').hidden=true;draftSteps=[];};
element('skill-form').addEventListener('submit',event=>{
 event.preventDefault();if(!activeFriend)return;
 try{
  const name=element<HTMLInputElement>('skill-name').value.trim();const steps:Step[]=draftSteps.map(step=>{
   if(step.kind.startsWith('ref:'))return {kind:'ref',id:step.kind.slice(4)};
   if(step.kind==='wait'||step.kind==='observe_audio')return {kind:step.kind,ms:Number(step.value)};
   if(step.kind==='text'||step.kind==='prompt'||step.kind==='search_proposal')return {kind:step.kind,text:step.value};throw Error('Etapa inválida');
  });
  const skill:Skill={id:'habilidade-'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)),name,origin:'ensino humano',plan:{kind:element<HTMLSelectElement>('skill-mode').value==='parallel'?'parallel':'sequence',steps}};
  const nextSkills=validateSkills([...skills,skill]);const nextBrain=new Brain(live.brain.snapshot());nextBrain.addAction(skill.id);
  friends!.save(nextBrain.snapshot(),messages,nextSkills);skills=nextSkills;live.brain=nextBrain;outputLabels=['Ouvir','Perguntar','Tirar dúvidas','Fazer',...skills.map(item=>item.name)];renderSkills();buildNetwork();live.refresh();element('skill-form').hidden=true;element('skill-status').textContent='Habilidade salva. Para ensinar quando usá-la, escolha Demonstração explícita em Detalhes da rede, selecione a habilidade e ensine exemplos.';
 }catch(error){element('skill-status').textContent=String(error);}
});
function cancelExecution(){executor.cancel();pendingExecution=null;element('execution-review').hidden=true;}
function describePlan(step:Step):string{
 if(step.kind==='sequence'||step.kind==='parallel')return (step.kind==='parallel'?'Ao mesmo tempo: ':'Em sequência: ')+step.steps.map(describePlan).join(' → ');
 if(step.kind==='wait')return `aguardar ${step.ms} ms`;if(step.kind==='observe_audio')return `observar energia local por ${step.ms} ms`;
 if(step.kind==='text')return `mostrar “${step.text}”`;if(step.kind==='prompt')return `perguntar “${step.text}”`;if(step.kind==='search_proposal')return `mostrar proposta “${step.text}”`;return 'habilidade referenciada';
}
element('review-selected').onclick=()=>{
 const decision=live.snapshot().decision;if(!decision||!activeFriend)return;const index=decision.choice;
 const plan=index<4?basePlan(index,microphone.state==='active'):skills[index-4]?.plan;if(!plan)return;
 pendingExecution={friendId:activeFriend.id,plan:compilePlan(plan,skills),catalog:JSON.parse(JSON.stringify(skills)),name:outputLabels[index]};element('skill-panel').setAttribute('open','');element('execution-review').hidden=false;
 element('execution-plan').textContent=`${outputLabels[index]}: ${describePlan(pendingExecution.plan)}. Somente efeitos locais, sem modelo ou comandos gerais.`;
};
element('execution-cancel').onclick=()=>{cancelExecution();element('skill-status').textContent='Execução cancelada.';};
element('execute-skill').onclick=()=>{
 const pending=pendingExecution;if(!pending||pending.friendId!==activeFriend?.id)return;pendingExecution=null;element<HTMLButtonElement>('execute-skill').disabled=true;
 const friendId=pending.friendId;
 void executor.run(pending.plan,pending.catalog,{audioActive:()=>microphone.state==='active'&&activeFriend?.id===friendId,energy:audioEnergy,report:text=>{if(activeFriend?.id===friendId)element('skill-status').textContent=text;},emit:(kind,text)=>{
  if(activeFriend?.id!==friendId)return;const label=kind==='search_proposal'?'Proposta de pesquisa (não executada)':kind==='prompt'?'Pedido de informação':'Texto local';messages.push({user:false,text:`[${label}] ${text}`,source:'local'});addMessage(`[${label}] ${text}`,false,'local');persistFriend();
 }}).then(()=>{if(activeFriend?.id===friendId)element('skill-status').textContent='Habilidade concluída. Avalie a escolha com ＋ ou −.';}).catch(error=>{if(activeFriend?.id===friendId)element('skill-status').textContent=String(error);}).finally(()=>{element<HTMLButtonElement>('execute-skill').disabled=false;element('execution-review').hidden=true;});
};
function persistFriend(){if(friends&&activeFriend)friends.save(live.brain.snapshot(),messages,skills);}
function cancelFriendForms(){pendingDelete=null;element('friend-create-form').hidden=true;element('friend-delete-confirm').hidden=true;}
function renderFriends(){
 element('friend-current').textContent=(activeFriend?.name??'Nenhum amigo')+' ⌄';
 element<HTMLButtonElement>('friend-delete').disabled=!activeFriend;
 const atLimit=(friends?.snapshot().friends.length??0)>=maxFriends;
 element<HTMLButtonElement>('friend-create').disabled=!friends||atLimit;
 element('friend-limit').hidden=!atLimit;element('friend-limit').textContent=atLimit?friendsLimitMessage:'';
 if(atLimit)element('friend-create-form').hidden=true;
 for(const id of ['session-toggle','network-toggle','chat-text'])element<HTMLButtonElement>(id).disabled=!activeFriend;
 element<HTMLButtonElement>('teach').disabled=!activeFriend||live.source!=='demo';
 const list=element('friend-list');list.replaceChildren();
 for(const friend of friends?.snapshot().friends??[]){const button=document.createElement('button');button.type='button';button.textContent=friend.name;button.setAttribute('aria-current',String(friend.id===activeFriend?.id));button.onclick=()=>changeFriend(()=>friends!.select(friend.id));list.append(button);}
}
function renderMessages(){element('messages').replaceChildren();for(const message of messages)addMessage(message.text,message.user,message.source);}
function suspendFriend(){cancelExecution();microphone.stop();live.stop();stopAudioAnalysis();persistFriend();}
function changeFriend(operation:()=>void){
 try{suspendFriend();operation();activeFriend=friends!.current();messages=activeFriend?.messages??[];skills=activeFriend?.skills??[];outputLabels=['Ouvir','Perguntar','Tirar dúvidas','Fazer',...skills.map(skill=>skill.name)];preferences.name=activeFriend?.name??'Sem amigo';
  live=new LiveNetwork(renderNetwork,activeFriend?new Brain(activeFriend.brain):undefined,audioEnergy);draftSteps=[];element('skill-form').hidden=true;pendingExecution=null;inspectedHidden=null;inspected=null;latest=null;element<HTMLSelectElement>('input-source').value='idle';element('demo-context').hidden=true;element<HTMLButtonElement>('teach').disabled=true;
  cancelFriendForms();applyPreferences();renderFriends();renderMessages();renderSkills();buildNetwork();renderNetwork(live.snapshot());element('friend-current').focus();element('status').textContent=activeFriend?'Amigo selecionado. Microfone desligado; inicie quando quiser.':'Nenhum amigo. Abra o menu para criar um novo.';
 }catch(error){element('friend-status').textContent=String(error);}
}
element('friend-current').onclick=()=>{const open=element('friend-options').hidden;element('friend-options').hidden=!open;element('friend-current').setAttribute('aria-expanded',String(open));if(!open)cancelFriendForms();};
element('friend-create').onclick=()=>{if(!friends||(friends.snapshot().friends.length>=maxFriends)){element('friend-status').textContent=friendsLimitMessage;return;}cancelFriendForms();element('friend-create-form').hidden=false;element<HTMLInputElement>('friend-new-name').value='';element('friend-new-name').focus();};
element('friend-create-cancel').onclick=()=>{cancelFriendForms();element('friend-create').focus();};
element('friend-create-form').addEventListener('submit',event=>{event.preventDefault();try{if(!friends||friends.snapshot().friends.length>=maxFriends)throw Error(friendsLimitMessage);const name=cleanName(element<HTMLInputElement>('friend-new-name').value);changeFriend(()=>friends!.create(name));}catch(error){element('friend-status').textContent=String(error);}});
element('friend-delete').onclick=()=>{if(!activeFriend)return;cancelFriendForms();pendingDelete={id:activeFriend.id,name:activeFriend.name};element('delete-warning').textContent=`Apagar o amigo “${activeFriend.name}”? O aprendizado e a conversa deste amigo serão perdidos definitivamente neste navegador. Os outros amigos e o tema serão mantidos.`;element('friend-delete-confirm').hidden=false;element('friend-delete-cancel').focus();};
element('friend-delete-cancel').onclick=()=>{cancelFriendForms();element('friend-delete').focus();};
element('friend-delete-yes').onclick=()=>{if(!pendingDelete)return;const id=pendingDelete.id;changeFriend(()=>friends!.delete(id,true));element('friend-current').focus();};
window.addEventListener('storage',event=>{if(event.key==='companheiro.friends.v1'){cancelExecution();microphone.stop();live.stop();stopAudioAnalysis();for(const id of ['session-toggle','network-toggle','teach','reward-good','reward-bad','chat-text','friend-create','friend-delete'])element<HTMLButtonElement>(id).disabled=true;element('status').textContent='Amigos alterados em outra aba. Reabra esta página para continuar sem sobrescrever dados.';}});
function addMessage(text:string,user:boolean,source:'demo'|'local'='demo'){
 const container=element('messages'),message=document.createElement('div');message.className=`message ${user?'user':'companion'}`;
 const byline=document.createElement('div');byline.className='message-byline';
 const author=document.createElement('span');author.textContent=user?'Você':preferences.name;if(!user)author.setAttribute('data-companion-name','');byline.append(author);
 if(!user){const note=document.createElement('span');note.className='message-type';note.textContent=source==='local'?'AÇÃO LOCAL':'RESPOSTA SIMULADA';byline.append(note);}
 const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;message.append(byline,bubble);container.append(message);container.scrollTop=container.scrollHeight;
}
element('chat-form').addEventListener('submit',event=>{
 event.preventDefault();const input=element<HTMLInputElement>('chat-text'),text=input.value.trim();if(!text)return;
 if(!activeFriend)return;
 const reply='Estou aqui. Podemos ir uma coisa de cada vez.';messages.push({user:true,text},{user:false,text:reply});addMessage(text,true);input.value='';addMessage(reply,false);try{persistFriend();}catch(error){element('status').textContent=String(error);}
});
applyPreferences();renderFriends();renderMessages();renderSkills();if(activeFriend)live.start();else renderNetwork(live.snapshot());
element('status').textContent=loadError||friends?.migration||'';
const microphone=new MicrophoneSession(async()=>{
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Captura de microfone indisponível. Abra esta página em localhost ou HTTPS em um navegador compatível.');
 return navigator.mediaDevices.getUserMedia({audio:true,video:false});
},(state,error)=>{
 const button=element<HTMLButtonElement>('session-toggle');button.textContent=state==='active'?'Encerrar':state==='starting'?'Cancelar':'Iniciar companheiro';
 element('mic-status').textContent=state==='active'?'Microfone ativo':state==='starting'?'Aguardando permissão…':'Desligado';
 element('mic-dot').classList.toggle('active',state==='active');
 element('mic-error').hidden=!error;element('mic-error').textContent=error;
 if(state!=='active'){
  stopAudioAnalysis();
  const audioOption=element<HTMLSelectElement>('input-source').querySelector<HTMLOptionElement>('option[value="audio"]');if(audioOption)audioOption.disabled=true;
  if(live.source==='audio'){element<HTMLSelectElement>('input-source').value='idle';live.setSource('idle');}
  if(state==='off'){cancelExecution();live.stop();}
 }
 element('mic-note').textContent=state==='active'?'Captura local ativa nesta aba. Sem gravação, envio ou reconhecimento de voz.':'Microfone local. Sem gravação, envio ou reconhecimento de voz.';
});
element('session-toggle').onclick=()=>{if(!activeFriend)return;const friendAtStart=activeFriend.id;if(microphone.state==='off'){
  live.start();
  void microphone.start().then(()=>{
   const stream=microphone.getStream();if(!stream||activeFriend?.id!==friendAtStart)return;
   try{
    audioContext=new AudioContext();audioSource=audioContext.createMediaStreamSource(stream);analyser=audioContext.createAnalyser();analyser.fftSize=512;audioSamples=new Float32Array(512);audioSource.connect(analyser);
    const created=audioContext;void audioContext.resume().catch(()=>{if(audioContext!==created)return;element('status').textContent='Análise de energia indisponível. A rede continua com entrada fixa.';stopAudioAnalysis();element<HTMLSelectElement>('input-source').value='idle';live.setSource('idle');});
    const option=element<HTMLSelectElement>('input-source').querySelector<HTMLOptionElement>('option[value="audio"]');if(option)option.disabled=false;
    element<HTMLSelectElement>('input-source').value='audio';setInput();
   }catch{stopAudioAnalysis();element('status').textContent='Análise de energia indisponível. A captura está ativa, sem interpretação de fala.';}
  });
 }else microphone.stop();};
window.addEventListener('pagehide',()=>{cancelExecution();microphone.stop();live.stop();stopAudioAnalysis();try{persistFriend();}catch{}});
window.addEventListener('beforeunload',()=>{cancelExecution();microphone.stop();live.stop();stopAudioAnalysis();try{persistFriend();}catch{}});
