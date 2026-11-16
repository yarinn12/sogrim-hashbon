import test from 'node:test';
import assert from 'node:assert/strict';
import { coverAddedInstallationRowOnScroll } from '../e2e/helpers/installGuideNewRowControl.mjs';

// Real control callback at its DOM/scroll adapter boundary. The existing browser
// test separately verifies actual glyph hit testing during dialog movement.
function fixture() {
  const positions = new WeakMap();
  class Element {
    constructor(tag) { this.tagName=tag;this.children=[];this.dataset={};this.style={};this.parentElement=null; }
    append(...children) { for(let child of children){if(typeof child==='string')child={textContent:child,parentElement:null};child.parentElement=this;this.children.push(child);} }
    get lastChild() { return this.children.at(-1); }
    get textContent() { return this.children.map(child=>child.textContent).join(''); }
    set textContent(value) { this.children=[];this.append(value); }
    contains(node) { return node===this||this.children.some(child=>child===node||child.contains?.(node)); }
    get scrollTop() { return positions.get(this)||0; }
    set scrollTop(value) { positions.set(this,value); }
  }
  const body=new Element('body'),dialog=new Element('section'),description=new Element('p');
  body.append(dialog);dialog.append(description);description.append('תיאור ההתקנה המקורי');
  description.closest=()=>dialog;
  const document={body,createElement:tag=>new Element(tag),createRange:()=>({selectNodeContents(){},getBoundingClientRect:()=>({left:20,top:200,width:180,height:22})})};
  return{Element,document,window:{},dialog,description};
}

function run(callback) {
  const f=fixture(),original=Object.fromEntries(['Element','document','window'].map(name=>[name,globalThis[name]]));
  Object.assign(globalThis,{Element:f.Element,document:f.document,window:f.window});
  try{coverAddedInstallationRowOnScroll(f.description);callback(f);}finally{
    for(const[name,value]of Object.entries(original))if(value===undefined)delete globalThis[name];else globalThis[name]=value;
  }
}

test('new-row control preserves the original scroll setter and adds the original copy only once',()=>run(f=>{
  const original=f.description.children[0];
  assert.equal(f.description.children.length,1);
  f.dialog.scrollTop=25;
  assert.equal(f.dialog.scrollTop,25);
  assert.equal(f.window.__installAddedRow,true);
  assert.equal(f.description.children[0],original);
  assert.equal(f.description.textContent,'תיאור ההתקנה המקורישורה חדשה שאסור להחמיץ');
  const count=f.description.children.length;
  f.dialog.scrollTop=40;
  assert.equal(f.dialog.scrollTop,40);
  assert.equal(f.description.children.length,count);
}));

test('the blocker belongs only to the new text so dialog scrolling cannot detach its position',()=>run(f=>{
  f.dialog.scrollTop=25;
  const all=node=>[node,...(node.children||[]).flatMap(all)];
  const blockers=all(f.document.body).filter(node=>Object.hasOwn(node.dataset||{},'installNewRowBlocker'));
  assert.equal(blockers.length,1);
  assert.equal(f.description.lastChild.contains?.(blockers[0]),true,'only the newly appended row must own its occluder');
  assert.equal(f.description.children[0].contains?.(blockers[0])||false,false,'the original row must remain uncovered');
  assert.notEqual(blockers[0].parentElement,f.document.body,'a saved viewport rectangle must not own this moving-line control');
}));
