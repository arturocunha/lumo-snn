import {voiceAvailable,stopVoice} from './voice-local.mjs';
import {createHash} from 'node:crypto';
import {publicModel,validateChatRequest,interpretChat} from './model-provider.mjs';
export function createChatApi(config,{fetcher=fetch,runtime=null}={}){
 const cache=new Map(),busy=new Set();
 return async function chatApi(req,res){
  const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(host)){res.writeHead(403);res.end();return;}
  const path=new URL(req.url,'http://'+host).pathname;const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'};
  const reply=(status,data)=>{if(!res.destroyed){res.writeHead(status,headers);res.end(JSON.stringify(data));}};
  if(path==='/api/model'&&req.method==='GET'){reply(200,{...publicModel(config),voiceAvailable:voiceAvailable(),...(runtime?runtime.status():{})});return;}
  if(path==='/api/model/start'&&req.method==='POST'&&req.headers.origin==='http://'+host){const startController=new AbortController();res.on('close',()=>{if(!res.writableEnded)startController.abort();});try{if(!runtime)throw Error();await runtime.ensure(startController.signal);reply(200,{ready:true});}catch{reply(503,{error:'Não foi possível iniciar o modelo local. Confira os arquivos instalados e a porta 4174.'});}return;}
  if(path==='/api/model/stop'&&req.method==='POST'&&req.headers.origin==='http://'+host){stopVoice();await runtime?.stop();reply(200,{stopped:true});return;}
  if(path!=='/api/chat'||req.method!=='POST'){reply(404,{error:'Rota indisponível'});return;}
  if(req.headers.origin!=='http://'+host||!req.headers['content-type']?.startsWith('application/json')){reply(403,{error:'Origem de conversa inválida'});return;}
  if(!config){reply(503,{error:'Modelo não conectado.'});return;}
  const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try{
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>48000)throw Error('Pedido muito grande');}
   const request=validateChatRequest(JSON.parse(raw)),key=request.friendId+':'+request.requestId+':'+request.phase,hash=createHash('sha256').update(raw).digest('hex');
   for(const [id,entry]of cache)if(Date.now()-entry.time>600000)cache.delete(id);
   if(cache.has(key)){const entry=cache.get(key);if(entry.hash!==hash)throw Error('Identificador de pedido já utilizado');const result=await entry.promise;reply(result.status,result.body);return;}
   if(busy.has(request.friendId)){reply(409,{error:'Já há uma mensagem deste amigo em processamento.'});return;}
   if(cache.size>=100){reply(429,{error:'Limite temporário de pedidos atingido. Aguarde.'});return;}
   busy.add(request.friendId);
   const promise=(async()=>{await runtime?.ensure(controller.signal);return interpretChat(config,request,controller.signal,fetcher);})().then(body=>({status:200,body})).catch(error=>({status:502,body:{error:controller.signal.aborted?'Conversa cancelada.':error?.name==='TimeoutError'?'O modelo demorou além do limite.':error instanceof SyntaxError?'O modelo retornou JSON inválido.':error.message?.startsWith('O provedor')||error.message?.startsWith('O modelo')?error.message:'Não foi possível concluir a conversa com o modelo.'}})).finally(()=>busy.delete(request.friendId));
   cache.set(key,{time:Date.now(),hash,promise});const result=await promise;reply(result.status,result.body);
  }catch{reply(400,{error:'Pedido de conversa inválido.'});}
 };
}
