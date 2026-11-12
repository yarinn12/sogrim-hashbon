// Synthetic negative control. The existing native scroll setter still runs;
// only the first write adds a covered line after the reader counted its rows.
export function coverAddedInstallationRowOnScroll(e) {
  const dialog=e.closest('.install-app-dialog'),descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
  Object.defineProperty(dialog,'scrollTop',{configurable:true,get(){return descriptor.get.call(this)},set(value){
    descriptor.set.call(this,value);
    if(window.__installAddedRow)return;
    window.__installAddedRow=true;
    const row=document.createElement('span');
    row.textContent='שורה חדשה שאסור להחמיץ';
    row.style.cssText='display:inline-block;position:relative;max-width:100%';
    const blocker=document.createElement('span');
    blocker.dataset.installNewRowBlocker='';
    blocker.style.cssText='position:absolute;inset:0;z-index:2147483647;pointer-events:auto';
    row.append(blocker);
    e.append(document.createElement('br'),row);
  }});
}
