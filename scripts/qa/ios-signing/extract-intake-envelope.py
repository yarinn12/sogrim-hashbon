import hashlib,json,pathlib,stat,zipfile
folder=pathlib.Path('build/ios/original-encrypted')
def require(ok,message):
    if not ok:raise ValueError(message)
with zipfile.ZipFile(folder/'original.zip') as archive:
    entries=archive.infolist()
    require(len(entries)==2 and {e.filename for e in entries}=={'release.tar.enc','envelope.json'},'Unexpected encrypted ZIP entries')
    for entry in entries:
        require(not entry.is_dir() and not stat.S_ISLNK(entry.external_attr>>16),'Non-regular encrypted ZIP entry')
        require(entry.file_size<=536870912,'Oversized encrypted payload')
        if entry.filename=='envelope.json':require(entry.file_size<100000,'Oversized envelope')
        with (folder/entry.filename).open('xb') as output:output.write(archive.read(entry))
require(hashlib.sha256((folder/'release.tar.enc').read_bytes()).hexdigest()=='731550045288b5e35ba3986b82918fb9cbd6452f01e599d344ab53c886c5ec88','Original encrypted payload changed')
identity=json.loads(json.loads((folder/'envelope.json').read_text())['aad'])
require(identity['sourceCommit']=='bf254b5235deb706234b00362e6eaea78e129e98' and identity['sourceTree']=='4a208e596cbaf0576cccd7f67fc99a665287836d','Original source identity changed')
require(identity['buildRunId']=='38307202558' and identity['buildRunAttempt']=='1','Original signing run changed')
require(identity['ipaSha256']=='66cbccebfb4f8ccdf4c95624de94cadf6aab181cc25be8723323dbb2928c918a','Original IPA hash changed')
print('Original encrypted components and public AAD identity verified; no decryption or Apple write used.')

