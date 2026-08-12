import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public command icon layer loads after the home navigation helper", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicCommandIconLayer\.mjs/);
  assert.ok(
    index.indexOf("publicHomeButtonLayer.mjs") <
      index.indexOf("publicCommandIconLayer.mjs")
  );
});

test("public command icon layer adds action icons and removes duplicate event from the grid", async () => {
  const layer = await readFile("src/publicCommandIconLayer.mjs", "utf8");

  assert.match(layer, /COMMAND_ICONS/);
  assert.match(layer, /command-card-icon/);
  assert.match(layer, /button-action-icon/);
  assert.match(layer, /"new-event"/);
  assert.match(layer, /getButtonAction/);
  assert.match(layer, /הצטרפות לאירוע/);
  assert.match(layer, /\.hero-actions button,/);
  assert.match(layer, /hideDuplicateEventCard/);
  assert.match(layer, /data-action="duplicate-event"/);
  assert.match(layer, /"open-event-settings"/);
  assert.match(layer, /existingIcon\.innerHTML = icon/);
  assert.match(layer, /button\.querySelector\("\.command-card-icon"\)/);
  assert.match(layer, /button\.querySelector\("\.button-action-icon"\)\?\.remove\(\)/);
});

test("settings command icon uses a clean sliders mark instead of an uneven gear", async () => {
  const [app, layer, icons] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicCommandIconLayer.mjs", "utf8"),
    readFile("src/uiIcons.mjs", "utf8")
  ]);

  assert.match(app, /iconSvg\("sliders"\)/);
  assert.match(layer, /"open-event-settings": "sliders"/);
  assert.match(icons, /M4 7h16/);
  assert.match(icons, /M4 12h16/);
  assert.match(icons, /M4 17h16/);
  assert.doesNotMatch(icons, /M19\.4 15a1\.7/);
});

test("shared icon source owns navigation, dialog and destructive action marks", async () => {
  const [icons, app, brand, commandLayer, backLayer, pickerLayer, referralLayer, premiumLayer, coherence] = await Promise.all([
    readFile("src/uiIcons.mjs", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8"),
    readFile("src/publicCommandIconLayer.mjs", "utf8"),
    readFile("src/publicBackNavigationLayer.mjs", "utf8"),
    readFile("src/publicChoicePickerLayer.mjs", "utf8"),
    readFile("src/publicReferralRewardsLayer.mjs", "utf8"),
    readFile("src/publicPremiumBillingLayer.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);

  assert.match(icons, /stroke-width="1\.8"/);
  assert.match(icons, /trash:/);
  assert.match(icons, /"user-minus":/);
  assert.match(app, /iconSvg\("x"\)/);
  assert.match(app, /iconSvg\("user-minus"\)/);
  assert.match(brand, /iconSvg\("home"\)/);
  assert.match(commandLayer, /"delete-event": "trash"/);
  assert.match(commandLayer, /"remove-event-participant": "user-minus"/);
  assert.match(backLayer, /iconSvg\("chevron-left"\)/);
  assert.match(pickerLayer, /iconSvg\("x"\)/);
  assert.match(referralLayer, /iconSvg\("share"\)/);
  assert.match(premiumLayer, /iconSvg\("sparkle"\)/);
  assert.match(coherence, /\.ui-icon-svg \{[\s\S]*?width: 20px !important;[\s\S]*?height: 20px !important;/);
  assert.match(coherence, /\.referral-reward-action > \.ui-icon-svg \{[\s\S]*?width: 18px !important;/);
});
