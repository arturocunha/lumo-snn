import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const runtimeDir=fileURLToPath(new URL('../../../work/local-model/',import.meta.url));
export class LocalRuntime {
 child=null;starting=null;idle=null;stopping=null;
 status(){return {configured:existsSync(runtimeDir+'Qwen3-0.6B-Q4_K_M.gguf')&&existsSync(runtimeDir+'llama-b12032/llama-server'),running:!!this.child,local:true};}
 async ensure(signal){
  if(this.stopping)await this.stopping;if(signal.aborted)throw Error('Conversa cancelada.');if(!this.status().configured)throw Error('O modelo local não está instalado.');clearTimeout(this.idle);
  if(!this.starting){const pending=this.start();this.starting=pending;pending.catch(()=>{if(this.starting===pending)this.starting=null;});}await this.starting;
  if(signal.aborted){await this.stop();throw Error('Conversa cancelada.');}this.idle=setTimeout(()=>this.stop(),120000);this.idle.unref();
 }
 async start(){
  try{const r=await fetch('http://127.0.0.1:4174/health',{signal:AbortSignal.timeout(500)});if(r.ok){const models=await(await fetch('http://127.0.0.1:4174/v1/models',{signal:AbortSignal.timeout(500)})).json();if(!models.data?.some(m=>m.id==='qwen3-local'))throw Error('Porta do modelo ocupada por outro serviço.');return;}}catch(error){if(error.message==='Porta do modelo ocupada por outro serviço.')throw error;}
  this.child=spawn(runtimeDir+'llama-b12032/llama-server',['-m',runtimeDir+'Qwen3-0.6B-Q4_K_M.gguf','--host','127.0.0.1','--port','4174','--ctx-size','3072','--batch-size','128','--ubatch-size','64','--threads','4','--threads-batch','4','--parallel','1','--n-gpu-layers','0','--alias','qwen3-local','--no-webui','--reasoning','off','--chat-template-kwargs','{"enable_thinking":false}'],{stdio:'ignore'});
  const child=this.child;let failed=false;child.once('error',()=>{failed=true;if(this.child===child){this.child=null;this.starting=null;}});child.once('exit',()=>{failed=true;if(this.child===child){this.child=null;this.starting=null;}});
  for(let i=0;i<150;i++){if(failed)throw Error('O modelo local não iniciou.');await new Promise(r=>setTimeout(r,100));try{const r=await fetch('http://127.0.0.1:4174/health',{signal:AbortSignal.timeout(500)});if(r.ok)return;}catch{}}
  this.stop();throw Error('O modelo local demorou para carregar.');
 }
 stop(){clearTimeout(this.idle);this.idle=null;this.starting=null;const child=this.child;if(!child)return this.stopping??Promise.resolve();this.child=null;this.stopping=new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');},1500);timer.unref();child.once('exit',()=>{clearTimeout(timer);this.stopping=null;resolve();});child.kill('SIGTERM');});return this.stopping;}
}
