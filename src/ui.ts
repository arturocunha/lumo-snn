/** Prévia visual isolada. Somente nome e aparência usam armazenamento local. */
const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let preferences=loadPreferences(),exampleIndex=0,menuOpen=false;
function applyPreferences(){
 document.documentElement.dataset.theme=preferences.theme;
 document.title=`${preferences.name} · prévia`;
 document.querySelectorAll<HTMLElement>('[data-companion-name]').forEach(node=>node.textContent=preferences.name);
 element<HTMLInputElement>('companion-name').value=preferences.name;
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
 try{preferences={...preferences,name:cleanName(element<HTMLInputElement>('companion-name').value)};applyPreferences();const saved=storePreference('Nome atualizado. A conversa e as decisões continuam simuladas.');element('name-status').textContent=saved?'Nome salvo neste navegador.':'Nome alterado, mas não foi possível salvar neste navegador.';}
 catch(error){element('name-status').textContent=error instanceof Error?error.message:String(error);element('companion-name').focus();}
});
function setMenu(open:boolean){
 menuOpen=open;element('drawer').hidden=!open;element('overlay').hidden=!open;
 element('menu-open').setAttribute('aria-expanded',String(open));
 element('main').inert=open;element('topbar').inert=open;
 document.body.style.overflow=open?'hidden':'';
 if(open)element('menu-close').focus();else element('menu-open').focus();
}
element('menu-open').onclick=()=>setMenu(true);element('menu-close').onclick=()=>setMenu(false);element('overlay').onclick=()=>setMenu(false);
document.addEventListener('keydown',event=>{
 if(!menuOpen)return;
 if(event.key==='Escape'){event.preventDefault();setMenu(false);return;}
 if(event.key==='Tab'){
  const focusable=Array.from(element('drawer').querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
for(const id of ['nav-activity','nav-conversation'])element(id).onclick=()=>setMenu(false);
function svg(tag:string,attrs:Record<string,string|number>,text?:string){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;return node;}
function showDecision(){
 const example=decisionExamples[exampleIndex];element('choice').textContent=example.title;element('choice-description').textContent=example.description;element('situation').textContent=example.situation;element('decision-icon').textContent=example.icon;element('sample-number').textContent=`0${exampleIndex+1} / 03`;
 const network=element('network');network.replaceChildren();
 const inputs=['Conversa','Atenção','Relevância','Momento'];const outputs=['Aguardar','Perguntar','Sugerir uma página'];
 illustrativeWeights.forEach((row,j)=>inputs.forEach((_,i)=>network.append(svg('line',{x1:160,y1:35+i*55,x2:500,y2:45+j*75,class:'connection','stroke-width':.6+row[i]*5,opacity:j===example.choice?.75:.23}))));
 inputs.forEach((name,i)=>{network.append(svg('text',{x:0,y:40+i*55},name));network.append(svg('circle',{cx:160,cy:35+i*55,r:5,class:'input-node'}));});
 outputs.forEach((name,j)=>{if(j===example.choice)network.append(svg('circle',{cx:500,cy:45+j*75,r:20,class:'node-halo'}));network.append(svg('circle',{cx:500,cy:45+j*75,r:8,class:'output-node'+(j===example.choice?' selected':'')}));network.append(svg('text',{x:530,y:50+j*75,class:'output-text'+(j===example.choice?' selected':'')},name));});
}
element('next-decision').onclick=()=>{exampleIndex=(exampleIndex+1)%decisionExamples.length;showDecision();};
function addMessage(text:string,user:boolean){
 const container=element('messages'),message=document.createElement('div');message.className=`message ${user?'user':'companion'}`;
 const byline=document.createElement('div');byline.className='message-byline';
 if(!user){const mark=document.createElement('span');mark.className='message-mark';mark.textContent='◌';mark.setAttribute('aria-hidden','true');byline.append(mark);}
 const author=document.createElement('span');author.textContent=user?'Você':preferences.name;if(!user)author.setAttribute('data-companion-name','');byline.append(author);
 if(!user){const note=document.createElement('span');note.className='message-type';note.textContent='RESPOSTA SIMULADA';byline.append(note);}
 const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;message.append(byline,bubble);container.append(message);container.scrollTop=container.scrollHeight;
}
element('chat-form').addEventListener('submit',event=>{
 event.preventDefault();const input=element<HTMLInputElement>('chat-text'),text=input.value.trim();if(!text)return;
 addMessage(text,true);input.value='';addMessage('Estou aqui. Podemos ir uma coisa de cada vez. Esta é uma resposta simulada, só para você conhecer o espaço da conversa.',false);
});
applyPreferences();showDecision();
