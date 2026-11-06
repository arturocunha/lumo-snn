import test from 'node:test';import assert from 'node:assert/strict';
import {VoiceSegmenter,encodePcmWav} from '../dist/voice.js';import {validateWav,transcribeWav} from '../scripts/voice-local.mjs';
test('silêncio não gera pedidos; fala baixa com pausa produz WAV 16k válido',()=>{
 const emitted=[],segmenter=new VoiceSegmenter(48000,wav=>emitted.push(wav));for(let i=0;i<100;i++)segmenter.push(new Float32Array(4800));assert.equal(emitted.length,0);for(let i=0;i<8;i++)segmenter.push(new Float32Array(4800).fill(.012));for(let i=0;i<8;i++)segmenter.push(new Float32Array(4800));assert.equal(emitted.length,1);const wav=Buffer.from(emitted[0]);assert.doesNotThrow(()=>validateWav(wav));assert.equal(wav.readUInt32LE(24),16000);
});
test('reset limpa fala parcial e áudio longo é limitado em blocos curtos',()=>{
 const emitted=[],segmenter=new VoiceSegmenter(16000,wav=>emitted.push(wav));for(let i=0;i<4;i++)segmenter.push(new Float32Array(1600).fill(.1));segmenter.reset();for(let i=0;i<10;i++)segmenter.push(new Float32Array(1600));assert.equal(emitted.length,0);for(let i=0;i<110;i++)segmenter.push(new Float32Array(1600).fill(.1));assert.equal(emitted.length,1);assert.ok(emitted[0].byteLength<=384044);
});
test('encoder limita amplitude e cabeçalho inválido é rejeitado antes do executor',async()=>{
 const wav=Buffer.from(encodePcmWav(new Float32Array(16000).fill(2),16000));assert.equal(wav.readInt16LE(44),32767);assert.doesNotThrow(()=>validateWav(wav));const bad=Buffer.from(wav);bad.writeUInt32LE(44100,24);assert.throws(()=>validateWav(bad));await assert.rejects(transcribeWav(bad,new AbortController().signal));assert.throws(()=>encodePcmWav(new Float32Array(10),0));
});
