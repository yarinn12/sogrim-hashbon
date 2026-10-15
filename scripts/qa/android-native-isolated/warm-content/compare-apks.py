"""Compare decompressed members of two isolated Debug APKs; never accept Native QA."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

SOURCE = 'c14a7665e8de361d8d33be183e7a88adec3ff7cb'
TREE = '9bcf8cf40144d12507faa2cfea9ddadee42d819f'
CONTROL_HASH = 'fd891eb048775b7410e4d7219efabcaf6a8590f8cb726ca883f362fb3a77b88b'
INDEX = 'assets/public/index.html'
SIGNATURE_METADATA = {'META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_apk(path):
    contents = {}
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            name = info.filename
            if not name or name.startswith('/') or '\\' in name or '..' in name.split('/') or name in contents:
                raise ValueError('Unsafe or duplicated APK member: ' + name)
            # ZipFile.read verifies the uncompressed CRC and handles stored/deflated members.
            contents[name] = archive.read(info)
    return contents


def audit(product_path, control_path, fixture_path, product_audit, fixture_receipt):
    product_path, control_path, fixture_path = map(lambda value: Path(value).resolve(),
                                                    (product_path, control_path, fixture_path))
    product, control = read_apk(product_path), read_apk(control_path)
    if set(product) != set(control):
        raise ValueError('APK member names differ: ' + repr(sorted(set(product) ^ set(control))))
    if INDEX not in product or b'android-native-qa-fixture.js' not in product[INDEX]:
        raise ValueError('Product APK lacks the isolated synthetic fixture index')
    fixture_raw = fixture_path.read_bytes()
    fixture = fixture_raw.replace(b'\r\n', b'\n')
    if digest(fixture)!=CONTROL_HASH or control[INDEX] != fixture or b'data-diagnostic-control="minimal-webview"' not in fixture:
        raise ValueError('Control APK index differs from the reviewed minimal fixture')
    original=json.loads(Path(product_audit).read_text(encoding='utf-8'))
    provenance=json.loads(Path(fixture_receipt).read_text(encoding='utf-8'))
    if original.get('sourceCommit')!=SOURCE or provenance.get('sourceCommit')!=SOURCE or original.get('sourceTree')!=TREE or provenance.get('sourceTree')!=TREE:
        raise ValueError('Require frozen c14 source/tree product lineage')
    if original.get('ready')is not True or original.get('nativeDiagnosticAbsent')is not True or original.get('errors')!=[] or original.get('apkSha256')!=digest(product_path.read_bytes()) or provenance.get('fixtureIndexSha256')!=digest(product[INDEX]):
        raise ValueError('Actual product APK/index differs from original successful audit')
    if any(provenance.get(k)is not True for k in ['privateEnvDisabled','bootstrapIsSynthetic','nativeDiagnosticAbsent']) or any(provenance.get(k)is not False for k in ['runtimeSourceChanged','productCssChanged']):
        raise ValueError('Product fixture isolation restrictions differ')
    assets=original.get('assets',[]);public={n[len('assets/public/'):]:b for n,b in product.items()if n.startswith('assets/public/')and not n.endswith('/')}
    if len(assets)!=215 or sum(bool(a.get('font'))for a in assets)!=13 or {a['path']for a in assets}!=set(public) or len({a['path']for a in assets})!=len(assets):
        raise ValueError('Require exact audited 215 public assets and 13 fonts')
    if any(a['sha256']!=digest(public[a['path']])or a['length']!=len(public[a['path']])for a in assets):
        raise ValueError('Actual product packaged bytes differ from audit')
    changed = sorted(name for name in product if product[name] != control[name])
    if INDEX not in changed or any(name != INDEX and name not in SIGNATURE_METADATA for name in changed):
        raise ValueError('APK member delta exceeds exact index/signature allowlist: ' + repr(changed))
    members = {name: {'product': digest(product[name]), 'control': digest(control[name]),
                      'productBytes': len(product[name]), 'controlBytes': len(control[name])}
               for name in sorted(product)}
    return {'schemaVersion': 1, 'appSource': SOURCE, 'appTree':TREE,'productLineageVerified':True,'productAuditSha256':digest(Path(product_audit).read_bytes()),'fixtureReceiptSha256':digest(Path(fixture_receipt).read_bytes()),'fixtureOnly': True,
            'nativeAcceptance': False, 'requiredSignerVerification': True,
            'variants': {
                'A': {'path': str(product_path), 'apkSha256': digest(product_path.read_bytes()),
                      'apkBytes': product_path.stat().st_size, 'indexSha256': digest(product[INDEX])},
                'B': {'path': str(control_path), 'apkSha256': digest(control_path.read_bytes()),
                      'apkBytes': control_path.stat().st_size, 'indexSha256': digest(control[INDEX])}},
            'reviewedControlIndexSha256': digest(fixture), 'reviewedControlIndexRawSha256': digest(fixture_raw), 'reviewedControlIndexNormalizedCRLF': fixture_raw!=fixture, 'changedMembers': changed,
            'signatureMetadataDifferences': sorted(set(changed) & SIGNATURE_METADATA),
            'memberCount': len(product), 'members': members}


if __name__ == '__main__':
    if len(sys.argv) != 6:
        raise SystemExit('Usage: compare-apks.py PRODUCT.apk CONTROL.apk control-index.html apk-assets.json fixture-provenance.json')
    try:
        print(json.dumps(audit(*sys.argv[1:]), separators=(',', ':')))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
