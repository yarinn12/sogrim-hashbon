// Synthetic source-backed I/O model, not the actual bpftrace executable or BPF.
// v0.20.2: attached_probes uses endl; printf uses message(...,false). A separate
// -o ofstream keeps that short message buffered. stdout line mode flushes it.
import {openSync,writeSync,closeSync} from 'node:fs';
const args=process.argv.slice(2),at=args.indexOf('-o'),separate=at>=0;
const fd=separate?openSync(args[at+1],'a'):1;
writeSync(fd,'Attaching 4 probes...\n');
const ready='SOGRIM_PROFILE_READY 1234 999\n';
if(!separate)writeSync(fd,ready);
process.send({type:'ready-generated',model:'official0.20.2 TextOutput/file-stream semantics',separateFileStream:separate});
const timer=setTimeout(()=>process.exit(91),5000);
process.on('message',message=>{
  if(message!=='finish')return;
  clearTimeout(timer);if(separate)writeSync(fd,ready);writeSync(fd,'SOGRIM_PROFILE_STOPPED\n');if(separate)closeSync(fd);process.exit(0);
});
