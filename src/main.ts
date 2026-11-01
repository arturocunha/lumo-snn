import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import WebKit from 'gi://WebKit2?version=4.1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Brain,contexts,actions,profileName,validateUrl,executeUrl} from './core.js';
import {Pet} from './pet.js';

const decoder=new TextDecoder(), encoder=new TextEncoder();
function read(path:string){const [ok,data]=GLib.file_get_contents(path);if(!ok)throw Error(`Não foi possível ler ${path}`);return decoder.decode(data);}
const root=GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const pi=ARGV.indexOf('--perfil');const profile=profileName(pi>=0?ARGV[pi+1]??'':'primeiro');
const check=ARGV.includes('--verificar');
const dir=GLib.build_filenamev([GLib.get_user_data_dir(),'companheiro-snn',profile]);
const path=dir+'/brain.json';
const app=new Gtk.Application({application_id:'io.local.Companheiro.p'+GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256,profile,-1).slice(0,24),flags:Gio.ApplicationFlags.FLAGS_NONE});
let win:any=null,view:any=null,pet:Pet|null=null,brain:Brain,context=Object.keys(contexts)[0],url='https://www.python.org/',executed=false;
let feedbackText='Seu companheiro começa sem histórico pessoal.',lastError='';
function atomic(file:string,text:string){Gio.File.new_for_path(file).replace_contents(encoder.encode(text),null,false,Gio.FileCreateFlags.PRIVATE|Gio.FileCreateFlags.REPLACE_DESTINATION,null);}
function save(){
 GLib.mkdir_with_parents(dir,0o700);
 if(GLib.file_test(path,GLib.FileTest.EXISTS)&&!GLib.file_test(dir+'/brain.pre-typescript.json',GLib.FileTest.EXISTS))atomic(dir+'/brain.pre-typescript.json',read(path));
 atomic(path,JSON.stringify(brain.snapshot(),null,2));
}
function state(){return {profile,context,contexts:Object.keys(contexts),url,decision:brain.pending,weights:brain.weights,updates:brain.updates,evidence:brain.evidence,pet:!!pet,feedback:feedbackText,error:lastError};}
function send(){if(view)view.run_javascript(`window.receiveState(${JSON.stringify(state()).replace(/</g,'\\u003c')})`,null,null);}
function confirmUrl(){
 if(!brain.pending||brain.pending.effective!==2||executed)throw Error('Avalie o contexto antes de abrir uma página.');
 const exact=validateUrl(url);
 const dialog=new Gtk.MessageDialog({transient_for:win,modal:true,message_type:Gtk.MessageType.QUESTION,buttons:Gtk.ButtonsType.YES_NO,text:'Abrir esta página no navegador?',secondary_text:exact});
 const answer=dialog.run();dialog.destroy();
 if(answer===Gtk.ResponseType.YES){executeUrl(exact,true,value=>{if(!Gio.AppInfo.launch_default_for_uri(value,null))throw Error('O navegador não aceitou a solicitação.');});executed=true;feedbackText='Solicitação enviada ao navegador. Isso não comprova o resultado da página.';}
 else feedbackText='Abertura cancelada. Nenhuma página foi aberta.';
}
function handle(raw:string){
 try{
  const message=JSON.parse(raw);lastError='';
  if(!message||typeof message!=='object'||typeof message.type!=='string')throw Error('Mensagem inválida');
  const before=brain.snapshot(),pending=brain.pending;
  try{
   switch(message.type){
    case 'ready':break;
    case 'context':if(typeof message.context!=='string'||!Object.hasOwn(contexts,message.context))throw Error('Contexto inválido');context=message.context;brain.pending=null;feedbackText='Contexto alterado. Avalie quando quiser.';break;
    case 'evaluate':url=validateUrl(message.url);brain.decide(context);executed=false;feedbackText='Escolha calculada pela SNN. Nenhuma ferramenta foi executada.';break;
    case 'feedback':if(message.reward!==1&&message.reward!==-1)throw Error('Feedback inválido');brain.feedback(message.reward);save();feedbackText='Feedback salvo. Os pesos mudaram; avalie novamente para observar a escolha.';break;
    case 'teach':brain.teach(context,message.target);save();feedbackText='Exemplo ensinado. Não conta como resultado positivo nem como decisão espontânea.';break;
    case 'open':confirmUrl();break;
    case 'pet':if(pet){pet.close();}else{pet=new Pet(()=>{pet=null;send();});}break;
    default:throw Error('Comando não disponível');
   }
  }catch(error){brain=new Brain(before);brain.pending=pending;throw error;}
 }catch(error){lastError=String(error);}
 send();
}
app.connect('activate',()=>{
 if(win){win.present();return;}
 try{brain=new Brain(GLib.file_test(path,GLib.FileTest.EXISTS)?JSON.parse(read(path)):undefined);}
 catch(error){printerr(String(error));app.quit();return;}
 win=new Gtk.ApplicationWindow({application:app,title:'Companheiro · seu espaço',default_width:1120,default_height:830});
 win.set_size_request(840,700);
 const manager=new WebKit.UserContentManager();manager.register_script_message_handler('desktop');
 manager.connect('script-message-received::desktop',(_:any,result:any)=>handle(result.get_js_value().to_string()));
 view=new WebKit.WebView({user_content_manager:manager,web_context:WebKit.WebContext.new_ephemeral()});
 view.get_settings().enable_developer_extras=check;
 view.connect('context-menu',()=>true);
 view.connect('create',()=>null);
 view.connect('decide-policy',(_:any,decision:any,type:number)=>{if(type===WebKit.PolicyDecisionType.NAVIGATION_ACTION){const target=decision.get_navigation_action().get_request().get_uri();if(target!=='about:blank'&&!target.startsWith('file://'+root+'/ui/index.html')){decision.ignore();return true;}}return false;});
 view.connect('console-message',(_:any,message:string)=>{printerr(message);return false;});
 win.add(view);
 let html=read(root+'/ui/index.html');html=html.replace('/* STYLE */',read(root+'/ui/style.css')).replace('/* SCRIPT */',read(root+'/dist/ui.js'));
 view.load_html(html,'file://'+root+'/ui/index.html');
 win.connect('destroy',()=>{pet?.close();pet=null;app.quit();});
 win.show_all();
 if(check){
  view.connect('load-changed',(_:any,event:number)=>{if(event===WebKit.LoadEvent.FINISHED){
   print('Painel WebKit carregado; perfil='+profile);
   GLib.timeout_add(GLib.PRIORITY_DEFAULT,600,()=>{pet=new Pet(()=>{pet=null;});send();
    view.run_javascript('JSON.stringify({title:document.title,buttons:document.querySelectorAll("button").length,body:document.body.innerText.includes("Seu companheiro"),bridge:typeof window.receiveState})',null,(web:any,result:any)=>{try{print('VERIFICACAO_UI '+web.run_javascript_finish(result).get_js_value().to_string());}catch(e){printerr(String(e));}});
    GLib.timeout_add(GLib.PRIORITY_DEFAULT,1800,()=>{win.destroy();return false;});return false;
   });
  }});
 }
});
app.run([]);
