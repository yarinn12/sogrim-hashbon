import hashlib,json,pathlib,re,stat,zipfile
CIPHERTEXT_SHA256='5f9d20a0e2193d6f9b2d34f5749712f99a95f45ab535327d882b2cb26a3b4a15'
SIGNING_RUN_ID='38917936561'
IPA_SHA256='82ff41f44647989c4365b1607ea290f6802750f5c0b264b8dbadf5a333430897'
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
require(identity['sourceCommit']=='2cf78afc23c1d9330834de63ed5f81ba4da5b052' and identity['sourceTree']=='52105dddf3b9a8edb61032c6149eac1b392c460a','Original source identity changed')
require(identity['version']=='4.58' and identity['build']=='194','Original version or build changed')
require(identity['buildRunId']==SIGNING_RUN_ID and identity['buildRunAttempt']=='1','Original signing run changed')
require(identity['ipaSha256']==IPA_SHA256,'Original IPA hash changed')
print('Original encrypted components and public AAD identity verified; no decryption or Apple write used.')
