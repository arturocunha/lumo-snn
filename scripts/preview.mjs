import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function html(){return readFileSync(root+'ui/index.html','utf8').replace('/* STYLE */',readFileSync(root+'ui/style.css','utf8')).replace('/* SCRIPT */',readFileSync(root+'dist/browser.js','utf8'));}
const port=Number(process.env.PORT||4173);
const server=http.createServer((request,response)=>{
 if(request.url!=='/'&&request.url!=='/index.html'){response.writeHead(404);response.end('Não encontrado');return;}
 response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});response.end(html());
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Prévia visual disponível em http://127.0.0.1:${port} — SNN local ao vivo; modelo de conversa desconectado.`));
