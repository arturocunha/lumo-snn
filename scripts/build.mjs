import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
let ts;
for(const path of ['typescript',process.env.TYPESCRIPT_PATH,'/usr/share/code/resources/app/extensions/node_modules/typescript/lib/typescript.js'].filter(Boolean)){
 try{ts=require(path);break;}catch{}
}
if(!ts)throw Error('Compilador não encontrado. Instale TypeScript como dependência de desenvolvimento ou defina TYPESCRIPT_PATH. A versão compilada pode ser executada sem ele.');
const config=ts.parseJsonConfigFileContent(JSON.parse(readFileSync('tsconfig.json','utf8')),ts.sys,'.');
const program=ts.createProgram(config.fileNames,config.options);
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));process.exit(1);}
program.emit();console.log(`TypeScript ${ts.version}: compilação concluída.`);
// Bundle local sem dependências: estes quatro módulos não têm importações dinâmicas.
const {writeFileSync}=await import('node:fs');
const browser=['reservoir','core','conversation','skills','live','friends','voice','preview','ui'].map(name=>readFileSync(`dist/${name}.js`,'utf8').replace(/^import .+ from ['"].+['"];?\r?$/gm,'').replace(/^export /gm,'')).join('\n');
writeFileSync('dist/browser.js',browser);
