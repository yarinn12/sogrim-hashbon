import {openSync,statSync} from 'node:fs';
export function profileCommand(tool,owner,_dataPath,programPath){
  // v0.20.2 -B controls stdout, not the separate -o ofstream. Let the owned
  // inherited stdout FD carry line-buffered READY and the same raw output.
  return [tool.tool,'-B','line','-kk','-p',String(owner.pid),programPath];
}
export function openProfileStdout(_output,dataPath){
  return openSync(dataPath,'a');
}
export function profileOutputIdentity(dataPath){
  const info=statSync(dataPath,{bigint:true});return {device:String(info.dev),inode:String(info.ino)};
}
