import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const helper=readFileSync(process.env.PROFILE_CONTROL_TEST_HELPER||new URL('../e2e/helpers/profileAccountPresentation.mjs',import.meta.url),'utf8');
const start=helper.indexOf('export function bounds()'),end=helper.indexOf('export async function click(');
assert.ok(start>=0&&end>start);
const actual=helper.slice(start,end).replaceAll('export ','');

function environment({lateScroll=false,covered=false,width=288,bandBottom=226}={}){
  let scroll=0,pending=false,lateRemaining=lateScroll,frames=0,corrections=0;
  const rect=(top,height,w=320)=>({x:0,y:top,top,bottom:top+height,left:0,right:w,width:w,height});
  const header={position:'fixed',getBoundingClientRect:()=>rect(0,110)};
  const nav={position:'fixed',getBoundingClientRect:()=>rect(bandBottom,150)};
  const target={position:'static',getBoundingClientRect:()=>({...rect(1000-scroll,56,width),x:16,left:16,right:16+width}),contains:()=>false};
  const blocker={};
  const applyLate=()=>{if(pending){scroll=650;pending=false;corrections++;}};
  const sandbox={innerWidth:320,innerHeight:390,
    document:{querySelectorAll:()=>[header,nav,target],querySelector:()=>nav,
      elementFromPoint:(x,y)=>covered?blocker:y>=110&&y<bandBottom?target:nav},
    getComputedStyle:e=>({position:e.position}),
    scrollTo:({top})=>{scroll=Math.max(0,Math.min(1800,top));if(lateRemaining){pending=true;lateRemaining=false;}},
    requestAnimationFrame:callback=>{frames++;applyLate();callback(frames*16);return frames;},
    expect:{poll:callback=>({async toBe(expected){for(let i=0;i<3;i++)if(await callback()===expected)return;throw Error('target not prepared inside controlled budget');}})}
  };
  Object.defineProperty(sandbox,'scrollY',{get:()=>scroll});
  const control=vm.runInNewContext(actual+'\ncontrol',sandbox);
  const locator={async evaluate(callback,arg){const result=await callback(target,arg);applyLate();return result;}};
  return{run:()=>control(locator),state:()=>({rect:target.getBoundingClientRect(),corrections,frames,scroll})};
}

test('a late focus scroll cannot strand the target after its first preparation',async()=>{
  const e=environment({lateScroll:true});await e.run();const s=e.state();
  assert.equal(s.corrections,1);
  assert.ok(s.rect.y+s.rect.height/2-22>=109);
  assert.ok(s.rect.y+s.rect.height/2+22<=227);
});
test('an ordinary stable control remains reachable',async()=>{await environment().run();});
test('a permanently covered target remains rejected',async()=>{await assert.rejects(environment({lateScroll:true,covered:true}).run(),/not prepared/);});
test('a target narrower than 44 pixels remains rejected',async()=>{await assert.rejects(environment({width:43}).run(),/not prepared/);});
test('an insufficient visible band cannot pass by scrolling',async()=>{await assert.rejects(environment({bandBottom:142}).run(),/not prepared/);});
