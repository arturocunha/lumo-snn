import test from 'node:test';import assert from 'node:assert/strict';
import {Brain} from '../dist/core.js';import {LiveNetwork} from '../dist/live.js';
import {TextConversation,applyTurnFeedback,validateInterpretation} from '../dist/conversation.js';
import {FriendsStore} from '../dist/friends.js';
const interpretation={features:[1,1,.8,0,1,0],uncertainty:.2,suggestedIds:['fazer'],rationale:'Pedido claro.'};
function request(){const b=new Brain();return {phase:'interpret',requestId:'teste-turno',friendId:'amigo',name:'Luna',text:'Como organizar o dia?',consent:true,history:[],candidates:b.actionIds.map(id=>({id,name:id}))};}
function evaluate(brain,input){const d=brain.complete(brain.run(input),'Conversa textual');return Promise.resolve(d);}
test('modelo sugere mas SNN escolhe; resposta é solicitada só após essa escolha',async()=>{
 const b=new Brain();for(let i=0;i<8;i++)b.teach('Pedido de ajuda',1);const calls=[],runner=new TextConversation();const result=await runner.send(request(),b,async req=>{calls.push(req);return req.phase==='interpret'?{interpretation,model:'mock-local'}:{reply:'Pergunta escolhida: '+req.choiceId,model:'mock-local'};},input=>evaluate(b,input));assert.equal(result.turn.choiceId,'perguntar');assert.notEqual(result.turn.choiceId,interpretation.suggestedIds[0]);assert.equal(calls[1].choiceId,'perguntar');assert.match(result.reply,/perguntar/);
});
test('feedback usa elegibilidade daquele turno, mesmo após outro tick ou decisão',async()=>{
 const b=new Brain(),runner=new TextConversation(),result=await runner.send(request(),b,async req=>req.phase==='interpret'?{interpretation,model:'mock'}:{reply:'Resposta real mock',model:'mock'},input=>evaluate(b,input));const target=b.actionIds.indexOf(result.turn.choiceId),before=b.weights[target].slice();b.decide('Usuário ocupado');applyTurnFeedback(b,result.turn,1);assert.notDeepEqual(b.weights[target],before);assert.equal(result.turn.feedback,1);assert.throws(()=>applyTurnFeedback(b,result.turn,1));
});
test('esquema inválido não produz resposta nem decisão',async()=>{
 const b=new Brain(),runner=new TextConversation();let evaluated=false;await assert.rejects(runner.send(request(),b,async()=>({interpretation:{features:[99]},model:'mock'}),async()=>{evaluated=true;return b.decide('Pedido de ajuda');}),/formato inválido/);assert.equal(evaluated,false);
});
test('cancelamento descarta resposta atrasada e impede chamada seguinte',async()=>{
 const runner=new TextConversation(),b=new Brain();let resolve;const promise=runner.send(request(),b,()=>new Promise(r=>resolve=r),input=>evaluate(b,input));runner.cancel();resolve({interpretation,model:'mock'});await assert.rejects(promise,/cancelada/);assert.equal(runner.busy,false);
});
test('clique repetido não duplica transporte',async()=>{
 const runner=new TextConversation(),b=new Brain();let resolve,calls=0;const first=runner.send(request(),b,()=>{calls++;return new Promise(r=>resolve=r);},input=>evaluate(b,input));await assert.rejects(runner.send(request(),b,async()=>{calls++;return {};},input=>evaluate(b,input)),/Aguarde/);runner.cancel();resolve({interpretation,model:'mock'});await assert.rejects(first);assert.equal(calls,1);
});
test('decisão textual congela a mesma rede após 80 passos e limpa timers',async()=>{
 const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval,timers=new Map();let id=0;globalThis.setInterval=fn=>{timers.set(++id,fn);return id;};globalThis.clearInterval=i=>timers.delete(i);
 try{const live=new LiveNetwork(()=>{}),promise=live.evaluateText(interpretation.features,new AbortController().signal);for(let i=0;i<80;i++)for(const fn of timers.values())fn();const d=await promise;assert.equal(d.context,'Conversa textual');assert.equal(timers.size,0);assert.equal(live.snapshot().frame.tick,80);assert.deepEqual(live.snapshot().decision,d);}finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}
});
test('turno e feedback persistem isolados por amigo e recarga aceita trace',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},store=new FriendsStore(storage),first=store.current(),b=new Brain(first.brain),req={...request(),friendId:first.id};const runner=new TextConversation(),result=await runner.send(req,b,async r=>r.phase==='interpret'?{interpretation,model:'mock'}:{reply:'Olá',model:'mock'},input=>evaluate(b,input));store.save(b.snapshot(),[{user:false,text:result.reply,source:'model',turn:result.turn}]);store.create('Outro');assert.equal(store.current().messages.length,0);store.select(first.id);const restored=new FriendsStore(storage).current();applyTurnFeedback(new Brain(restored.brain),restored.messages[0].turn,-1);assert.equal(restored.messages[0].turn.feedback,-1);
});
test('contexto só inclui mensagens do modelo real e respeita limite curto',async()=>{
 const {conversationHistory}=await import('../dist/conversation.js');const history=conversationHistory([{user:false,text:'resposta fixa antiga',source:'demo'},...Array.from({length:20},(_,i)=>({user:i%2===0,text:'mensagem '+i,source:'model'}))]);assert.equal(history.length,6);assert.ok(history.every(m=>m.content!=='resposta fixa antiga'));
});
