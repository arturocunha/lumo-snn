/** Dados de apresentação apenas: sem SNN, API, voz ou ação nativa. */
interface PreviewPreferences {name:string;theme:'light'|'dark'}
const preferenceKey='companheiro.preview.preferences.v1';
function cleanName(value:unknown):string{
 if(typeof value!=='string')throw Error('Escolha um nome para o companheiro.');
 const name=value.trim().replace(/\s+/g,' ');
 if(!name||Array.from(name).length>32||/[\u0000-\u001f\u007f]/.test(name))throw Error('Use um nome de 1 a 32 caracteres.');
 return name;
}
function loadPreferences():PreviewPreferences{
 const defaults:PreviewPreferences={name:'Companheiro',theme:'light'};
 try{const value=JSON.parse(localStorage.getItem(preferenceKey)??'null');if(value&&typeof value==='object'){defaults.name=cleanName(value.name);if(value.theme==='dark'||value.theme==='light')defaults.theme=value.theme;}}catch{}
 return defaults;
}
function savePreferences(preferences:PreviewPreferences):boolean{
 try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));return true;}catch{return false;}
}
const decisionExamples=[
 {choice:0,title:'Aguardar',description:'Dar espaço enquanto você se concentra.',situation:'Você está ocupado.',icon:'◌'},
 {choice:1,title:'Perguntar',description:'Entender se você quer ajuda antes de interromper.',situation:'Você está organizando seu dia.',icon:'?'},
 {choice:2,title:'Sugerir uma página',description:'Propor uma referência e aguardar sua confirmação.',situation:'Uma página poderia ilustrar a conversa.',icon:'↗'},
];
const illustrativeWeights=[[.25,.18,.12,.33,.21,.4],[.14,.35,.21,.2,.42,.18],[.22,.3,.4,.12,.26,.09]];
