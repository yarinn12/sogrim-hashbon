import {createHash} from 'node:crypto';
import {openSync,readSync,closeSync} from 'node:fs';

// SDK system images can exceed readFileSync's 2GiB limit. Hash their exact bytes
// with bounded memory, preserving the complete file inventory and drift checks.
export function sha256File(path) {
  const digest=createHash('sha256'), chunk=Buffer.allocUnsafe(1024*1024);
  const descriptor=openSync(path,'r');
  try {
    let count;
    while((count=readSync(descriptor,chunk,0,chunk.length,null))>0)digest.update(chunk.subarray(0,count));
    return digest.digest('hex');
  } finally {closeSync(descriptor);}
}
