import {Brain,LIFSimulation,contexts, type NeuralFrame,type Decision} from './core.js';
export type InputSource='idle'|'demo'|'audio';
export interface LiveSnapshot {running:boolean;source:InputSource;frame:NeuralFrame|null;weights:number[][];decision:Decision|null;updates:number;window:number;input:number[]}
/** Mesmo integrador usado em Brain.run. Passos independem do desenho e não usam aleatoriedade. */
export class LiveNetwork {
 brain:Brain;private simulation:LIFSimulation;private tick=0;private windows=0;private timer:ReturnType<typeof setInterval>|null=null;private displayTimer:ReturnType<typeof setInterval>|null=null;
 source:InputSource='idle';demoContext='Usuário ocupado';frame:NeuralFrame|null=null;decision:Decision|null=null;
 private input=contexts['Sem atividade informada'];
 constructor(private notify:(snapshot:LiveSnapshot)=>void,brain=new Brain(),private energy:()=>number=()=>0){this.brain=brain;this.simulation=new LIFSimulation(brain.weights,brain.readoutWeights,brain.temporal);}
 snapshot():LiveSnapshot{return {running:this.timer!==null,source:this.source,frame:this.frame,weights:this.brain.weights.map(row=>[...row]),decision:this.decision,updates:this.brain.updates,window:this.windows,input:[...this.input]};}
 start(){if(this.timer!==null)return;this.timer=setInterval(()=>{this.advance(1,false);},20);this.displayTimer=setInterval(()=>this.notify(this.snapshot()),100);this.notify(this.snapshot());}
 stop(){this.brain.temporal=this.simulation.temporal();if(this.timer!==null)clearInterval(this.timer);if(this.displayTimer!==null)clearInterval(this.displayTimer);this.timer=null;this.displayTimer=null;this.notify(this.snapshot());}
 setSource(source:InputSource,context=this.demoContext){if(source==='demo'&&!Object.hasOwn(contexts,context))throw Error('Entrada inválida');this.source=source;this.demoContext=context;this.reset();this.notify(this.snapshot());}
 refresh(){this.reset();this.notify(this.snapshot());}
 private reset(){this.tick=0;this.simulation=new LIFSimulation(this.brain.weights,this.brain.readoutWeights,this.brain.temporal);this.decision=null;this.frame=null;this.brain.pending=null;}
 advance(steps=5,publish=true){
  for(let i=0;i<steps;i++){
   if(this.tick===80){this.tick=0;this.simulation=new LIFSimulation(this.brain.weights,this.brain.readoutWeights,this.simulation.temporal());}
   this.input=this.source==='demo'?contexts[this.demoContext]:this.source==='audio'?[1,0,Math.min(1,Math.max(0,this.energy())),0,0,0]:[1,0,0,0,0,1];
   this.frame=this.simulation.step(this.input);this.tick++;
   if(this.tick===80){this.windows++;this.decision=this.brain.complete(this.simulation.result(),this.source==='demo'?this.demoContext:this.source==='audio'?'Áudio local':'Sem atividade informada');}
  }
  this.brain.temporal=this.simulation.temporal();if(publish)this.notify(this.snapshot());
 }
 feedback(reward:number){if(!this.decision)throw Error('Aguarde uma decisão completa.');this.brain.pending=this.decision;this.brain.feedback(reward);this.reset();this.notify(this.snapshot());}
 teach(target:number){if(this.source!=='demo')throw Error('Use uma entrada de demonstração para ensinar.');this.brain.teach(this.demoContext,target);this.reset();this.notify(this.snapshot());}
}
