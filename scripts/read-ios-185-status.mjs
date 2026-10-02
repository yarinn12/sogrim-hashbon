import { mkdir, writeFile } from "node:fs/promises";
import { createReadOnlyAppStoreClient } from "./lib/app-store-status-readonly.mjs";

const appId="6809952514", bundleId="com.sogrimhashbon.app";
const report={appId,scope:"GET only; no store changes",targetVersion:"4.55",targetBuild:"185",errors:[]};
const request=createReadOnlyAppStoreClient({
  issuerId:process.env.APPSTORE_ISSUER_ID,keyId:process.env.APPSTORE_API_KEY_ID,
  privateKey:process.env.APPSTORE_API_PRIVATE_KEY
});
const query=(path,params)=>path+"?"+new URLSearchParams(params);
function state(value){
  if(value==null)return null;
  if(typeof value!=="string"||!/^[A-Z][A-Z_]{0,63}$/.test(value))throw new Error("Unexpected state");
  return value;
}
async function collection(path){
  const base=new URL(path,"https://api.appstoreconnect.apple.com");
  let next=base.href; const data=[],included=[];
  for(let page=0;next&&page<10;page++){
    const url=new URL(next,base);
    if(url.origin!==base.origin||url.pathname!==base.pathname||url.username||url.password||url.hash||
      [...base.searchParams].some(([k,v])=>url.searchParams.get(k)!==v))throw new Error("Unsafe pagination");
    const result=await request(url.href);
    if(!Array.isArray(result.data))throw new Error("Unexpected collection");
    data.push(...result.data);included.push(...(result.included??[]));next=result.links?.next||null;
  }
  if(next)throw new Error("Incomplete collection");
  return {data,included};
}
async function optional(label,path,project){
  try{return {status:"read",...project(await request(path))};}
  catch(error){const status=Number.isInteger(error?.status)?error.status:null;
    report.errors.push({section:label,...(status?{httpStatus:status}:{}),code:"read_unavailable"});
    return {status:"unavailable",...(status?{httpStatus:status}:{})};
  }
}
try{
  const app=(await request("/v1/apps/"+appId+"?"+new URLSearchParams({"fields[apps]":"bundleId"}))).data;
  if(app?.id!==appId||app?.attributes?.bundleId!==bundleId)throw new Error("App identity mismatch");
  report.app={identityVerified:true};
  const builds=await collection(query("/v1/builds",{
    "filter[app]":appId,"filter[version]":"185","include":"preReleaseVersion","limit":"200"
  }));
  const matches=builds.data.filter(b=>b.attributes.version==="185"&&builds.included.some(v=>
    v.type==="preReleaseVersions"&&v.id===b.relationships?.preReleaseVersion?.data?.id&&
    v.attributes.version==="4.55"&&v.attributes.platform==="IOS"));
  if(matches.length!==1)throw new Error("Expected exactly one iOS 4.55 (185)");
  const build=matches[0];
  report.build185={id:build.id,version:"4.55",number:"185",processingState:state(build.attributes.processingState),
    expired:build.attributes.expired===true,uploadedDate:build.attributes.uploadedDate,
    expirationDate:build.attributes.expirationDate};
  const [beta,review,versions]=await Promise.all([
    optional("beta185","/v1/builds/"+build.id+"/buildBetaDetail",r=>({
      internalBuildState:state(r.data?.attributes?.internalBuildState),
      externalBuildState:state(r.data?.attributes?.externalBuildState)})),
    optional("betaReview185","/v1/builds/"+build.id+"/betaAppReviewSubmission",r=>({
      submissionFound:Boolean(r.data),betaReviewState:state(r.data?.attributes?.betaReviewState)})),
    collection(query("/v1/apps/"+appId+"/appStoreVersions",{"filter[platform]":"IOS","limit":"200"}))
  ]);
  report.beta185=beta;report.betaReview185=review;
  report.versions=versions.data.map(v=>{
    if(v.type!=="appStoreVersions"||v.attributes.platform!=="IOS"||!/^\d+\.\d+(?:\.\d+)?$/.test(v.attributes.versionString))throw new Error("Unexpected version");
    return {id:v.id,version:v.attributes.versionString,appStoreState:state(v.attributes.appStoreState),
      appVersionState:state(v.attributes.appVersionState),releaseType:state(v.attributes.releaseType)};
  }).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}));
  report.store455=report.versions.find(v=>v.version==="4.55")??{found:false};
  report.reviewSubmission452=await optional("reviewSubmission452",
    "/v1/reviewSubmissions/8b6da79a-4738-4884-b744-c04959b104da",
    r=>({state:state(r.data?.attributes?.state),platform:state(r.data?.attributes?.platform)}));
  report.checkedAt=new Date().toISOString();
  await mkdir("build/ios185-status",{recursive:true});
  await writeFile("build/ios185-status/status.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}catch{
  console.error("Read-only iOS 4.55 (185) status could not be verified.");
  process.exitCode=1;
}
