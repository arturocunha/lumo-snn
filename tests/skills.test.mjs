import test from 'node:test';
import assert from 'node:assert/strict';
import {Brain} from '../dist/core.js';
import {FriendsStore,friendsKey} from '../dist/friends.js';
import {validateSkills,compilePlan,SkillExecutor} from '../dist/skills.js';
const skill=(id='habilidade-local')=>({id,name:'Pausa e pergunta',origin:'ensino humano',plan:{kind:'sequence',steps:[{kind:'wait',ms:100},{kind:'prompt',text:'Quer continuar?'}]}});
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('catálogo ganha nova saída real; ensino altera seleção, leitura plástica e feedback',()=>{
 const b=new Brain();const initial=b.weights.map(r=>[...r]);b.addAction('habilidade-local');assert.deepEqual(b.weights.slice(0,4),initial);const oldReadout=b.readoutWeights[4].slice();for(let i=0;i<8;i++)b.teach('Pedido de ajuda',4);assert.equal(b.decide('Pedido de ajuda').choice,4);assert.notDeepEqual(b.readoutWeights[4],oldReadout);for(let i=0;i<20;i++){b.decide('Pedido de ajuda');b.feedback(-1);}assert.notEqual(b.decide('Pedido de ajuda').choice,4);assert.equal(b.weights.length,5);
});
test('habilidades, pesos e conversa persistem só no amigo correspondente',()=>{
 const s=storage(),store=new FriendsStore(s),first=store.current(),b=new Brain(first.brain);b.addAction('habilidade-local');b.teach('Pedido de ajuda',4);store.save(b.snapshot(),[{user:true,text:'Oi'}],[skill()]);store.create('Outro');assert.deepEqual(store.current().skills,[]);assert.equal(store.current().brain.weights.length,4);store.select(first.id);const restored=new FriendsStore(s);assert.deepEqual(restored.current().skills,[skill()]);assert.deepEqual(restored.current().brain,b.snapshot());assert.equal(restored.current().messages[0].text,'Oi');store.delete(first.id,true);assert.equal(store.snapshot().friends.length,1);assert.equal(store.current().skills.length,0);
});
test('migração mantém pesos legados e evidência com mapeamento explícito e cópia',()=>{
 const s=storage();const weights=Array.from({length:3},(_,j)=>Array(6).fill(.1+j*.1));const raw={version:1,revision:3,active:'old',friends:[{id:'old',name:'Antigo',brain:{version:1,weights,evidence:{'Pedido de ajuda':{'2':[4,1]}},updates:5},messages:[{user:true,text:'histórico'}]}]};s.setItem(friendsKey,JSON.stringify(raw));const store=new FriendsStore(s);const b=store.current().brain;assert.deepEqual(b.weights[0],weights[0]);assert.deepEqual(b.weights[1],weights[1]);assert.deepEqual(b.weights[3],weights[2]);assert.deepEqual(b.evidence['Pedido de ajuda']['3'],[4,1]);assert.equal(b.readoutWeights.length,4);assert.equal(store.current().messages[0].text,'histórico');assert.equal(JSON.parse(s.getItem('companheiro.backup.before-reservoir.v1')).friends[0].brain.version,1);
});
test('referências sem ciclos são compiladas; ciclos, conflitos e excesso são bloqueados',()=>{
 const a=skill(),b={...skill('habilidade-combinada'),plan:{kind:'ref',id:a.id}};assert.equal(compilePlan(b.plan,[a,b]).kind,'sequence');assert.throws(()=>validateSkills([{...a,plan:{kind:'ref',id:a.id}}]),/Ciclo/);assert.throws(()=>compilePlan({kind:'parallel',steps:[{kind:'text',text:'a'},{kind:'prompt',text:'b'}]},[]),/recurso/);assert.throws(()=>compilePlan({kind:'parallel',steps:[{kind:'observe_audio',ms:100},{kind:'observe_audio',ms:100}]},[]),/recurso/);assert.throws(()=>compilePlan({kind:'sequence',steps:Array(4).fill({kind:'wait',ms:10000})},[]),/30 segundos/);assert.throws(()=>compilePlan({kind:'shell',text:'não'},[]),/indisponível/);
});
test('executor é sequencial e cancelamento impede etapas posteriores',async()=>{
 const executor=new SkillExecutor(),emitted=[];const promise=executor.run(skill().plan,[],{emit:(_,text)=>emitted.push(text),audioActive:()=>false,energy:()=>0,report(){}});executor.cancel();await assert.rejects(promise,/cancelada/);assert.equal(emitted.length,0);assert.equal(executor.active,false);
});
test('paralelismo é execução real compatível; áudio não ativa microfone e captura resultado local',async()=>{
 const executor=new SkillExecutor(),events=[];const plan={kind:'parallel',steps:[{kind:'observe_audio',ms:100},{kind:'text',text:'Olá'}]};const promise=executor.run(plan,[],{emit:(_,t)=>events.push(t),audioActive:()=>true,energy:()=>.25,report:t=>events.push(t)});assert.deepEqual(events,['Olá']);await promise;assert.match(events[1],/0.250/);await assert.rejects(executor.run(plan,[],{emit(){},audioActive:()=>false,energy:()=>0,report(){}}),/já ativo/);
});
test('expansão tem limite explícito e não altera pesos existentes quando falha',()=>{
 const b=new Brain();for(let i=0;i<12;i++)b.addAction('habilidade-limite-'+i);const before=b.snapshot();assert.throws(()=>b.addAction('habilidade-extra'));assert.deepEqual(b.snapshot(),before);assert.equal(before.readoutWeights.length,16);
});
