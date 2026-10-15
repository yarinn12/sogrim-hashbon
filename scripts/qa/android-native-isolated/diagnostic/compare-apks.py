"""Compare decompressed members of two isolated Debug APKs; never accept Native QA."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

SOURCE = '59b599c24341e4659bce62b02c9d78fce3dd050d'
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


def audit(product_path, control_path, fixture_path):
    product_path, control_path, fixture_path = map(lambda value: Path(value).resolve(),
                                                    (product_path, control_path, fixture_path))
    product, control = read_apk(product_path), read_apk(control_path)
    if set(product) != set(control):
        raise ValueError('APK member names differ: ' + repr(sorted(set(product) ^ set(control))))
    if INDEX not in product or b'android-native-qa-fixture.js' not in product[INDEX]:
        raise ValueError('Product APK lacks the isolated synthetic fixture index')
    fixture = fixture_path.read_bytes()
    if control[INDEX] != fixture or b'data-diagnostic-control="minimal-webview"' not in fixture:
        raise ValueError('Control APK index differs from the reviewed minimal fixture')
    changed = sorted(name for name in product if product[name] != control[name])
    if INDEX not in changed or any(name != INDEX and name not in SIGNATURE_METADATA for name in changed):
        raise ValueError('APK member delta exceeds exact index/signature allowlist: ' + repr(changed))
    members = {name: {'product': digest(product[name]), 'control': digest(control[name]),
                      'productBytes': len(product[name]), 'controlBytes': len(control[name])}
               for name in sorted(product)}
    return {'schemaVersion': 1, 'appSource': SOURCE, 'fixtureOnly': True,
            'nativeAcceptance': False, 'requiredSignerVerification': True,
            'variants': {
                'A': {'path': str(product_path), 'apkSha256': digest(product_path.read_bytes()),
                      'apkBytes': product_path.stat().st_size, 'indexSha256': digest(product[INDEX])},
                'B': {'path': str(control_path), 'apkSha256': digest(control_path.read_bytes()),
                      'apkBytes': control_path.stat().st_size, 'indexSha256': digest(control[INDEX])}},
            'reviewedControlIndexSha256': digest(fixture), 'changedMembers': changed,
            'signatureMetadataDifferences': sorted(set(changed) & SIGNATURE_METADATA),
            'memberCount': len(product), 'members': members}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: compare-apks.py PRODUCT.apk CONTROL.apk control-index.html')
    try:
        print(json.dumps(audit(*sys.argv[1:]), separators=(',', ':')))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
