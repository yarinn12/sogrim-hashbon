import {createBitProfileController} from './bitProfileController.mjs';
import {readBitQrImage} from './data/bitQrImage.mjs';
import {renderBitProfileView} from './ui/bitProfilePresentation.mjs';

export function createBitProfileFeature({getConfig,getScope}){
  let host=null;
  const controller=createBitProfileController({getConfig,getScope,readImage:readBitQrImage,changed:render});
  function render(){
    if(!host?.isConnected)return;
    host.innerHTML=renderBitProfileView(controller.state());
    const input=host.querySelector('[data-bit-file]');
    let selectionOwner='';
    host.querySelector('[data-bit-action="choose"]')?.addEventListener('click',()=>{
      const gallery=globalThis.SogrimNative?.gallery;
      if(gallery?.available)controller.choose(()=>gallery.pickPhoto());
      else{selectionOwner=controller.owner();input.click();}
    });
    input?.addEventListener('change',()=>{
      const file=input.files?.[0];if(file)controller.choose(file,selectionOwner);input.value='';
    });
    host.querySelector('[data-bit-action="save"]')?.addEventListener('click',()=>controller.save());
    host.querySelector('[data-bit-action="remove"]')?.addEventListener('click',()=>controller.remove());
    host.querySelector('[data-bit-action="refresh"]')?.addEventListener('click',()=>controller.refresh());
  }
  return {
    mount(element){
      if(!element){this.unmount();return;}
      const entering=host===null;host=element;render();
      const state=controller.state();
      if(state.enabled&&!state.busy&&(entering||!state.profile)&&!state.error)controller.refresh();
    },
    unmount(){if(host){host=null;controller.leave();}}
  };
}
