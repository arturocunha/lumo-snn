import {Brain,validateProfile,type Profile} from './core.js';
export interface ChatMessage {user:boolean;text:string}
export interface Friend {id:string;name:string;brain:Profile;messages:ChatMessage[]}
export interface FriendsData {version:1;revision:number;active:string|null;friends:Friend[];migratedFriend?:string}
export const maxFriends=3;
export const friendsLimitMessage='Para criar outro, apague um dos amigos existentes.';
export const friendsKey='companheiro.friends.v1';
export const handoffKey='companheiro.preview.legacy-session.v1';
interface LocalStore {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
function friendName(value:unknown){if(typeof value!=='string'||!value.trim()||Array.from(value.trim()).length>32||/[\u0000-\u001f\u007f]/.test(value))throw Error('Use um nome de 1 a 32 caracteres.');return value.trim().replace(/\s+/g,' ');}
export function validFriends(value:unknown):FriendsData {
 const data=value as FriendsData;
 if(!data||data.version!==1||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.friends)||!(data.active===null||typeof data.active==='string'))throw Error('Dados de amigos inválidos. Nada foi substituído.');
 const ids=new Set();for(const friend of data.friends){if(!friend||typeof friend.id!=='string'||!friend.id||ids.has(friend.id))throw Error('Amigo inválido');ids.add(friend.id);friendName(friend.name);validateProfile(friend.brain);if(!Array.isArray(friend.messages)||friend.messages.some(m=>!m||typeof m.user!=='boolean'||typeof m.text!=='string'||m.text.length>10000))throw Error('Conversa inválida');}
 if(data.active!==null&&!ids.has(data.active))throw Error('Amigo atual inválido');
 return JSON.parse(JSON.stringify(data));
}
export class FriendsStore {
 private data:FriendsData;private expected:string|null;readonly migration:string;
 constructor(private storage:LocalStore,legacyName='Companheiro',seed?:Profile){
  this.expected=storage.getItem(friendsKey);
  if(this.expected!==null){this.data=validFriends(JSON.parse(this.expected));this.migration='';return;}
  const handoff=storage.getItem(handoffKey);let messages:ChatMessage[]=[];
  if(handoff){const old=JSON.parse(handoff);seed=validateProfile(old.brain);messages=old.messages??[];if(old.name)legacyName=friendName(old.name);}
  const friend:Friend={id:this.id(),name:friendName(legacyName),brain:seed??new Brain().snapshot(),messages};
  this.data=validFriends({version:1,revision:0,active:friend.id,friends:[friend],...(handoff?{migratedFriend:friend.id}:{})});
  // A fonte legada é mantida; backup único antes da primeira migração.
  const legacy=storage.getItem('companheiro.preview.preferences.v1');
  if(legacy&&storage.getItem('companheiro.backup.preferences.v1')===null)storage.setItem('companheiro.backup.preferences.v1',legacy);
  if(handoff&&storage.getItem('companheiro.backup.legacy-session.v1')===null)storage.setItem('companheiro.backup.legacy-session.v1',handoff);
  this.migration=handoff?'Amigo anterior e aprendizado importados.':legacy?'Nome anterior preservado. A versão anterior mantinha pesos apenas em memória; eles só podem ser importados antes de recarregar a aba.':'';
  this.commit(this.data);
 }
 private id(){return globalThis.crypto?.randomUUID?.()??`amigo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}
 snapshot(){return validFriends(this.data);}
 current(){const friend=this.data.friends.find(f=>f.id===this.data.active);return friend?JSON.parse(JSON.stringify(friend)) as Friend:null;}
 private commit(data:FriendsData){
  if(this.storage.getItem(friendsKey)!==this.expected)throw Error('Os amigos foram alterados em outra aba. Reabra esta página antes de continuar.');
  const next=validFriends({...data,revision:this.data.revision+1});const text=JSON.stringify(next);this.storage.setItem(friendsKey,text);this.expected=text;this.data=next;
 }
 create(name:string){if(this.data.friends.length>=maxFriends)throw Error(friendsLimitMessage);const next=this.snapshot();const friend={id:this.id(),name:friendName(name),brain:new Brain().snapshot(),messages:[]};next.friends.push(friend);next.active=friend.id;this.commit(next);return this.current()!;}
 select(id:string){if(!this.data.friends.some(f=>f.id===id))throw Error('Amigo não encontrado');this.commit({...this.snapshot(),active:id});}
 rename(name:string){const next=this.snapshot(),friend=next.friends.find(f=>f.id===next.active);if(!friend)throw Error('Crie um amigo primeiro');friend.name=friendName(name);this.commit(next);}
 save(brain:Profile,messages:ChatMessage[]){const next=this.snapshot(),friend=next.friends.find(f=>f.id===next.active);if(!friend)throw Error('Nenhum amigo selecionado');friend.brain=validateProfile(brain);friend.messages=messages.map(m=>({...m}));this.commit(next);}
 delete(id:string,confirmed:boolean){if(!confirmed)return false;const next=this.snapshot();if(!next.friends.some(f=>f.id===id))throw Error('Amigo não encontrado');if(next.migratedFriend===id){this.storage.removeItem(handoffKey);this.storage.removeItem('companheiro.backup.legacy-session.v1');delete next.migratedFriend;}next.friends=next.friends.filter(f=>f.id!==id);if(next.active===id)next.active=next.friends[0]?.id??null;this.commit(next);return true;}
}
