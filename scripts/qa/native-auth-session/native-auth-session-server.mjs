import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const {createAppHandler}=await import(pathToFileURL(resolve(root,'server.mjs')));
const handler=createAppHandler({root,port:8765,env:{},serverRequestLogger:null});
createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1:8765');
  if(url.pathname==='/start'){
    const callback=new URL(url.searchParams.get('redirect_to'));
    callback.searchParams.set('code','fixture-system-session-code');
    if(process.env.PROBE_MODE==='legacy'){
      callback.protocol='http:';callback.hostname='127.0.0.1';callback.port='8765';
    }
    console.log('PROBE_HTTP_REDIRECT:'+JSON.stringify({mode:process.env.PROBE_MODE,path:callback.pathname,flowBound:callback.searchParams.get('auth_flow')?.length>=20,compatibility:callback.searchParams.get('native_auth_session')==='1'}));
    response.writeHead(302,{'Location':callback.href,'Cache-Control':'no-store'});response.end();return;
  }
  handler(request,response);
}).listen(8765,'127.0.0.1',()=>console.log('PROBE_HTTP_READY'));
