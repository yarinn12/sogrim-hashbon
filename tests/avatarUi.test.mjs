import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("profile offers a compact accessible avatar picker", async () => {
  const [app, layer, coherenceLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);

  assert.match(app, /function renderProfileAvatarPicker\(\)/);
  assert.match(app, /name="avatarPreset"/);
  assert.match(app, /data-action="profile-avatar"/);
  assert.match(app, /!profileAvatarImageDraft && profileAvatarDraft === preset\.id \? "checked" : ""/);
  assert.match(app, /class="profile-avatar-picker-shell"/);
  assert.match(app, /class="profile-avatar-picker-summary"/);
  assert.match(app, /if \(!localProfile \|\| screen\.name !== "profile"\) return picker/);
  assert.match(app, /profile-avatar-summary-preview img/);
  assert.match(app, /pickerShell\.open = false/);
  assert.match(app, /data-action="profile-avatar-image"[^>]*accept="image\/\*"/);
  assert.match(app, /data-action="profile-avatar-image"[^>]*capture="environment"/);
  assert.match(app, /profileAvatarPendingPreview = URL\.createObjectURL\(file\);[\s\S]*?render\(\);[\s\S]*?compressProfileAvatarImage\(file\)/);
  assert.doesNotMatch(app, /data-action="profile-avatar-url"/);
  assert.doesNotMatch(app, /action === "save-profile-avatar-url"/);
  assert.match(app, /async function persistProfileAvatarDraft\(\)/);
  assert.match(app, /await persistProfileAvatarDraft\(\)/);
  assert.match(app, /function compressProfileAvatarImage\(file\)/);
  assert.match(app, /maxLength: 180_000/);
  assert.match(app, /normalizeAvatarImage\(dataUrl\)/);
  assert.match(app, /stateResult\.value\?\.ok !== false/);
  assert.match(app, /stateResult\.value\?\.pending !== true/);
  assert.match(app, /const profileAvatarPickerIsOpen = Boolean\(/);
  assert.match(app, /app\.querySelector\("\.profile-avatar-picker-shell\[open\]"\)/);
  assert.match(app, /!profileAvatarPickerIsOpen &&/);
  assert.match(app, /PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY/);
  assert.match(app, /syncFriendProfile\(runtimeConfig, localProfile\)/);
  assert.match(layer, /\.profile-avatar-source-grid/);
  assert.doesNotMatch(layer, /\.profile-avatar-url-row/);
  assert.match(layer, /\.profile-avatar-options \{[\s\S]*?repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(layer, /input:checked[\s\S]*?\+ \.profile-avatar-preview/);
  assert.match(layer, /input:focus-visible[\s\S]*?\+ \.profile-avatar-preview/);
  assert.match(coherenceLayer, /\.profile-avatar-picker-shell[\s\S]*?> summary:focus-visible/);
  assert.match(coherenceLayer, /\.profile-shortcuts[\s\S]*?> \.secondary-button/);
});

test("gallery avatars stay out of auth metadata while syncing to the public profile", async () => {
  const [app, accountLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicAccountAuthLayer.mjs", "utf8")
  ]);

  assert.match(app, /syncFriendProfile\(runtimeConfig, localProfile\)/);
  assert.match(accountLayer, /normalizedAvatarImage\.startsWith\("https:\/\/"\)/);
  assert.match(accountLayer, /avatar_image: accountMetadataAvatarImage/);
});

test("participant avatars render branded images instead of initials", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("function renderAvatar(participantId, event = null)");
  const end = app.indexOf("function canCurrentParticipantEdit", start);
  const renderer = app.slice(start, end);

  assert.match(renderer, /avatarPresetForParticipant/);
  assert.match(renderer, /class="avatar has-picture/);
  assert.match(renderer, /<img src="\$\{escapeAttribute\(avatarSource\)\}"/);
  assert.doesNotMatch(renderer, /participantInitials|escapeHtml\(name\)/);
});

test("every signed-in screen carries the selected profile picture and greeting into the app header", async () => {
  const [app, brandLayer, ledgerLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /data-profile-avatar-src="\$\{escapeAttribute\(homeAvatarSource\)\}"/);
  assert.match(brandLayer, /import \{ loadLocalProfile \}/);
  assert.match(brandLayer, /function syncHeaderIdentity\(/);
  assert.match(brandLayer, /function resolveHeaderProfileIdentity\(/);
  assert.match(
    brandLayer,
    /const participantId = String\(profile\?\.participantId \?\? ""\)\.trim\(\)/
  );
  assert.match(
    brandLayer,
    /const displayName = String\(profile\?\.displayName \?\? ""\)\.trim\(\)/
  );
  assert.doesNotMatch(brandLayer, /currentState\.currentParticipantId/);
  assert.match(brandLayer, /avatarImage: profile\?\.avatarImage/);
  assert.match(brandLayer, /avatarSourceForParticipant/);
  assert.match(brandLayer, /function syncHeaderProfileAvatar\(/);
  assert.match(brandLayer, /const greeting = firstName \? `היי, \$\{firstName\}` : APP_TAGLINE/);
  assert.match(brandLayer, /if \(subtitle\.textContent !== greeting\)/);
  assert.match(brandLayer, /subtitle\.textContent = greeting/);
  assert.doesNotMatch(brandLayer, /if \(!isHome\) \{[\s\S]*?existingAvatar\?\.remove/);
  assert.match(brandLayer, /product-header-profile-avatar/);
  assert.match(brandLayer, /document\.createElement\("button"\)/);
  assert.match(brandLayer, /avatar\.dataset\.action = "edit-profile"/);
  assert.match(brandLayer, /avatar\.setAttribute\("aria-label", "פתיחת הפרופיל"\)/);
  assert.match(brandLayer, /\.product-header-profile-avatar:focus-visible/);
  assert.match(ledgerLayer, /\.product-header-profile-avatar \{/);
  assert.match(
    ledgerLayer,
    /\.product-brand-copy small \{[\s\S]*?display: block !important;[\s\S]*?text-overflow: ellipsis !important;/
  );
  assert.match(
    ledgerLayer,
    /\.product-header-profile-avatar \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/
  );
});

test("offline names use subdued grayscale avatars while connected accounts stay vivid", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /\.avatar\.is-offline\.has-picture > img \{[\s\S]*?filter: grayscale\(1\) saturate\(0\) contrast\(0\.86\) !important;[\s\S]*?opacity: 0\.46 !important;/
  );
  assert.match(
    layer,
    /\.avatar\.is-offline \{[\s\S]*?border-style: dashed !important;/
  );
  assert.doesNotMatch(
    layer,
    /\.avatar\.is-account\.has-picture > img \{[\s\S]*?grayscale/
  );
});

test("avatar assets and the preset module are available offline", async () => {
  const [sw, nativeBuilder, vercelConfig, vercelIgnore] = await Promise.all([
    readFile("sw.js", "utf8"),
    readFile("scripts/build-native-web.mjs", "utf8"),
    readFile("vercel.json", "utf8"),
    readFile(".vercelignore", "utf8")
  ]);

  for (let index = 1; index <= 6; index += 1) {
    assert.match(sw, new RegExp(`/assets/avatars/avatar-${index}\\.png`));
    assert.match(nativeBuilder, new RegExp(`assets/avatars/avatar-${index}\\.png`));
  }
  assert.match(sw, /\/src\/domain\/avatarPresets\.mjs/);
  assert.match(nativeBuilder, /mkdir\(join\(output, "assets", "avatars"\)/);
  assert.match(vercelConfig, /"assets\/\*\*"/);
  assert.match(vercelIgnore, /!assets\/avatars\/\*\.png/);
});
