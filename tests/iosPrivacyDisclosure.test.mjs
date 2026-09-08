import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Check the manifest actually bundled into the iOS target, not the prose checklist.
// These persisted user-data flows predate the disclosure and must not disappear
// from the native privacy declaration when new releases are prepared.
const disclosures = [
  ['NSPrivacyCollectedDataTypePhotosorVideos', 'profile, event and expense images'],
  ['NSPrivacyCollectedDataTypeContacts', 'account friendship/social graph'],
  ['NSPrivacyCollectedDataTypePurchaseHistory', 'user-entered expense purchases'],
  ['NSPrivacyCollectedDataTypeCustomerSupport', 'in-app feedback/support requests']
];

for (const [type, flow] of disclosures) {
  test(`iOS bundled privacy manifest discloses ${flow}`, async () => {
    const xml = await readFile('ios/App/App/PrivacyInfo.xcprivacy', 'utf8');
    const entries = [...xml.matchAll(/<dict>\s*<key>NSPrivacyCollectedDataType<\/key>([\s\S]*?)<\/dict>/g)];
    const matched = entries.map(match => match[1]).filter(entry => entry.includes(`<string>${type}</string>`));
    assert.equal(matched.length, 1, `${flow} must have exactly one ${type} declaration`);
    const entry = matched[0];
    assert.match(entry, /<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\s*\/>/, 'account data is identity-linked');
    assert.match(entry, /<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\s*\/>/, 'not cross-app tracking');
    assert.match(entry, /<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>\s*<string>NSPrivacyCollectedDataTypePurposeAppFunctionality<\/string>\s*<\/array>/, 'only app functionality, no advertising or analytics for this data');
  });
}
