// Retry observations only. Never retry a Native input action or accept a
// nonzero dump result, even if stdout claims a file was written.
export async function observeFreshWebViewBounds({dump,read,delay,packageName,onAttempt=()=>{},makePath=attempt=>`/sdcard/qa-native-window-${Date.now()}-${attempt}.xml`,maxAttempts=3}){
  const attempts=[];
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const path=makePath(attempt),record={attempt,path,ok:false};
    try{
      const stdout=await dump(path);
      if(!/dumped to/i.test(stdout)||!stdout.includes(path))throw new Error('UI dump did not report the new unique path');
      const xml=await read(path);
      if(!xml.includes('<hierarchy'))throw new Error('Malformed Native UI hierarchy');
      const tag=[...xml.matchAll(/<node[^>]*class="android\.webkit\.WebView"[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`package="${packageName}"`));
      const bounds=tag?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if(!bounds||+bounds[3]<=+bounds[1]||+bounds[4]<=+bounds[2])throw new Error('Current QA WebView bounds are missing or invalid');
      record.ok=true;attempts.push(record);onAttempt(record);return {bounds:bounds.slice(1).map(Number),attempts};
    }catch(error){record.error=error.message;attempts.push(record);onAttempt(record);if(attempt<maxAttempts)await delay(200);}
  }
  throw new Error('Fresh Native observation failed before any input: '+JSON.stringify(attempts));
}
