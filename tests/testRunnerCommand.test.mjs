import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/run-tests.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function run({launchError=false}={}) {
  const calls=[],errors=[],exits=[];
  const context=vm.createContext({readdirSync,statSync,join,resolve,relative,console,
    spawnSync:(executable,args,options)=>{
      calls.push({executable,args:Array.from(args),options});
      return args[0]==='--test'&&launchError?{status:null,error:Object.assign(new Error('Synthetic launch failed'),{code:'ENAMETOOLONG'})}:{status:0};
    },process:{execPath:process.execPath,argv:[],cwd:()=>process.cwd(),stderr:{write:text=>errors.push(text)},exit:code=>exits.push(code)}
  });
  vm.runInContext(source,context);
  return{calls,errors,exits};
}

test('the full test command fits the Windows command-line limit and includes every test file',()=>{
  const h=run(),command=h.calls.at(-1);
  assert.equal(command.args[0],'--test');
  const discovered=readdirSync('tests',{recursive:true}).filter(f=>f.endsWith('.test.mjs')).map(f=>resolve('tests',f)).sort();
  assert.deepEqual(command.args.slice(1).map(f=>resolve(f)).sort(),discovered);
  const commandLength=command.executable.length+command.args.map(arg=>arg.length+3).reduce((a,b)=>a+b,0);
  assert.ok(commandLength<32767,`Windows cannot launch the complete ${commandLength}-character test command`);
  assert.deepEqual(h.exits,[0]);
});

test('an unlaunchable test process reports the underlying error and exits unsuccessfully',()=>{
  const h=run({launchError:true});
  assert.deepEqual(h.exits,[1]);
  assert.match(h.errors.join(''),/Synthetic launch failed/);
});
