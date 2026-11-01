/* Local jsQR 1.4.0, Apache-2.0: see vendor/jsQR-LICENSE.txt. */
importScripts('./vendor/jsQR.js');
self.onmessage = ({data}) => {
  const {buffer,width,height} = data ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<=0 || height<=0 ||
      width*height>3240000 || !(buffer instanceof ArrayBuffer) || buffer.byteLength!==width*height*4) {
    self.postMessage({text:null}); return;
  }
  const result=jsQR(new Uint8ClampedArray(buffer),width,height,{inversionAttempts:'attemptBoth'});
  self.postMessage({text:result?.data ?? null});
};
