import http from 'node:http';
import {previewHandler,previewRoot,previewVersion} from './preview-handler.mjs';
const port=Number(process.env.PORT||4173);
const server=http.createServer(previewHandler);
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Companheiro ${previewVersion}: http://127.0.0.1:${port}/?v=${previewVersion}\nPasta: ${previewRoot}`));
