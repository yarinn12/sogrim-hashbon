import {iconSvg} from "../uiIcons.mjs";
import {renderImageSelectionFeedback} from "./imageSelectionFeedback.mjs";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"}[character]));

// The app owns normalization, image processing, persistence and acknowledgement.
export function renderProfileAvatarPickerView({
  presets = [], selectedPresetId = "", selectedSource = "", hasImage = false, editing = false, imageFeedback = ""
} = {}) {
  const picker = `
    <fieldset class="profile-avatar-picker">
      <legend>${editing ? "תמונות מוכנות" : hasImage ? "או בחר תמונה מוכנה" : "בחר תמונת פרופיל"}</legend>
      <div class="profile-avatar-options">
        ${presets.map(preset => `
          <label class="profile-avatar-option" title="${escapeHtml(preset.label)}">
            <input type="radio" name="avatarPreset" value="${escapeHtml(preset.id)}" data-action="profile-avatar" ${!hasImage && selectedPresetId === preset.id ? "checked" : ""} />
            <span class="profile-avatar-preview" aria-hidden="true">
              <img src="${escapeHtml(preset.src)}" alt="" width="256" height="256" loading="eager" decoding="async" />
            </span>
            <span class="visually-hidden">${escapeHtml(preset.label)}</span>
          </label>`).join("")}
      </div>
    </fieldset>`;

  if (!editing) return picker;

  return `
    <details class="profile-avatar-picker-shell avatar-selection-review" ${imageFeedback ? "open" : ""}>
      <summary class="profile-avatar-picker-summary">
        <span class="profile-avatar-summary-preview" aria-hidden="true">
          <img src="${escapeHtml(selectedSource)}" alt="" width="256" height="256" loading="eager" decoding="async" />
        </span>
        <span class="profile-avatar-summary-copy">
          <strong>תמונת פרופיל</strong>
          <small>${hasImage ? "החלפה או הסרה" : "בחירת תמונה"}</small>
        </span>
        <span class="profile-avatar-summary-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="profile-avatar-picker-body">
        ${renderImageSelectionFeedback(imageFeedback)}
        <div class="profile-avatar-source-grid">
          <button class="secondary-button profile-avatar-upload" type="button" data-action="choose-profile-avatar-image" data-image-source="gallery" aria-label="בחירת תמונת פרופיל מהגלריה">
            <span class="profile-avatar-source-icon" aria-hidden="true">${iconSvg("image")}</span>
            <span class="profile-avatar-source-copy"><strong>בחירה מהגלריה</strong></span>
            <span class="profile-avatar-source-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
          <input data-action="profile-avatar-image" data-image-source="gallery" type="file" accept="image/*" hidden />
          <button class="secondary-button profile-avatar-upload" type="button" data-action="choose-profile-avatar-image" data-image-source="camera" aria-label="צילום תמונת פרופיל במצלמה">
            <span class="profile-avatar-source-icon" aria-hidden="true">${iconSvg("camera")}</span>
            <span class="profile-avatar-source-copy"><strong>צילום תמונה</strong></span>
            <span class="profile-avatar-source-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
          <input data-action="profile-avatar-image" data-image-source="camera" type="file" accept="image/*" capture="environment" hidden />
          ${hasImage ? '<button class="secondary-button" type="button" data-action="remove-profile-avatar-image">הסרת התמונה</button>' : ""}
        </div>
        ${picker}
      </div>
    </details>`;
}
