/** Dados de apresentação apenas: sem SNN, API, voz ou ação nativa. */
interface PreviewPreferences {name:string;theme:'light'|'dark'}
const preferenceKey='companheiro.preview.preferences.v1';
function cleanName(value:unknown):string{
 if(typeof value!=='string')throw Error('Escolha um nome para o companheiro.');
 const name=value.trim().replace(/\s+/g,' ');
 if(!name||Array.from(name).length>32||/[\u0000-\u001f\u007f]/.test(name))throw Error('Use um nome de 1 a 32 caracteres.');
 return name;
}
function loadPreferences():PreviewPreferences{
 const defaults:PreviewPreferences={name:'Companheiro',theme:'light'};
 try{const value=JSON.parse(localStorage.getItem(preferenceKey)??'null');if(value&&typeof value==='object'){defaults.name=cleanName(value.name);if(value.theme==='dark'||value.theme==='light')defaults.theme=value.theme;}}catch{}
 return defaults;
}
function savePreferences(preferences:PreviewPreferences):boolean{
 try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));return true;}catch{return false;}
}
/** Captura local real, iniciada só por gesto. Não grava, não analisa e não envia áudio. */
type CaptureState='off'|'starting'|'active';
class MicrophoneSession {
 state:CaptureState='off';
 private stream:MediaStream|null=null;
 private generation=0;
 getStream(){return this.stream;}
 constructor(private request:()=>Promise<MediaStream>,private notify:(state:CaptureState,error:string)=>void){}
 async start(){
  if(this.state!=='off')return;
  const generation=++this.generation;this.state='starting';this.notify(this.state,'');
  try{
   const stream=await this.request();
   if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
   const tracks=stream.getAudioTracks();
   if(!tracks.length||tracks.every(track=>track.readyState==='ended')){stream.getTracks().forEach(track=>track.stop());throw Error('Nenhum microfone ativo foi encontrado.');}
   this.stream=stream;
   tracks.forEach(track=>track.addEventListener('ended',()=>{if(this.stream===stream)this.stop('O microfone foi desconectado ou a captura foi encerrada pelo navegador.');},{once:true}));
   this.state='active';this.notify(this.state,'');
  }catch(error){
   if(generation!==this.generation)return;
   this.state='off';const name=(error as {name?:string})?.name;
   const message=name==='NotAllowedError'?'Permissão do microfone negada. Você pode alterá-la nas configurações deste site.':name==='NotFoundError'?'Nenhum microfone encontrado. Conecte um microfone e tente novamente.':name==='NotReadableError'?'Não foi possível acessar o microfone. Ele pode estar ocupado por outro aplicativo.':error instanceof Error?error.message:'Não foi possível iniciar o microfone. Tente novamente.';
   this.notify(this.state,message);
  }
 }
 stop(error=''){
  ++this.generation;const stream=this.stream;this.stream=null;
  stream?.getTracks().forEach(track=>track.stop());this.state='off';this.notify(this.state,error);
 }
}
