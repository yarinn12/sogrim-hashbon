import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Auth93's actual bootstatus returned zero after terminal Data Migration Failed.
// A process exit alone is not proof that the owned guest finished preparation.
export function verifyBootTranscript(bytes,udid){
 assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1_000_000,'Missing or oversized simulator boot transcript');
 assert.match(udid,/^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/);
 const text=bytes.toString('utf8'),lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const headers=lines.filter(line=>line.startsWith('Monitoring boot status for '));
 assert.equal(headers.length,1,'Expected one owned simulator boot monitor');
 assert(headers[0].endsWith(' ('+udid+').'),'Boot transcript belongs to another simulator');
 assert(!/Data Migration Failed/i.test(text),'Simulator data migration failed before native measurement');
 const states=[...text.matchAll(/\bStatus=(\d+), isTerminal=(YES|NO),/g)].map(m=>({status:m[1],terminal:m[2]}));
 assert(states.length>0,'Missing simulator boot states');
 assert(states.every(s=>['1','2','4','4294967295'].includes(s.status)),'Unknown or failed simulator boot state');
 const terminals=states.filter(s=>s.terminal==='YES');
 assert.equal(terminals.length,1,'Missing or duplicate terminal simulator boot state');
 assert.equal(states.at(-1),terminals[0],'Simulator boot continued after its terminal state');
 // This is the actual successful final marker retained from Auth91. Status 4
 // is still nonterminal (system-app preparation); it is not a success marker.
 assert.equal(terminals[0].status,'4294967295','Simulator boot did not finish');
 assert.equal(lines.at(-1),'Finished','Truncated or unfinished simulator boot transcript');
 return{scope:'OWNED_IOS_SIMULATOR_BOOT_ONLY',ready:true,transcriptSha256:createHash('sha256').update(bytes).digest('hex'),transcriptBytes:bytes.length,nativeAuthenticationPassed:false};
}

export function main(argv=process.argv.slice(2)){
 assert.equal(argv.length,4);assert.equal(argv[0],'--log');assert.equal(argv[2],'--udid');
 const file=resolve(argv[1]),stat=lstatSync(file);
 assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=1_000_000,'Expected a regular bounded boot transcript');
 const receipt=verifyBootTranscript(readFileSync(file),argv[3]);console.log(JSON.stringify(receipt));return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
