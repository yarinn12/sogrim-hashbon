import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {constants} from 'node:os';

// Public coordinates from the actual QA430 classpath resolution failure plus
// the two declared build plugins. Never infer that arbitrary GAVs/paths are public.
const publicGavs=new Set([
  'org.jetbrains.kotlin:kotlin-stdlib:2.2.0','org.apache.httpcomponents:httpmime:4.5.6','org.ow2.asm:asm:9.8','org.ow2.asm:asm-analysis:9.8','org.ow2.asm:asm-commons:9.8','org.ow2.asm:asm-util:9.8',
  'org.bouncycastle:bcpkix-jdk18on:1.79','org.glassfish.jaxb:jaxb-runtime:2.3.2','com.squareup:javapoet:1.10.0','com.google.protobuf:protobuf-java:3.25.5','com.google.protobuf:protobuf-java-util:3.25.5','com.google.code.gson:gson:2.11.0',
  'io.grpc:grpc-core:1.69.1','io.grpc:grpc-netty:1.69.1','io.grpc:grpc-protobuf:1.69.1','io.grpc:grpc-stub:1.69.1','io.grpc:grpc-inprocess:1.69.1','com.google.crypto.tink:tink:1.7.0','com.google.flatbuffers:flatbuffers-java:1.12.0','org.tensorflow:tensorflow-lite-metadata:0.2.0',
  'org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.2.0','com.google.guava:guava:33.3.1-jre','javax.inject:javax.inject:1','net.sf.kxml:kxml2:2.3.0','org.apache.commons:commons-compress:1.21','org.bouncycastle:bcprov-jdk18on:1.79','org.jetbrains.kotlin:kotlin-reflect:2.2.0','org.apache.httpcomponents:httpcore:4.4.16','com.google.jimfs:jimfs:1.1','com.sun.activation:javax.activation:1.2.0','org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0','org.jetbrains:annotations:23.0.0','org.apache.httpcomponents:httpclient:4.5.14','net.java.dev.jna:jna-platform:5.6.0','com.googlecode.juniversalchardet:juniversalchardet:1.0.3',
  'javax.annotation:javax.annotation-api:1.3.2','com.google.auto.value:auto-value-annotations:1.6.2','com.google.errorprone:error_prone_annotations:2.3.1','com.google.dagger:dagger:2.28.3','org.bitbucket.b_c:jose4j:0.9.5','org.slf4j:slf4j-api:1.7.30','org.jdom:jdom2:2.0.6','com.squareup:javawriter:2.5.0','com.google.code.findbugs:jsr305:3.0.2',
  'com.android.tools.build:gradle:8.13.0','com.google.gms:google-services:4.4.4'
]);
const publicResources=new Set();
for(const gav of publicGavs){const [group,artifact,version]=gav.split(':');for(const extension of ['pom','jar','module'])for(const checksum of ['', '.sha1','.sha256','.sha512','.md5'])publicResources.add(`${group.replaceAll('.','/')}/${artifact}/${version}/${artifact}-${version}.${extension}${checksum}`);}
const maxLineBytes=16*1024,maxEvents=1000,maxEventBytes=256*1024,maxArtifactBytes=512*1024;
function publicURL(raw){
  if(/[\s%?#\\]/.test(raw))return null;
  try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;
    const prefix=u.hostname==='repo.maven.apache.org'?'/maven2/':u.hostname==='dl.google.com'?'/dl/android/maven2/':null;
    if(!prefix||raw!==u.href||!u.pathname.startsWith(prefix)||!publicResources.has(u.pathname.slice(prefix.length)))return null;
    return u.href;
  }catch{return null;}
}
function parseLine(line){
  const s=line.trim();let m;
  if((m=/^Resource missing\. \[HTTP (GET|HEAD): (\S+)\]$/.exec(s)))return{url:m[2],kind:'resource-missing',method:m[1],httpStatus:null,inferredHTTPStatus:404,statusBasis:'inference from pinned Gradle8.14.5 wasMissing; not a wire status log'};
  if((m=/^Failed to get resource: (GET|HEAD)\. \[HTTP HTTP\/[\d.]+ (\d{3})[^\r\n]*: (\S+)\)\]$/.exec(s)))return{url:m[3],kind:'http-failure',method:m[1],httpStatus:Number(m[2]),statusBasis:'Gradle status log'};
  if((m=/^(?:>\s*)?Could not (GET|HEAD) '(\S+)'\. Received status code (\d{3}) from server:[^\r\n]*$/.exec(s)))return{url:m[2],kind:'http-failure',method:m[1],httpStatus:Number(m[3]),statusBasis:'Gradle exception status log'};
  if((m=/^(?:>\s*)?Could not find ([\w.-]+:[\w.-]+:[\w.+-]+)\.$/.exec(s)))return publicGavs.has(m[1])?{kind:'unresolved-coordinate',gav:m[1],httpStatus:null,statusBasis:'unknown; resolution failure is not an HTTP response'}:null;
  if((m=/^- (https:\/\/\S+)$/.exec(s)))return{kind:'searched-resource',url:m[1],httpStatus:null,statusBasis:'unknown; searched location is not an HTTP response'};
  const exception=/\b(java\.net\.(?:UnknownHostException|ConnectException|SocketTimeoutException|SocketException)|javax\.net\.ssl\.(?:SSLHandshakeException|SSLException)|org\.gradle\.internal\.resource\.transport\.http\.HttpErrorStatusCodeException)\b/.exec(s);
  if(exception)return{kind:'exception-type',exceptionType:exception[1],httpStatus:null,statusBasis:'unknown; exception message deliberately omitted'};
  return null;
}
export async function observeGradleBuild({command,args=[],cwd,output,source}){
  if(!/^[a-f0-9]{40}$/.test(source||'')||!command||!cwd||!output||!Array.isArray(args))throw Error('Require owned build paths, command and exact source');
  const started=process.hrtime.bigint(),cpu=process.cpuUsage(),report={source,startedAtUtc:new Date().toISOString(),phase:'assembleDebug',invocations:1,exitCode:null,signal:null,buildSucceeded:false,nativeAcceptance:false,events:[],coverage:{rawBytesObserved:0,unknownLines:0,protectedURLs:0,overlongLines:0,streamErrors:0,eventCapHit:false,diagnosticComplete:true,responseHeadersAvailable:false,responseBodiesAvailable:false,JVMAddressAvailable:false,DNSProxyCacheCauseProven:false},limits:{maxLineBytes,maxEvents,maxArtifactBytes}};
  let eventBytes=0,spawnFailed=false;
  function accept(line,stream,sequence){const row=parseLine(line);if(!row){report.coverage.unknownLines++;return;}
    if(row.url){const safe=publicURL(row.url);if(!safe){report.coverage.protectedURLs++;return;}row.url=safe;}
    if(row.httpStatus!==null&&(!Number.isInteger(row.httpStatus)||row.httpStatus<100||row.httpStatus>599)){report.coverage.unknownLines++;return;}
    const event={...row,stream,sequence,receivedAtUtc:new Date().toISOString(),receivedMonotonicNs:process.hrtime.bigint().toString()},bytes=Buffer.byteLength(JSON.stringify(event));
    if(report.events.length>=maxEvents||eventBytes+bytes>maxEventBytes){report.coverage.eventCapHit=true;return;}eventBytes+=bytes;report.events.push(event);
  }
  function drain(stream,name){let pending=[],length=0,dropping=false,sequence=0;
    function part(bytes,end){if(!dropping){if(length+bytes.length>maxLineBytes){pending=[];length=0;dropping=true;report.coverage.overlongLines++;}else{pending.push(bytes);length+=bytes.length;}}
      if(end){sequence++;if(!dropping)accept(Buffer.concat(pending,length).toString('utf8'),name,sequence);pending=[];length=0;dropping=false;}}
    stream.on('data',chunk=>{report.coverage.rawBytesObserved+=chunk.length;let offset=0,newline;while((newline=chunk.indexOf(10,offset))!==-1){part(chunk.subarray(offset,newline),true);offset=newline+1;}if(offset<chunk.length)part(chunk.subarray(offset),false);});
    stream.on('end',()=>{if(length||dropping)part(Buffer.alloc(0),true);});
    stream.on('error',()=>{report.coverage.streamErrors++;});
  }
  await new Promise(done=>{let child;
    try{child=spawn(command,[...args,'--info','--stacktrace','--console=plain'],{cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});}
    catch{spawnFailed=true;done();return;}
    drain(child.stdout,'stdout');drain(child.stderr,'stderr');child.on('error',()=>{spawnFailed=true;});child.on('close',(code,signal)=>{report.exitCode=spawnFailed?null:code;report.signal=signal||null;done();});
  });
  report.spawnFailed=spawnFailed;report.buildSucceeded=!spawnFailed&&report.exitCode===0&&!report.signal;
  report.failureCategory=report.buildSucceeded?null:'unknown; interpret observed events without inventing a missing HTTP/DNS/proxy/cache cause';
  report.coverage.diagnosticComplete=!spawnFailed&&!report.coverage.overlongLines&&!report.coverage.eventCapHit&&!report.coverage.streamErrors;
  report.completedAtUtc=new Date().toISOString();report.overhead={observerCpuMicroseconds:process.cpuUsage(cpu),elapsedMs:Number(process.hrtime.bigint()-started)/1e6,rssBytes:process.memoryUsage().rss};
  // Never forward/store raw output, argv, env, arbitrary paths or error messages.
  // Diagnostic I/O failure cannot replace the original successful/failed build.
  try{mkdirSync(output,{recursive:true});const text=JSON.stringify(report)+'\n';if(Buffer.byteLength(text)>maxArtifactBytes)throw Error('Artifact cap');writeFileSync(join(output,'gradle-build.json'),text,{flag:'wx',mode:0o600});report.diagnosticSaved=true;}catch{report.diagnosticSaved=false;}
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const split=process.argv.indexOf('--'),opts=process.argv.slice(2,split),get=key=>opts.indexOf(key)<0?undefined:opts[opts.indexOf(key)+1];if(split<0)throw Error('Require build command');
    const report=await observeGradleBuild({command:process.argv[split+1],args:process.argv.slice(split+2),cwd:get('--cwd'),output:get('--output'),source:get('--source')});
    console.log(JSON.stringify({source:report.source,exitCode:report.exitCode,signal:report.signal,buildSucceeded:report.buildSucceeded,diagnosticSaved:report.diagnosticSaved,diagnosticComplete:report.coverage.diagnosticComplete,nativeAcceptance:false}));
    process.exitCode=report.exitCode!==null?report.exitCode:report.signal?128+(constants.signals[report.signal]||0):1;
  }catch{console.error('Gradle observation could not start; no build result available');process.exitCode=1;}
}
