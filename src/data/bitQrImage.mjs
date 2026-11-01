import {normalizeBitReceivingUrl,validateBitQrFile} from '../domain/bitProfile.mjs';

// This reader has no upload or persistence path. Worker and decoder are bundled.
export function readBitQrImage(file){
  let worker,bitmap,timer,finished=false,rejectPending;
  const cleanup=()=>{clearTimeout(timer);worker?.terminate();bitmap?.close();bitmap=undefined;};
  const promise=new Promise((resolve,reject)=>{
    rejectPending=reject;
    timer=setTimeout(()=>{if(!finished){finished=true;cleanup();reject(Object.assign(new Error('QR timeout'),{code:'BIT_QR_TIMEOUT'}));}},20000);
    (async()=>{
      validateBitQrFile(file);
      bitmap=await createImageBitmap(file);
      if(finished){cleanup();return;}
      if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>32000000)throw Object.assign(new Error('Image too large'),{code:'BIT_QR_SIZE'});
      const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);bitmap.close();bitmap=undefined;
      worker=new Worker(new URL('./assets/bit/qr-worker.js',document.baseURI));
      worker.onmessage=event=>{
        if(finished)return;finished=true;cleanup();
        try{if(!event.data?.text)throw Object.assign(new Error('QR not found'),{code:'BIT_QR_NOT_FOUND'});resolve(normalizeBitReceivingUrl(event.data.text));}
        catch(error){reject(error);}
      };
      worker.onerror=()=>{if(!finished){finished=true;cleanup();reject(Object.assign(new Error('QR reader unavailable'),{code:'BIT_QR_READER'}));}};
      worker.postMessage({buffer:pixels.data.buffer,width:pixels.width,height:pixels.height},[pixels.data.buffer]);
    })().catch(error=>{if(!finished){finished=true;cleanup();reject(error);}});
  });
  return {promise,cancel(){if(!finished){finished=true;cleanup();rejectPending(Object.assign(new Error('Cancelled'),{code:'BIT_QR_CANCELLED'}));}}};
}
