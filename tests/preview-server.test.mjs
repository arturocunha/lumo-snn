import test from 'node:test';
import assert from 'node:assert/strict';
import {previewHandler,previewVersion} from '../scripts/preview-handler.mjs';
function request(url,method='GET'){const result={};previewHandler({url,method},{writeHead(status,headers){result.status=status;result.headers=headers;},end(body){result.body=body;}});return result;}
test('URL com versão entrega o HTML, CSS e bundle atuais sem cache',()=>{
 const result=request('/?v='+previewVersion);assert.equal(result.status,200);assert.equal(result.headers['X-Companheiro-Version'],previewVersion);assert.match(result.headers['Cache-Control'],/no-store/);assert.ok(result.body.indexOf('id="name-form"')<result.body.indexOf('class="friend-section"'));assert.match(result.body,/class FriendsStore/);assert.match(result.body,/maxFriends = 3/);assert.equal(result.body.includes('/* SCRIPT */'),false);assert.equal(result.body.includes('/* STYLE */'),false);
});
test('parâmetro de versão mantém o mesmo caminho e armazenamento; não serve arquivos arbitrários',()=>{
 assert.equal(request('/index.html?v=qualquer').status,200);assert.equal(request('/src/friends.ts?v=qualquer').status,404);assert.equal(request('/?v=atual','HEAD').body,undefined);assert.equal(request('/','POST').status,405);
});
