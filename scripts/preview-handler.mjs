import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const previewVersion='snn-20261101-04';
export const previewRoot=fileURLToPath(new URL('../',import.meta.url));
export function previewHtml(){return readFileSync(previewRoot+'ui/index.html','utf8').replace('/* STYLE */',()=>readFileSync(previewRoot+'ui/style.css','utf8')).replace('/* SCRIPT */',()=>readFileSync(previewRoot+'dist/browser.js','utf8'));}
export function previewHandler(request,response){
 const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Companheiro-Version':previewVersion};
 let pathname;try{pathname=new URL(request.url,'http://127.0.0.1').pathname;}catch{response.writeHead(400,headers);response.end('Endereço inválido');return;}
 if(!['GET','HEAD'].includes(request.method??'GET')){response.writeHead(405,{...headers,Allow:'GET, HEAD'});response.end();return;}
 if(pathname!=='/'&&pathname!=='/index.html'){response.writeHead(404,headers);response.end('Não encontrado');return;}
 try{const html=previewHtml();response.writeHead(200,headers);response.end(request.method==='HEAD'?undefined:html);}catch{response.writeHead(500,headers);response.end('Não foi possível carregar a interface. Confira a compilação local.');}
}
