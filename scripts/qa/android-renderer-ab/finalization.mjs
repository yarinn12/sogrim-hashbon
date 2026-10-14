import assert from 'node:assert/strict';

// The original finisher can release its acknowledged host observer after the
// emulator exits. A still-live PID must pass the original identity checks; an
// absent PID is never adopted or replaced with another process.
export async function runOriginalTraceFinish({ownerAlive,verifyLiveOwner,finishOriginal}){
  if(ownerAlive)await verifyLiveOwner();
  return finishOriginal();
}

export async function finalizeAdbClosure({ownerReceipt,initializationAttempted,verifyAndClose,requirePortFree,onRecord}){
  const record={closed:false,ownershipConfirmed:Boolean(ownerReceipt),initializationAttempted};
  try{
    if(!ownerReceipt&&initializationAttempted){
      throw new Error('ADB initialization was attempted without an immutable owner receipt; closure is unconfirmed, no process was signalled');
    }
    if(ownerReceipt)await verifyAndClose(ownerReceipt);
    await requirePortFree();
    record.portFree=true;record.closed=true;return record;
  }catch(error){record.error=error.stack||String(error);throw error;}
  finally{onRecord(structuredClone(record));}
}
