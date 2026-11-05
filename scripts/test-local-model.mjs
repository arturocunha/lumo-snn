import http from 'node:http';
import {createChatApi} from './chat-api.mjs';
import {LiveNetwork} from '../dist/live.js';
import {LocalRuntime} from './local-runtime.mjs';
import {modelConfig,interpretChat} from './model-provider.mjs';
import {Brain} from '../dist/core.js';
import {TextConversation,applyTurnFeedback} from '../dist/conversation.js';
import {readFileSync,writeFileSync} from 'node:fs';
const runtime=new LocalRuntime(),config=modelConfig(),signal=new AbortController().signal;
const results={model:'Qwen3-0.6B Q4_K_M',runtime:'llama.cpp b12032 CPU, 4 threads, contexto 3072, batch128/ubatch64',syntheticOnly:true,cases:[],memory:{},limitations:'Amostra pequena, não benchmark. Interpretação e fatos podem falhar. Não é compreensão ou raciocínio da SNN.'};
const api=http.createServer(createChatApi(config,{runtime}));await new Promise(r=>api.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+api.address().port;
try{
 const start=performance.now();await runtime.ensure(signal);results.loadMs=performance.now()-start;
 const brain=new Brain(),runner=new TextConversation(),live=new LiveNetwork(()=>{},brain);let index=0;
 for(const text of ['Quanto é 7 + 5?','Isso não funciona, me ajuda.','Estou ocupado. Espere um pouco.']){
  const phases=[],request={phase:'interpret',requestId:'teste-local-'+(++index),friendId:'amigo-ficticio',name:'Luna',text,consent:true,candidates:brain.actionIds.map((id,i)=>({id,name:['Ouvir','Perguntar','Tirar dúvidas','Fazer'][i]})),history:[]};
  const start=performance.now();const result=await runner.send(request,brain,async(req,s)=>{const begin=performance.now();const response=await fetch(origin+'/api/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(req),signal:s});const data=await response.json();if(!response.ok)throw Error(data.error);phases.push({phase:req.phase,ms:+(performance.now()-begin).toFixed(1)});return data;},async(input,s)=>{const begin=performance.now();const decision=await live.evaluateText(input,s);phases.push({phase:'snn',ms:+(performance.now()-begin).toFixed(1)});return decision;});
  const before=brain.snapshot();applyTurnFeedback(brain,result.turn,index===1?1:-1);results.cases.push({text,reply:result.reply,features:result.turn.features,suggestedIds:result.turn.suggestedIds,choiceId:result.turn.choiceId,phases,totalMs:+(performance.now()-start).toFixed(1),weightsChanged:JSON.stringify(before.weights)!==JSON.stringify(brain.weights),feedback:result.turn.feedback,traceId:result.turn.id});
 }
 if(runtime.child){const smaps=readFileSync('/proc/'+runtime.child.pid+'/smaps_rollup','utf8');for(const label of ['Rss','Pss','Swap'])results.memory[label+'KiB']=Number(new RegExp('^'+label+':\\s+(\\d+)','m').exec(smaps)?.[1]??0);}
 console.log(JSON.stringify(results,null,2));writeFileSync('LOCAL-MODEL-VALIDATION.json',JSON.stringify(results,null,2)+'\n');
}finally{await runtime.stop();await new Promise(r=>api.close(r));}
