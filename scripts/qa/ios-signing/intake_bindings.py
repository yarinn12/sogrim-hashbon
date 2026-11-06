import json,pathlib,re
REPO='yarinn12/sogrim-hashbon'
REPO_ID=1247836328
VERSION='4.59'
BUILD='195'
SIGNING_BRANCH='codex/ios195-459-signing-qa492-20261106'
SIGNING_PATH='.github/workflows/ios195-459-private-sign-only-qa492-20261106.yml'
SIGNING_NAME='iOS195 4.59 private signed artifact only'
SIGNING_REF=REPO+'/'+SIGNING_PATH+'@refs/heads/'+SIGNING_BRANCH
VERIFIER_SHA='f179c7771bbf059e1fa57949158117501ec98c33c671682033eb2df3776cff3a'
STEPS=[
 'Require first branch creation and two complete workflow histories',
 'Require all four successful source CI runs before signing secrets',
 'Require pinned source CI and read unused build number before signing',
 'Recheck exact source CI and current unused number after export',
 'Require all packaged web assets, release entitlements and valid distribution profile',
 'Encrypt only the verified IPA and its evidence for private retention',
 'Retain only encrypted release output for seven days']
CI_PATHS={
 'SOURCE_QA_RUN':'.github/workflows/qa.yml',
 'SOURCE_WINDOWS_QA_RUN':'.github/workflows/qa-windows.yml',
 'SOURCE_FONT_QA_RUN':'.github/workflows/cross-engine-font-provenance-qa.yml',
 'SOURCE_AUTH_QA_RUN':'.github/workflows/ios-auth-return-qa.yml'}
def require(ok,message):
    if not ok:raise ValueError(message)
def integer(v):return type(v) is int and 0<v<=9007199254740991
def decimal(v):return isinstance(v,str) and re.fullmatch(r'[1-9][0-9]*',v) is not None and integer(int(v))
def digest(v,n):return isinstance(v,str) and re.fullmatch('[0-9a-f]{'+str(n)+'}',v) is not None and set(v)!={'0'}
def json_read(text):
    def invalid(value):raise ValueError('Non-finite evidence number')
    return json.loads(text,parse_constant=invalid)
def require_bindings(pins=None):
    if pins is None:pins=json_read(pathlib.Path(__file__).with_name('intake-bindings.json').read_text(encoding='utf-8'))
    require(isinstance(pins,dict) and 'PENDING' not in json.dumps(pins),'Final intake bindings remain PENDING')
    require(pins.get('schemaVersion')==1,'Wrong bindings schema')
    a,s=pins.get('application',{}),pins.get('signing',{})
    require(all(digest(v,40) for v in [a.get('sourceSha'),a.get('sourceTree'),s.get('toolsSha')]),'Invalid source/tree/signing SHA')
    require(isinstance(a.get('branch'),str) and re.fullmatch(r'codex/[A-Za-z0-9._/-]+',a['branch']) and '..' not in a['branch'],'Invalid final source branch')
    require(decimal(a.get('pwa')),'Invalid PWA release')
    require(set(a.get('ciRuns',{}))==set(CI_PATHS) and all(decimal(v) for v in a['ciRuns'].values()) and len(set(a['ciRuns'].values()))==4,'Invalid distinct source CI runs')
    require(all(decimal(s.get(k)) for k in ['runId','artifactId']),'Invalid original IDs')
    require(all(integer(s.get(k)) for k in ['runNumber','jobId','artifactSize','ipaSize','ciphertextSize']),'Invalid original counter/job/size')
    require(all(s[k]<=536870912 for k in ['artifactSize','ipaSize','ciphertextSize']),'Unbounded original size')
    require(set(s.get('controls',{}))=={'firstCreation','sourceGuard','workflow','requiredJobs'},'Missing original controls')
    require(all(digest(v,64) for v in [s.get('zipSha256'),s.get('ipaSha256'),s.get('ciphertextSha256'),*s['controls'].values()]),'Missing original digest')
    require(s['controls']['firstCreation']==VERIFIER_SHA,'Unreviewed first-creation verifier')
    return pins
def exact_fields(value,expected,message):
    require(isinstance(value,dict),message)
    for key,want in expected.items():
        got=value.get(key)
        require(type(got) is type(want) and got==want,message+': '+key)
def validate_origin(origin,pins):
    require_bindings(pins);a,s=pins['application'],pins['signing']
    exact_fields(origin,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'signingTools':s['toolsSha'],
        'signingRunId':s['runId'],'signingRunAttempt':'1','signingRunNumber':s['runNumber'],'signingJobId':s['jobId'],
        'artifactId':s['artifactId'],'artifactSize':s['artifactSize'],'artifactDigest':'sha256:'+s['zipSha256'],
        'ipaSha256':s['ipaSha256'],'ipaSize':s['ipaSize'],'workflowRef':SIGNING_REF,
        'scope':'PACKAGE_INTAKE_ONLY','firstCreationStepPassed':True,'appleUploadPerformed':False,
        'databaseAccepted':False,'publicReleaseAccepted':False,'distributionAllowed':False},'Original origin receipt differs')
    require(integer(origin.get('signingWorkflowId')),'Original workflow ID missing')
    require(origin.get('signingControlHashes')==s['controls'],'Original control hashes differ')
    steps=origin.get('signingSteps')
    require(isinstance(steps,list) and len(steps)==len(STEPS),'Signing steps missing')
    prior=0
    for row,name in zip(steps,STEPS):
        exact_fields(row,{'name':name,'status':'completed','conclusion':'success'},'Original signing step differs')
        require(integer(row.get('number')) and row['number']>prior,'Signing step order differs');prior=row['number']
def validate_first_creation(proof,origin,pins):
    validate_origin(origin,pins);a,s=pins['application'],pins['signing']
    expected={'schemaVersion':1,'scope':'PRIVATE_IOS_SIGNING_CREATION_ONLY','ready':True,
        'repository':REPO,'repositoryId':REPO_ID,'branch':SIGNING_BRANCH,'workflowPath':SIGNING_PATH,'workflowName':SIGNING_NAME,
        'workflowId':origin['signingWorkflowId'],'runId':int(s['runId']),'controlSha':s['toolsSha'],'runAttempt':1,
        'runNumberCounterOnly':s['runNumber'],'branchCreated':True,'before':'0'*40,'forced':False,'deleted':False,
        'historyReads':2,'priorRetainedRuns':0,'appleSigningPerformed':False,'appleUploadPerformed':False}
    exact_fields(proof,expected,'Original firstCreation differs')
    require(set(proof)==set(expected)|{'historyCounts','historyPages','application'},'Unknown firstCreation fields')
    for key,values in [('historyCounts',[1,1]),('historyPages',[2,2])]:
        require(type(proof[key]) is list and proof[key]==values and all(type(v) is int for v in proof[key]),'Incomplete firstCreation histories')
    require(proof['application']=={'sourceSha':a['sourceSha'],'sourceTree':a['sourceTree'],'version':VERSION,'build':BUILD,
        'pwa':a['pwa'],'ciRuns':a['ciRuns']},'Original firstCreation application/CI differs')
    return proof
