import base64,hashlib,io,json,pathlib,stat,zipfile
from intake_bindings import require,require_bindings,json_read,exact_fields,digest,VERSION,BUILD

def verify_envelope(ciphertext,envelope,pins=None):
    pins=require_bindings(pins);a,s=pins['application'],pins['signing']
    require(len(ciphertext)==s['ciphertextSize'] and hashlib.sha256(ciphertext).hexdigest()==s['ciphertextSha256'],'Original encrypted payload changed')
    exact_fields(envelope,{'format':'sogrim-ios-private-artifact-v1','algorithm':'AES-256-GCM',
        'kdf':'HKDF-SHA256-PKCS8-DER','ciphertextSha256':s['ciphertextSha256']},'Original encryption format differs')
    for key,size in [('salt',32),('iv',12),('tag',16)]:
        require(len(base64.b64decode(envelope[key],validate=True))==size,'Invalid original encryption '+key)
    require(digest(envelope.get('plaintextSha256'),64),'Plaintext archive digest missing')
    identity=json_read(envelope['aad'])
    exact_fields(identity,{'context':'sogrim-ios-private-artifact-v1','sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],
        'version':VERSION,'build':BUILD,'buildRunId':s['runId'],'buildRunAttempt':'1','ipaSha256':s['ipaSha256']},'Original authenticated identity differs')
    return identity

def extract_components(raw,folder,pins=None):
    pins=require_bindings(pins);s=pins['signing']
    require(len(raw)==s['artifactSize'] and hashlib.sha256(raw).hexdigest()==s['zipSha256'],'Original encrypted ZIP bytes changed')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries=archive.infolist()
        require(len(entries)==2 and {e.filename for e in entries}=={'release.tar.enc','envelope.json'},'Unexpected encrypted ZIP entries')
        for entry in entries:
            require(not entry.is_dir() and not stat.S_ISLNK(entry.external_attr>>16) and not (entry.flag_bits&1),'Non-regular or encrypted ZIP entry')
            require(entry.file_size<=536870912,'Oversized encrypted ZIP entry')
            if entry.filename=='envelope.json':require(entry.file_size<100000,'Oversized envelope')
        ciphertext,envelope_raw=archive.read('release.tar.enc'),archive.read('envelope.json')
    verify_envelope(ciphertext,json_read(envelope_raw.decode('utf-8')),pins)
    for name in ['release.tar.enc','envelope.json']:require(not (folder/name).exists(),'Refuse to replace original encrypted component')
    for name,data in [('release.tar.enc',ciphertext),('envelope.json',envelope_raw)]:
        with (folder/name).open('xb') as output:output.write(data)

def main():
    pins=require_bindings()
    folder=pathlib.Path('build/ios/original-encrypted')
    extract_components((folder/'original.zip').read_bytes(),folder,pins)
    print('Original ZIP, ciphertext and public authenticated identity verified; no key or decryption used.')
if __name__=='__main__':main()
