/** Reservatório LIF recorrente esparso e fixo; o readout plástico fica em core.ts. */
export const reservoirConfig={version:1,size:192,indegree:8,seed:31} as const;
export interface ReservoirState {voltage:number[];spikes:number[];refractory:number[]}
export function emptyReservoir():ReservoirState{return {voltage:Array(192).fill(0),spikes:Array(192).fill(0),refractory:Array(192).fill(0)};}
export function validReservoirState(value:unknown):ReservoirState{
 const state=value as ReservoirState;if(!state||!Array.isArray(state.voltage)||!Array.isArray(state.spikes)||!Array.isArray(state.refractory)||[state.voltage,state.spikes,state.refractory].some(row=>row.length!==192)||state.voltage.some(v=>!Number.isFinite(v)||v<0||v>=1)||state.spikes.some(v=>v!==0&&v!==1)||state.refractory.some(v=>!Number.isInteger(v)||v<0||v>2))throw Error('Estado temporal inválido');return JSON.parse(JSON.stringify(state));
}
let seed=reservoirConfig.seed as number;function rng(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
export const inputProjection=Array.from({length:192},(_,n)=>Array.from({length:6},(_,i)=>i===n%6?.4+rng()*.2:rng()*.12));
export const recurrence=Array.from({length:192},(_,n)=>{const used=new Set<number>([n]);return Array.from({length:8},()=>{let from=Math.floor(rng()*192);while(used.has(from))from=(from+1)%192;used.add(from);return {from,weight:from%4===0?-(.08+rng()*.06):.025+rng()*.045};});});
export class Reservoir {
 state:ReservoirState;
 constructor(state=emptyReservoir()){this.state=validReservoirState(state);}
 step(inputSpikes:number[]){
  const before=this.state,next=emptyReservoir();
  for(let n=0;n<192;n++){
   if(before.refractory[n]>0){next.refractory[n]=before.refractory[n]-1;continue;}
   let current=.025;for(let i=0;i<6;i++)current+=inputProjection[n][i]*inputSpikes[i];for(const edge of recurrence[n])current+=edge.weight*before.spikes[edge.from];
   const v=Math.max(0,.9*before.voltage[n]+current);if(v>=1){next.spikes[n]=1;next.refractory[n]=2;}else next.voltage[n]=v;
  }
  this.state=next;return next;
 }
}
export function initialReadout(rows:number){let s=91;return Array.from({length:rows},()=>Array.from({length:192},()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return .08+.14*s/4294967296;}));}
