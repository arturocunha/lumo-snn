import test from 'node:test';
import assert from 'node:assert/strict';
import {Reservoir,recurrence,inputProjection} from '../dist/reservoir.js';
import {Brain,LIFSimulation,contexts} from '../dist/core.js';
test('192 LIF recorrentes participam, com 1536 conexões fixas e dinâmica determinística estável',()=>{
 assert.equal(recurrence.length,192);assert.equal(recurrence.flat().length,1536);assert.equal(inputProjection.flat().length,1152);const a=new Reservoir(),b=new Reservoir(),count=Array(192).fill(0);for(let i=0;i<1000;i++){const x=a.step([1,1,1,1,1,1]),y=b.step([1,1,1,1,1,1]);assert.deepEqual(x,y);x.spikes.forEach((n,j)=>count[j]+=n);assert.ok(x.voltage.every(v=>v>=0&&v<1));}assert.ok(count.every(n=>n>0&&n<=334));
});
test('memória recorrente muda estado futuro com entrada atual idêntica',()=>{
 const warm=new Reservoir();for(let i=0;i<13;i++)warm.step([1,1,0,0,1,0]);const cold=new Reservoir();assert.notDeepEqual(warm.step([1,0,0,0,0,0]),cold.step([1,0,0,0,0,0]));
});
test('camada interna afeta disparos e pode mudar escolha mesmo com pesos de contexto iguais',()=>{
 const b=new Brain();b.weights=b.weights.map(()=>Array(6).fill(.12));b.readoutWeights=b.readoutWeights.map(()=>Array(192).fill(0));const without=b.decide('Pedido de ajuda');b.readoutWeights[3]=Array(192).fill(1);const withHidden=b.decide('Pedido de ajuda');assert.notDeepEqual(withHidden.spikes,without.spikes);assert.equal(withHidden.choice,3);assert.notEqual(without.choice,3);
});
test('aprendizado é retido após serialização e mantém preferência em entrada próxima',()=>{
 const b=new Brain();for(let i=0;i<8;i++)b.teach('Pedido de ajuda',1);const expected=b.decide('Pedido de ajuda').choice;const copy=new Brain(JSON.parse(JSON.stringify(b.snapshot())));assert.equal(copy.decide('Pedido de ajuda').choice,expected);assert.equal(copy.run([1,1,0,0,.9,0]).choice,expected);assert.equal(expected,1);
});
test('estado temporal serializado retoma a mesma dinâmica interna',()=>{
 const b=new Brain(),simulation=new LIFSimulation(b.weights,b.readoutWeights);for(let i=0;i<25;i++)simulation.step(contexts['Pedido de ajuda']);b.temporal=simulation.temporal();const restored=new Brain(b.snapshot());const continued=new LIFSimulation(restored.weights,restored.readoutWeights,restored.temporal);assert.deepEqual(continued.step([1,0,0,0,0,0]).hidden,simulation.step([1,0,0,0,0,0]).hidden);
});
test('arestas recorrentes, além do vazamento, afetam a próxima dinâmica',()=>{
 const warm=new Reservoir();for(let i=0;i<31;i++)warm.step([1,0,1,0,1,0]);const state=structuredClone(warm.state);const input=[1,0,1,0,1,0];const withRecurrence=new Reservoir(state).step(input);const weights=recurrence.map(row=>row.map(edge=>edge.weight));
 try{recurrence.forEach(row=>row.forEach(edge=>edge.weight=0));const without=new Reservoir(state).step(input);assert.notDeepEqual(withRecurrence,without);}finally{recurrence.forEach((row,i)=>row.forEach((edge,j)=>edge.weight=weights[i][j]));}
});
