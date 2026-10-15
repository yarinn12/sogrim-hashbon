import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import vm from 'node:vm';
import {requestedSuite,selectTestFiles} from '../scripts/lib/test-suites.mjs';

const source=readFileSync(new URL('../scripts/run-tests.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function run({args=[],launchError=false,javaLaunchError=false,parallelism=64,platform=process.platform}={}) {
  const calls=[],errors=[],exits=[];
  const context=vm.createContext({readdirSync,statSync,join,resolve,relative,console,requestedSuite,selectTestFiles,availableParallelism:()=>parallelism,
    spawnSync:(executable,args,options)=>{
      calls.push({executable,args:Array.from(args),options});
      const failed=args[0]==='--test'&&(launchError||javaLaunchError&&args.some(arg=>arg.endsWith('androidWebViewLoadOrder.test.mjs')));
      return failed?{status:null,error:Object.assign(new Error('Synthetic launch failed'),{code:'ENAMETOOLONG'})}:{status:0};
    },process:{execPath:process.execPath,platform,argv:['node','run-tests.mjs',...args],cwd:()=>process.cwd(),stderr:{write:text=>errors.push(text)},exit:code=>exits.push(code)}
  });
  vm.runInContext(source,context);
  return{calls,errors,exits};
}

test('the full test command fits the Windows command-line limit and includes every test file',()=>{
  const h=run({platform:'win32'}),commands=h.calls.filter(call=>call.args[0]==='--test');
  const discovered=readdirSync('tests',{recursive:true}).filter(f=>f.endsWith('.test.mjs')).map(f=>resolve('tests',f)).sort();
  const selected=commands.flatMap(command=>command.args.slice(1).filter(arg=>!arg.startsWith('--')).map(f=>resolve(f)));
  assert.deepEqual(selected.sort(),discovered);
  for(const command of commands){
    const commandLength=command.executable.length+command.args.map(arg=>arg.length+3).reduce((a,b)=>a+b,0);
    assert.ok(commandLength<32767,`Windows cannot launch the ${commandLength}-character test command`);
  }
  assert.deepEqual(h.exits,[0]);
});

test('the complete suite bounds file workers without changing coverage or per-test timeouts',()=>{
  assert.ok(run({parallelism:64,platform:'linux'}).calls.at(-1).args.includes('--test-concurrency=4'));
  assert.ok(run({parallelism:1,platform:'linux'}).calls.at(-1).args.includes('--test-concurrency=1'));
});

test('Windows runs Java probe files serially before the remaining parallel suite',()=>{
  const h=run({parallelism:64,platform:'win32'}),commands=h.calls.filter(call=>call.args[0]==='--test');
  assert.equal(commands.length,2);
  const [java,remaining]=commands;
  assert.ok(java.args.includes('--test-concurrency=1'));
  assert.equal(java.args.filter(arg=>arg.endsWith('androidWebViewLoadOrder.test.mjs')||arg.endsWith('androidWebViewProbeModel.test.mjs')).length,2);
  assert.equal(java.args.filter(arg=>arg.endsWith('.test.mjs')).length,2);
  assert.ok(remaining.args.includes('--test-concurrency=4'));
  assert.equal(remaining.args.some(arg=>arg.endsWith('androidWebViewLoadOrder.test.mjs')||arg.endsWith('androidWebViewProbeModel.test.mjs')),false);
  assert.deepEqual(h.exits,[0]);
});

test('an unlaunchable test process reports the underlying error and exits unsuccessfully',()=>{
  const h=run({launchError:true});
  assert.deepEqual(h.exits,[1]);
  assert.match(h.errors.join(''),/Synthetic launch failed/);
});

test('a Java phase failure still runs the remaining Windows suite and returns failure',()=>{
  const h=run({javaLaunchError:true,platform:'win32'});
  assert.equal(h.calls.filter(call=>call.args[0]==='--test').length,2);
  assert.deepEqual(h.exits,[1]);
  assert.match(h.errors.join(''),/Synthetic launch failed/);
});

test('Windows coverage and suite selection keep their requested files and flags',()=>{
  const coverage=run({args:['--coverage'],platform:'win32'}).calls.filter(call=>call.args[0]==='--test');
  assert.equal(coverage.length,2);
  for(const command of coverage)assert.ok(command.args.includes('--experimental-test-coverage'));
  const integration=run({args:['--suite','integration'],platform:'win32'}).calls.filter(call=>call.args[0]==='--test');
  assert.equal(integration.length,1);
  assert.ok(integration[0].args.includes('--test-concurrency=4'));
});
