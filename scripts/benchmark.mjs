import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {Brain,LIFSimulation,contexts} from '../dist/core.js';
const report={runtime:process.version,scope:'Núcleo em Node; exclui navegador, DOM, áudio e servidor',scenarios:[]};
for(const count of [4,16]){
 global.gc?.();const initial=process.memoryUsage().heapUsed;const brain=new Brain();for(let i=4;i<count;i++)brain.addAction('habilidade-bench-'+i);let sim=new LIFSimulation(brain.weights,brain.readoutWeights);global.gc?.();const allocated=process.memoryUsage().heapUsed;
 const input=contexts['Pedido de ajuda'];let spikes=0;const steps=10000,start=performance.now();
 for(let tick=0;tick<steps;tick++){if(tick&&tick%80===0)sim=new LIFSimulation(brain.weights,brain.readoutWeights,sim.temporal());const frame=sim.step(input);spikes+=frame.hidden.spikes.reduce((sum,n)=>sum+n,0);}
 const elapsed=performance.now()-start;global.gc?.();const retained=process.memoryUsage().heapUsed;
 report.scenarios.push({internalNeurons:192,outputNeurons:count,steps,elapsedMs:+elapsed.toFixed(2),stepsPerSecond:Math.round(steps*1000/elapsed),internalFiringFraction:+(spikes/(192*steps)).toFixed(5),heapDeltaAfterConstructionKiB:+((allocated-initial)/1024).toFixed(2),heapDeltaAfterRunGC_KiB:+((retained-initial)/1024).toFixed(2),serializedBrainBytes:Buffer.byteLength(JSON.stringify(brain.snapshot()))});
}
console.log(JSON.stringify(report,null,2));writeFileSync('BENCHMARK.json',JSON.stringify(report,null,2)+'\n');
