import {existsSync} from 'node:fs';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
export const voiceDir=fileURLToPath(new URL('../../../work/local-voice/',import.meta.url));
export const voiceAvailable=()=>existsSync(voiceDir+'whisper.cpp-1.5.5/main')&&existsSync(voiceDir+'ggml-base-q5_1.bin');
let active=null;
export function stopVoice(){active?.abort();}
export function validateWav(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<44+16000||buffer.length>44+16000*2*12||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE'||buffer.toString('ascii',12,16)!=='fmt '||buffer.readUInt32LE(16)!==16||buffer.readUInt16LE(20)!==1||buffer.readUInt16LE(22)!==1||buffer.readUInt32LE(24)!==16000||buffer.readUInt16LE(34)!==16||buffer.toString('ascii',36,40)!=='data'||buffer.readUInt32LE(40)!==buffer.length-44)throw Error('Áudio inválido.');return buffer;
}
export async function transcribeWav(buffer,signal){
 validateWav(buffer);if(!voiceAvailable())throw Error('Voz indisponível. Use texto.');if(active)throw Error('Aguarde a transcrição atual.');const controller=new AbortController();active=controller;const combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(20000)]);let dir;
 try{
  if(combined.aborted)throw Error('Transcrição cancelada.');dir=await mkdtemp(path.join(existsSync('/dev/shm')?'/dev/shm':tmpdir(),'companheiro-voz-'));const file=path.join(dir,'audio.wav'),out=path.join(dir,'result');await writeFile(file,buffer,{mode:0o600});
  await new Promise((resolve,reject)=>{const child=spawn(voiceDir+'whisper.cpp-1.5.5/main',['-m',voiceDir+'ggml-base-q5_1.bin','-f',file,'-l','pt','-t','4','-nt','-np','-otxt','-of',out],{stdio:'ignore'});const cancel=()=>{child.kill('SIGTERM');};combined.addEventListener('abort',cancel,{once:true});if(combined.aborted)cancel();child.once('error',error=>{combined.removeEventListener('abort',cancel);reject(error);});child.once('close',code=>{combined.removeEventListener('abort',cancel);if(combined.aborted)reject(Error('Transcrição cancelada.'));else if(code!==0)reject(Error('Não consegui entender esse áudio. Tente novamente ou digite.'));else resolve();});});
  const text=(await readFile(out+'.txt','utf8')).trim().replace(/\s+/g,' ');return text.length<=2000&&!/^\[.*\]$/.test(text)?text:'';
 }finally{if(dir)await rm(dir,{recursive:true,force:true});if(active===controller)active=null;}
}
export async function voiceApi(req,res){
 const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(host)||req.method!=='POST'||req.headers.origin!=='http://'+host||!req.headers['content-type']?.startsWith('application/octet-stream')){res.writeHead(403);res.end();return;}
 const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>384044)throw Error('Áudio muito longo.');chunks.push(chunk);}const text=await transcribeWav(Buffer.concat(chunks),controller.signal);if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({text}));}}
 catch{if(!res.destroyed){res.writeHead(422,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Não consegui entender. Tente falar de novo ou digite.'}));}}
}
