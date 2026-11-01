import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({console});
vm.runInContext(readFileSync('dist/preview.js','utf8'),context);
const Session=vm.runInContext('MicrophoneSession',context);
function stream(){const handlers={};const track={readyState:'live',stopped:0,stop(){this.stopped++;this.readyState='ended';},addEventListener(type,fn){handlers[type]=fn;}};return {track,handlers,getTracks(){return [track];},getAudioTracks(){return [track];}};}
test('nenhum acesso antes de iniciar; inicia uma vez e encerra todos os tracks',async()=>{
 let calls=0;const audio=stream(),events=[];const session=new Session(async()=>{calls++;return audio;},(...event)=>events.push(event));assert.equal(calls,0);assert.equal(session.state,'off');const pending=session.start();await session.start();await pending;assert.equal(calls,1);assert.equal(session.state,'active');session.stop();assert.equal(audio.track.stopped,1);assert.equal(session.state,'off');session.stop();assert.equal(audio.track.stopped,1);
});
test('cancelamento durante permissão fecha stream que chegar depois',async()=>{
 let resolve;const audio=stream();const session=new Session(()=>new Promise(r=>resolve=r),()=>{});const pending=session.start();session.stop();resolve(audio);await pending;assert.equal(audio.track.stopped,1);assert.equal(session.state,'off');
});
test('permissão negada, dispositivo ausente e dispositivo ocupado retornam ao estado desligado',async()=>{
 for(const [name,expected]of [['NotAllowedError',/Permissão/],['NotFoundError',/Nenhum microfone/],['NotReadableError',/ocupado/]]){let error;const session=new Session(async()=>{throw {name};},(_,e)=>error=e);await session.start();assert.equal(session.state,'off');assert.match(error,expected);}
});
test('desconexão pelo navegador encerra sessão e libera o stream',async()=>{
 const audio=stream();let message;const session=new Session(async()=>audio,(_,error)=>message=error);await session.start();audio.handlers.ended();assert.equal(session.state,'off');assert.equal(audio.track.stopped,1);assert.match(message,/desconectado/);
});
test('stream sem áudio ativo é rejeitado e recursos são liberados',async()=>{
 const audio=stream();audio.getAudioTracks=()=>[];let message;const session=new Session(async()=>audio,(_,error)=>message=error);await session.start();assert.equal(session.state,'off');assert.equal(audio.track.stopped,1);assert.match(message,/microfone ativo/);
});
test('requisição antiga cancelada não substitui nova sessão',async()=>{
 let resolve;const old=stream(),current=stream();let calls=0;const session=new Session(()=>++calls===1?new Promise(r=>resolve=r):Promise.resolve(current),()=>{});const first=session.start();session.stop();await session.start();resolve(old);await first;assert.equal(old.track.stopped,1);assert.equal(current.track.stopped,0);assert.equal(session.state,'active');session.stop();assert.equal(current.track.stopped,1);
});
