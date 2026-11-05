import {Reservoir,reservoirConfig,emptyReservoir,validReservoirState,initialReadout,type ReservoirState} from './reservoir.js';
/** Rede LIF determinística, independente da interface e do runtime desktop. */
export const actions = ['ouvir', 'perguntar', 'tirar_duvidas', 'fazer'] as const;
export const contexts: Record<string, number[]> = {
 'Conversa com página relevante': [1,1,1,0,.5,0],
 'Usuário ocupado': [1,0,0,1,0,0],
 'Pedido de ajuda': [1,1,0,0,1,0],
 'Sem atividade informada': [1,0,0,0,0,1],
};
export const features = ['Presença','Conversa','Página relevante','Ocupado','Pedido de ajuda','Silêncio'];
export interface Decision {choice:number; effective:number; scores:number[]; spikes:number[]; raster:number[][]; eligibility:number[][];hiddenEligibility:number[][];hiddenActivity:number[]; features:number[]; context:string; reliable:boolean; margin:number}
export interface Profile {version:1|2|3|4; reservoir?:typeof reservoirConfig;readoutWeights?:number[][];temporal?:ReservoirState;actionIds?:string[]; weights:number[][]; evidence:Record<string,Record<string,[number,number]>>; updates:number}
export function validateProfile(value:unknown): Profile {
 const raw=value as Profile;
 if(!raw||![1,2,3,4].includes(raw.version)||!Array.isArray(raw.weights)||!Number.isSafeInteger(raw.updates)||raw.updates<0||!raw.evidence||typeof raw.evidence!=='object'||Array.isArray(raw.evidence))throw Error('Rede inválida. O arquivo foi preservado.');
 let p=JSON.parse(JSON.stringify(raw)) as Profile;
 if(p.version<3){
  const legacyIds=p.version===1?['aguardar','perguntar','propor_url']:p.actionIds;
  if(!Array.isArray(legacyIds)||legacyIds.length!==p.weights.length||legacyIds.slice(0,3).join(',')!=='aguardar,perguntar,propor_url'||p.weights.length<3||p.weights.length>15)throw Error('Rede legada inválida');
  p.weights.splice(2,0,features.map(()=>.12));p.actionIds=[...actions,...legacyIds.slice(3)];
  for(const entries of Object.values(p.evidence)){if(!entries||typeof entries!=='object'||Array.isArray(entries))throw Error('Evidências inválidas');const mapped:Record<string,[number,number]>={};for(const [key,counts]of Object.entries(entries)){if(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=legacyIds.length)throw Error('Evidências inválidas');mapped[String(Number(key)>=2?Number(key)+1:Number(key))]=counts;}for(const key of Object.keys(entries))delete entries[key];Object.assign(entries,mapped);}
  p.version=3;
 }
 if(p.weights.length<4||p.weights.length>16||p.weights.some(row=>!Array.isArray(row)||row.length!==6||row.some(w=>typeof w!=='number'||!Number.isFinite(w)||w<0||w>1)))throw Error('Pesos inválidos');
 if(p.version===3){p.version=4;p.reservoir={...reservoirConfig};p.readoutWeights=initialReadout(p.weights.length);p.temporal=emptyReservoir();}
 if(JSON.stringify(p.reservoir)!==JSON.stringify(reservoirConfig)||!Array.isArray(p.readoutWeights)||p.readoutWeights.length!==p.weights.length||p.readoutWeights.some(row=>!Array.isArray(row)||row.length!==192||row.some(w=>!Number.isFinite(w)||w<0||w>1)))throw Error('Readout ou configuração do reservatório inválidos');p.temporal=validReservoirState(p.temporal);
 const ids=p.actionIds;if(!Array.isArray(ids)||ids.length!==p.weights.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id)||actions.some((id,i)=>ids[i]!==id))throw Error('Catálogo da rede inválido');
 for(const [context,entries]of Object.entries(p.evidence)){
  if((!Object.hasOwn(contexts,context)&&context!=='Áudio local'&&context!=='Conversa textual')||!entries||typeof entries!=='object'||Array.isArray(entries))throw Error('Evidências inválidas');
  for(const [action,counts]of Object.entries(entries))if(!/^(0|[1-9][0-9]*)$/.test(action)||Number(action)>=p.weights.length||!Array.isArray(counts)||counts.length!==2||counts.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Feedback inválido');
 }
 return p;
}
export interface NeuralFrame {tick:number; inputSpikes:number[]; fired:number[]; potentials:number[]; beforeReset:number[]; counts:number[];hidden:ReservoirState}
export class LIFSimulation {
 private voltage:number[]; private counts:number[]; private phase=Array(6).fill(0);private pre=Array(6).fill(0);
 private eligibility:number[][];private hiddenTrace=Array(192).fill(0);private hiddenEligibility:number[][];private hiddenActivity=Array(192).fill(0);private reservoir:Reservoir;private readout:number[][];private raster:number[][]=[];private input:number[]=Array(6).fill(0);
 constructor(private weights:number[][],readout=initialReadout(weights.length),temporal=emptyReservoir()){this.reservoir=new Reservoir(temporal);this.readout=readout;this.hiddenEligibility=weights.map(()=>Array(192).fill(0));this.voltage=weights.map(()=>0);this.counts=weights.map(()=>0);this.eligibility=weights.map(()=>Array(6).fill(0));}
 step(input:number[]):NeuralFrame{
  if(input.length!==6||input.some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('Contexto inválido');
  this.input=[...input];const inputSpikes=input.map((rate,i)=>{this.phase[i]+=rate;const spike=this.phase[i]>=1?1:0;this.phase[i]-=spike;this.pre[i]=.8*this.pre[i]+spike;return spike;});
  const hidden=this.reservoir.step(inputSpikes);hidden.spikes.forEach((spike,n)=>{this.hiddenTrace[n]=.9*this.hiddenTrace[n]+spike;this.hiddenActivity[n]+=spike;});
  const fired:number[]=[],beforeReset:number[]=[];
  this.weights.forEach((row,j)=>{this.voltage[j]=.85*this.voltage[j]+.6*row.reduce((s,w,i)=>s+w*inputSpikes[i],0)+3*this.readout[j].reduce((sum,w,n)=>sum+w*hidden.spikes[n],0)/192;beforeReset.push(this.voltage[j]);if(this.voltage[j]>=1){this.counts[j]++;this.voltage[j]=0;fired.push(j);this.pre.forEach((v,i)=>this.eligibility[j][i]+=v);this.hiddenTrace.forEach((v,n)=>this.hiddenEligibility[j][n]+=v);}});
  this.raster.push(fired);
  return {tick:this.raster.length,inputSpikes,fired,potentials:[...this.voltage],beforeReset,counts:[...this.counts],hidden:validReservoirState(hidden)};
 }
 temporal(){return validReservoirState(this.reservoir.state);}
 result(){const scores=this.counts.map((n,j)=>n+this.voltage[j]);return {choice:scores.indexOf(Math.max(...scores)),scores,spikes:[...this.counts],raster:this.raster.map(row=>[...row]),eligibility:this.eligibility.map(row=>[...row]),features:[...this.input],hiddenEligibility:this.hiddenEligibility.map(row=>[...row]),hiddenActivity:[...this.hiddenActivity]};}
}
export class Brain {
 actionIds:string[]=[...actions];readoutWeights:number[][];temporal=emptyReservoir();weights:number[][]; evidence:Profile['evidence']={}; updates=0; pending:Decision|null=null;
 constructor(profile?:unknown){
  let seed=7; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  this.weights=actions.map(()=>features.map(()=>.08+.2*random()));
  this.readoutWeights=initialReadout(this.weights.length);
  if(profile){const p=validateProfile(profile);this.weights=p.weights;this.readoutWeights=p.readoutWeights!;this.temporal=p.temporal!;this.actionIds=p.actionIds!;this.evidence=p.evidence;this.updates=p.updates;}
 }
 snapshot():Profile{return validateProfile({version:4,reservoir:{...reservoirConfig},readoutWeights:this.readoutWeights,temporal:this.temporal,actionIds:this.actionIds,weights:this.weights,evidence:this.evidence,updates:this.updates});}
 addAction(id:string){if(this.actionIds.includes(id)||this.weights.length>=16||!/^habilidade-[A-Za-z0-9-]{1,80}$/.test(id))throw Error('Não é possível adicionar esta habilidade.');this.actionIds.push(id);this.weights.push(features.map(()=>.12));this.readoutWeights.push(Array(192).fill(.12));this.pending=null;}
 run(input:number[]):Omit<Decision,'context'|'effective'|'reliable'|'margin'>{
  const simulation=new LIFSimulation(this.weights,this.readoutWeights);for(let i=0;i<80;i++)simulation.step(input);return simulation.result();
 }
 complete(result:ReturnType<LIFSimulation['result']>,context:string):Decision{
  const margin=result.scores[result.choice]-Math.max(...result.scores.filter((_,i)=>i!==result.choice));
  const [good,bad]=this.evidence[context]?.[String(result.choice)]??[0,0];
  const reliable=good>=3&&good/Math.max(1,good+bad)>=.75&&margin>=2;
  return this.pending={...result,context,margin,reliable,effective:result.choice>=3&&!reliable?1:result.choice};
 }

 decide(context:string):Decision{
  if(!Object.hasOwn(contexts,context))throw Error('Contexto desconhecido');
  return this.complete(this.run(contexts[context]),context);
 }

 private plasticity(r:ReturnType<Brain['run']>,target:number,reward:number){
  let trace=r.eligibility[target];if(!trace.some(Boolean))trace=r.features;
  const scale=Math.max(...trace,1e-9);
  this.weights[target]=this.weights[target].map((w,i)=>Math.min(1,Math.max(0,w+.075*reward*trace[i]/scale)));let hidden=r.hiddenEligibility[target];if(!hidden.some(Boolean))hidden=r.hiddenActivity;const hiddenScale=Math.max(...hidden,1e-9);this.readoutWeights[target]=this.readoutWeights[target].map((w,n)=>Math.max(0,Math.min(1,w+.10*reward*hidden[n]/hiddenScale)));this.updates++;
 }
 rewardTrace(target:number,inputTrace:number[],hiddenTrace:number[],reward:1|-1,context:string){
  if(!Number.isInteger(target)||target<0||target>=this.weights.length||![1,-1].includes(reward)||inputTrace.length!==6||hiddenTrace.length!==192||[...inputTrace,...hiddenTrace].some(n=>!Number.isFinite(n)||n<0||n>10000)||context!=='Conversa textual')throw Error('Feedback de interação inválido');
  const scale=Math.max(...inputTrace,1e-9),hiddenScale=Math.max(...hiddenTrace,1e-9);
  this.weights[target]=this.weights[target].map((w,i)=>Math.max(0,Math.min(1,w+.075*reward*inputTrace[i]/scale)));
  this.readoutWeights[target]=this.readoutWeights[target].map((w,i)=>Math.max(0,Math.min(1,w+.10*reward*hiddenTrace[i]/hiddenScale)));this.updates++;
  const entries=this.evidence[context]??(this.evidence[context]={}),counts=entries[String(target)]??(entries[String(target)]=[0,0]);counts[reward>0?0:1]++;
 }
 feedback(reward:number){
  if(!this.pending||![1,-1].includes(reward))throw Error('Avalie novamente antes de dar feedback');
  const r=this.pending;this.plasticity(r,r.choice,reward);
  const entries=this.evidence[r.context]??(this.evidence[r.context]={});const record=entries[String(r.choice)]??(entries[String(r.choice)]=[0,0]);record[reward>0?0:1]++;this.pending=null;
 }
 teachInput(input:number[],target:number){if(!Number.isInteger(target)||target<0||target>=this.weights.length)throw Error('Habilidade inválida');this.plasticity(this.run(input),target,1);this.pending=null;}
 teach(context:string,target:number){
  if(!Object.hasOwn(contexts,context)||!Number.isInteger(target)||target<0||target>=this.weights.length)throw Error('Exemplo inválido');
  this.plasticity(this.run(contexts[context]),target,1);this.pending=null;
 }
}
export function profileName(value:string){if(!/^[A-Za-z0-9_-]{1,40}$/.test(value))throw Error('Perfil: use até 40 letras sem acentos, números, _ ou -');return value;}
/** Gramática estrita, sem credenciais, escape de host ou protocolos executáveis. */
export function validateUrl(value:unknown):string{
 if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f\\]/.test(value))throw Error('Use uma URL HTTP/HTTPS válida, sem espaços');
 const m=/^https?:\/\/([^/?#]+)([/?#].*)?$/i.exec(value);if(!m)throw Error('Somente páginas HTTP/HTTPS são aceitas');
 const authority=m[1];if(authority.includes('@'))throw Error('Credenciais na URL não são aceitas');
 const parts=/^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(authority);
 if(!parts)throw Error('Endereço inválido. Use domínio ASCII ou punycode.');
 const host=parts[1];if(parts[2]&&Number(parts[2])>65535)throw Error('Porta inválida');
 if(host.startsWith('[')){if(!host.includes('::')&&host.split(':').length!==8)throw Error('IPv6 inválido');}
 else if(host.length>253||host.replace(/\.$/,'').split('.').some(label=>!/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])$/.test(label)))throw Error('Domínio inválido');
 return value;
}
export function executeUrl(value:unknown,confirmed:boolean,opener:(url:string)=>void){const url=validateUrl(value);if(confirmed!==true)throw Error('Confirmação obrigatória');opener(url);}
