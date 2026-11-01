import test from 'node:test';
import assert from 'node:assert/strict';
import {Brain,LIFSimulation,contexts} from '../dist/core.js';
import {LiveNetwork} from '../dist/live.js';
test('cada snapshot deriva do mesmo integrador usado no núcleo, com disparos e reset reais',()=>{
 const brain=new Brain(),sim=new LIFSimulation(brain.weights),input=contexts['Pedido de ajuda'];
 for(let i=0;i<80;i++){const f=sim.step(input);for(const j of f.fired){assert.ok(f.beforeReset[j]>=1);assert.equal(f.potentials[j],0);}assert.equal(f.tick,i+1);}
 assert.deepEqual(sim.result(),brain.run(input));assert.ok(sim.result().spikes.some(n=>n>0));
});
test('janela ao vivo mostra contagem, raster e escolha idênticos à avaliação do núcleo',()=>{
 const brain=new Brain();let last;const live=new LiveNetwork(s=>last=s,brain);live.setSource('demo','Conversa com página relevante');live.advance(80);
 const expected=new Brain(brain.snapshot()).decide('Conversa com página relevante');assert.deepEqual(last.decision,expected);assert.deepEqual(last.frame.counts,expected.spikes);assert.equal(last.frame.tick,80);
 const old=last.weights[0][0];brain.weights[0][0]=.9;assert.equal(last.weights[0][0],old); // snapshot não é referência mutável
});
test('potencial e disparos respondem à entrada de energia real fornecida, sem sorteios',()=>{
 let energy=0;const live=new LiveNetwork(()=>{},new Brain(),()=>energy);live.setSource('audio');live.advance(80);const silent=live.snapshot();energy=1;live.setSource('audio');live.advance(80);const loud=live.snapshot();assert.equal(silent.input[2],0);assert.equal(loud.input[2],1);assert.notDeepEqual(silent.decision.spikes,loud.decision.spikes);
});
test('ensino muda pesos e escolha, feedback negativo pode mudar preferência',()=>{
 const live=new LiveNetwork(()=>{});live.setSource('demo','Usuário ocupado');live.advance(80);const before=live.snapshot();const target=(before.decision.choice+1)%3;
 for(let i=0;i<8;i++)live.teach(target);live.advance(80);assert.equal(live.snapshot().decision.choice,target);assert.notDeepEqual(live.snapshot().weights,before.weights);assert.equal(live.snapshot().updates,8);
 const original=live.snapshot().decision.choice;for(let i=0;i<20;i++){live.feedback(-1);live.advance(80);if(live.snapshot().decision.choice!==original)break;}assert.notEqual(live.snapshot().decision.choice,original);
});
test('feedback consome uma decisão e snapshots de perfil continuam válidos em áudio',()=>{
 const live=new LiveNetwork(()=>{});live.setSource('audio');live.advance(80);live.feedback(1);assert.throws(()=>live.feedback(1));assert.doesNotThrow(()=>new Brain(live.brain.snapshot()));
});
test('pausar ou encerrar não deixa intervalos em execução',()=>{
 const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;const timers=new Map();let id=0;
 globalThis.setInterval=fn=>{timers.set(++id,fn);return id;};globalThis.clearInterval=i=>timers.delete(i);
 try{const live=new LiveNetwork(()=>{});live.start();live.start();assert.equal(timers.size,2);for(const fn of timers.values())fn();assert.equal(live.snapshot().frame.tick,1);live.stop();assert.equal(timers.size,0);live.stop();assert.equal(timers.size,0);}finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}
});
test('iniciativa depende de pesos e evidências; ensino sozinho não libera proposta',()=>{
 const live=new LiveNetwork(()=>{});live.setSource('demo','Conversa com página relevante');for(let i=0;i<8;i++)live.teach(3);live.advance(80);assert.equal(live.snapshot().decision.choice,3);assert.equal(live.snapshot().decision.effective,1);for(let i=0;i<3;i++){live.feedback(1);live.advance(80);}assert.equal(live.snapshot().decision.effective,3);
});
