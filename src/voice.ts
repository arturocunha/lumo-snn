/** Segmentos curtos em RAM. Silêncio encerra fala; nenhum áudio é armazenado no navegador. */
export function encodePcmWav(samples:Float32Array,sampleRate:number):ArrayBuffer{
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Taxa de áudio inválida.');
 const length=Math.floor(samples.length*16000/sampleRate),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
 const ascii=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};ascii(0,'RIFF');view.setUint32(4,36+length*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,length*2,true);
 for(let i=0;i<length;i++){const p=i*sampleRate/16000,j=Math.floor(p),f=p-j,n=samples[j]*(1-f)+samples[Math.min(j+1,samples.length-1)]*f;view.setInt16(44+i*2,Math.max(-1,Math.min(1,n))*32767,true);}return buffer;
}
export class VoiceSegmenter {
 private chunks:Float32Array[]=[];private length=0;private quiet=0;private voiced=0;private preRoll:Float32Array[]=[];
 constructor(private sampleRate:number,private emit:(wav:ArrayBuffer)=>void){}
 reset(){this.chunks=[];this.length=0;this.quiet=0;this.voiced=0;this.preRoll=[];}
 push(block:Float32Array){
  if(!block.length)return;
  let square=0;for(const n of block)square+=n*n;const rms=Math.sqrt(square/block.length),duration=block.length/this.sampleRate;
  if(!this.length){this.preRoll.push(new Float32Array(block));while(this.preRoll.length>1&&this.preRoll.reduce((sum,part)=>sum+part.length,0)>this.sampleRate*.2)this.preRoll.shift();if(rms<=.008)return;for(const part of this.preRoll.slice(0,-1)){this.chunks.push(part);this.length+=part.length;}this.preRoll=[];}
  if(rms>.008){this.voiced+=duration;this.quiet=0;}else this.quiet+=duration;
  this.chunks.push(new Float32Array(block));this.length+=block.length;
  if(this.quiet>=.7||this.length/this.sampleRate>=10){if(this.voiced>=.35){const audio=new Float32Array(this.length);let offset=0;for(const part of this.chunks){audio.set(part,offset);offset+=part.length;}this.reset();this.emit(encodePcmWav(audio,this.sampleRate));}else this.reset();}
 }
}
