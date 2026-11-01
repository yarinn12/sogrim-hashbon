import {bitProfileAvailable,loadOwnBitProfile,saveOwnBitProfile} from './data/bitProfileStore.mjs';
import {normalizeBitReceivingUrl} from './domain/bitProfile.mjs';

const messages={BIT_QR_TYPE:'צריך לבחור תמונת PNG, JPG או WebP.',BIT_QR_SIZE:'התמונה גדולה מדי. בחר צילום מסך קטן יותר.',
  BIT_QR_NOT_FOUND:'לא מצאנו QR בתמונה. נסה צילום ברור שבו כל הקוד מופיע.',
  BIT_QR_URL:'זה אינו קוד אישי לקבלת כסף ב־Bit. בחר את קוד ה־QR האישי שלך.',
  BIT_CONFLICT:'פרטי Bit השתנו במכשיר אחר. רענן את הנתונים לפני שמירה נוספת.',
  BIT_AUTH:'החיבור לחשבון הסתיים. התחבר שוב כדי לשמור את פרטי Bit.'};

// Request ownership is separate from profile identity edits and financial state.
export function createBitProfileController({getConfig,getScope=()=>'',readImage,
  load=loadOwnBitProfile,save=saveOwnBitProfile,changed=()=>{}}){
  let owner='',generation=0,cancelReader;
  let state=empty(false);
  function empty(enabled){return {enabled,profile:null,draft:undefined,busy:'',error:'',notice:'',needsReload:false};}
  function key(){const config=getConfig();return bitProfileAvailable(config)?`${config.storage.url}|${config.storage.account.userId}|${getScope()}`:'';}
  function configure(){
    const current=key();
    if(current!==owner){generation++;cancelReader?.();cancelReader=undefined;owner=current;state=empty(Boolean(current));}
    return current;
  }
  function capture(){
    configure();
    const config=getConfig();
    return {owner,generation:++generation,config:{...config,storage:{...config.storage,account:{...config.storage?.account}}}};
  }
  const current=request=>request.owner===key()&&request.owner===owner&&request.generation===generation;
  const emit=()=>changed();
  async function refresh(){
    configure();if(!owner||state.busy)return;
    const request=capture();state={...state,busy:'load',error:'',notice:''};emit();
    try{const profile=await load(request.config);if(current(request))state={...state,profile,draft:undefined,needsReload:false};}
    catch(error){if(current(request))state={...state,error:messages[error.code]??'לא הצלחנו לטעון את פרטי Bit. אפשר לנסות שוב.',needsReload:true};}
    finally{if(current(request)){state={...state,busy:''};emit();}}
  }
  async function choose(fileOrPicker,expectedOwner){
    configure();if(!owner||state.busy||!state.profile||state.needsReload||(expectedOwner&&expectedOwner!==owner))return;
    const request=capture();state={...state,busy:'read',error:'',notice:''};emit();
    try{
      const file=typeof fileOrPicker==='function'?await fileOrPicker():fileOrPicker;
      if(!current(request)||!file)return;
      state={...state,draft:undefined};emit();
      const task=readImage(file);cancelReader=task.cancel;
      const url=normalizeBitReceivingUrl(await task.promise);
      if(current(request))state={...state,draft:url,notice:'קוד Bit אישי זוהה. לחץ על „שמור קיצור Bit” כדי לשמור בחשבון.'};
    }catch(error){if(current(request)&&error.code!=='BIT_QR_CANCELLED')state={...state,error:messages[error.code]??'לא הצלחנו לקרוא את התמונה. אפשר לבחור צילום מסך אחר.'};}
    finally{if(current(request)){cancelReader=undefined;state={...state,busy:''};emit();}}
  }
  async function commit(remove=false){
    configure();if(!owner||state.busy||!state.profile||state.needsReload||(!remove&&state.draft===undefined))return;
    const request=capture(),url=remove?null:state.draft,expectedRevision=state.profile.revision;
    state={...state,busy:'save',error:'',notice:''};emit();
    try{
      const profile=await save(request.config,{url,expectedRevision});
      if(current(request))state={...state,profile,draft:undefined,needsReload:false,
        notice:remove?'קיצור Bit הוסר מהחשבון.':'קיצור Bit נשמר בחשבון.'};
    }catch(error){if(current(request))state={...state,needsReload:true,error:messages[error.code]??'לא הצלחנו לאשר שהשינוי נשמר. רענן כדי לבדוק מה נשמר בחשבון.'};}
    finally{if(current(request)){state={...state,busy:''};emit();}}
  }
  return {state(){configure();return {...state};},owner(){return configure();},refresh,choose,
    save:()=>commit(false),remove:()=>commit(true),
    leave(){generation++;cancelReader?.();cancelReader=undefined;state=empty(Boolean(owner));}};
}
