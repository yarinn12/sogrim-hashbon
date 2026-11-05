import hashlib,json,pathlib,re,stat,zipfile
CIPHERTEXT_SHA256='PENDING'
SIGNING_RUN_ID='PENDING'
IPA_SHA256='PENDING'
folder=pathlib.Path('build/ios/original-encrypted')
def require(ok,message):
    if not ok:raise ValueError(message)
require(re.fullmatch(r'[0-9a-f]{64}',CIPHERTEXT_SHA256) is not None,'Real encrypted payload digest must be bound before extraction')
require(re.fullmatch(r'[1-9][0-9]*',SIGNING_RUN_ID) is not None,'Real signing run must be bound before extraction')
require(re.fullmatch(r'[0-9a-f]{64}',IPA_SHA256) is not None,'Real IPA digest must be bound before extraction')
with zipfile.ZipFile(folder/'original.zip') as archive:
    entries=archive.infolist()
    require(len(entries)==2 and {e.filename for e in entries}=={'release.tar.enc','envelope.json'},'Unexpected encrypted ZIP entries')
    for entry in entries:
        require(not entry.is_dir() and not stat.S_ISLNK(entry.external_attr>>16),'Non-regular encrypted ZIP entry')
        require(entry.file_size<=536870912,'Oversized encrypted payload')
        if entry.filename=='envelope.json':require(entry.file_size<100000,'Oversized envelope')
        with (folder/entry.filename).open('xb') as output:output.write(archive.read(entry))
require(hashlib.sha256((folder/'release.tar.enc').read_bytes()).hexdigest()==CIPHERTEXT_SHA256,'Original encrypted payload changed')
identity=json.loads(json.loads((folder/'envelope.json').read_text())['aad'])
require(identity['sourceCommit']=='abcbac91e97230e4737e80c4ea3c2206360e855f' and identity['sourceTree']=='76e2319de17a875db5f5b1e2b54c2b63659644b1','Original source identity changed')
require(identity['version']=='4.59' and identity['build']=='195','Original version or build changed')
require(identity['buildRunId']==SIGNING_RUN_ID and identity['buildRunAttempt']=='1','Original signing run changed')
require(identity['ipaSha256']==IPA_SHA256,'Original IPA hash changed')
print('Original encrypted components and public AAD identity verified; no decryption or Apple write used.')
