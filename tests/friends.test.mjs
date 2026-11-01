import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsStore,friendsKey,handoffKey} from '../dist/friends.js';
import {Brain} from '../dist/core.js';
function storage(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('criar e selecionar mantém pesos, evidências e conversa separados após recarregar',()=>{
 const s=storage(),store=new FriendsStore(s,'Luna'),first=store.current();const brain=new Brain(first.brain);brain.decide('Pedido de ajuda');brain.feedback(1);store.save(brain.snapshot(),[{user:true,text:'Oi Luna'}]);
 const other=store.create('Sol');assert.deepEqual(other.messages,[]);assert.equal(other.brain.updates,0);assert.notDeepEqual(other.brain.weights,brain.weights);store.select(first.id);assert.deepEqual(store.current().brain,brain.snapshot());assert.equal(store.current().messages[0].text,'Oi Luna');
 const restored=new FriendsStore(s);assert.equal(restored.current().name,'Luna');assert.deepEqual(restored.current().brain,brain.snapshot());assert.equal(restored.snapshot().friends.length,2);
});
test('cancelar exclusão é inerte; apagar só o alvo; último amigo permanece vazio ao reabrir',()=>{
 const s=storage(),store=new FriendsStore(s),first=store.current();store.create('Outro');s.setItem('companheiro.preview.preferences.v1',JSON.stringify({theme:'dark'}));const before=s.getItem(friendsKey);assert.equal(store.delete(first.id,false),false);assert.equal(s.getItem(friendsKey),before);store.delete(first.id,true);assert.equal(store.snapshot().friends.length,1);const last=store.current();store.delete(last.id,true);assert.equal(store.current(),null);assert.equal(new FriendsStore(s).current(),null);assert.equal(JSON.parse(s.getItem('companheiro.preview.preferences.v1')).theme,'dark');store.create('Novo começo');assert.equal(store.current().brain.updates,0);
});
test('migração importa nome, aprendizado e conversa explícitos e preserva fonte até exclusão',()=>{
 const s=storage(),b=new Brain();b.teach('Pedido de ajuda',1);s.setItem('companheiro.preview.preferences.v1','{"name":"Aurora","theme":"dark"}');s.setItem(handoffKey,JSON.stringify({name:'Aurora',brain:b.snapshot(),messages:[{user:false,text:'Olá'}]}));const store=new FriendsStore(s,'Aurora');assert.deepEqual(store.current().brain,b.snapshot());assert.equal(store.current().messages.length,1);assert.ok(s.getItem('companheiro.backup.legacy-session.v1'));store.delete(store.current().id,true);assert.equal(s.getItem(handoffKey),null);assert.equal(s.getItem('companheiro.backup.legacy-session.v1'),null);assert.ok(s.getItem('companheiro.preview.preferences.v1'));
});
test('dados corrompidos bloqueiam abertura e permanecem intactos',()=>{
 for(const raw of ['{quebrado','{"version":9}','{"version":1,"revision":0,"active":"ausente","friends":[]}']){const s=storage();s.setItem(friendsKey,raw);assert.throws(()=>new FriendsStore(s));assert.equal(s.getItem(friendsKey),raw);}
});
test('falha de gravação não aplica criação ou exclusão só em memória',()=>{
 const s=storage(),store=new FriendsStore(s);const original=store.snapshot();s.setItem=()=>{throw Error('quota');};assert.throws(()=>store.create('Não salvo'));assert.deepEqual(store.snapshot(),original);assert.throws(()=>store.delete(original.active,true));assert.deepEqual(store.snapshot(),original);
});
test('outra aba não pode sobrescrever revisão mais recente',()=>{
 const s=storage(),first=new FriendsStore(s),second=new FriendsStore(s);first.create('Novo');assert.throws(()=>second.create('Antigo'),/outra aba/);assert.equal(new FriendsStore(s).snapshot().friends.length,2);
});
