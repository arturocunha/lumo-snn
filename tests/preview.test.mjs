import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
class Element{
 constructor(){this.children=[];this.options=[];this.value='';this.textContent='';this.hidden=false;this.handlers={};this.classList={toggle(){}};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(){}add(option){this.options.push(option);}addEventListener(name,fn){this.handlers[name]=fn;}remove(){}
}
function preview(){
 const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),createElementNS:()=>new Element(),querySelector:()=>null,body:new Element()};
 for(const match of readFileSync('ui/index.html','utf8').matchAll(/id="([^"]+)"/g))document.getElementById(match[1]);
 const window={};const context=vm.createContext({window,document,Option:class{constructor(text,value){this.text=text;this.value=value;}},setTimeout:()=>0,console});
 vm.runInContext(readFileSync('dist/preview.js','utf8')+'\n'+readFileSync('dist/ui.js','utf8'),context);
 return {elements,document,window};
}
test('prévia inicia sem backend e identifica dados simulados',()=>{
 const {elements}=preview();assert.equal(elements.get('profile').textContent,'primeiro');assert.match(elements.get('status').textContent,/simuladas/);assert.equal(elements.get('context').options.length,4);assert.equal(elements.get('feedback').hidden,true);
});
test('avaliar e dar feedback alteram somente a demonstração',()=>{
 const {elements}=preview();elements.get('url').value='https://example.org';elements.get('evaluate').onclick();assert.equal(elements.get('choice').textContent,'Posso ajudar com isso?');assert.equal(elements.get('feedback').hidden,false);elements.get('good').onclick();assert.equal(elements.get('updates').textContent,'0');assert.match(elements.get('status').textContent,/Nenhum aprendizado/);
});
test('mensagem é inserida como texto e recebe resposta fixa identificada',()=>{
 const {elements}=preview();const input=elements.get('chat-text');input.value='<img src=x onerror=alert(1)>';elements.get('chat-form').handlers.submit({preventDefault(){}});const messages=elements.get('messages').children;assert.equal(messages[0].children[0].textContent,'<img src=x onerror=alert(1)>');assert.match(messages[1].children[1].textContent,/resposta fixa/);assert.equal(input.value,'');
});
test('personagem na página pode ser ocultado sem criar janela desktop',()=>{
 const {elements}=preview();elements.get('pet').onclick();assert.match(elements.get('pet').textContent,/Mostrar prévia/);
});
