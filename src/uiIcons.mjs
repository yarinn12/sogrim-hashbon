const iconShapes = {
  accessibility: '<circle cx="12" cy="4.5" r="2"/><path d="M5 8.5c4.7 2 9.3 2 14 0M12 7v6M8.5 20l3.5-7 3.5 7M8.5 12.5 6 17M15.5 12.5 18 17"/>',
  archive: '<path d="M4 7h16"/><path d="M6 7v12h12V7"/><path d="M9 11h6"/><path d="M5 4h14v3H5z"/>',
  balance: '<path d="M5 7h14"/><path d="M8 7 5.5 13h5L8 7Z"/><path d="M16 7 13.5 13h5L16 7Z"/><path d="M12 4.5v14"/><path d="M8.5 19.5h7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  calculator: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>',
  camera: '<path d="M8.5 6 10 4h4l1.5 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  coins: '<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5.8 0 1.6-.1 2.3-.3"/><path d="M4 11v4c0 1.4 2.2 2.5 5 2.5.7 0 1.3-.1 1.9-.2"/><circle cx="17" cy="16" r="4"/><path d="M17 13.8v4.4M15.5 15h2.3a1.2 1.2 0 0 1 0 2.4h-2.6"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 3v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M5 17.5V20h14v-2.5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  "eye-off": '<path d="m4 4 16 16"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15.8 15.8 0 0 1-2.1 2.8M6.3 7.2A15.5 15.5 0 0 0 2.5 12s3.5 6 9.5 6c1 0 1.9-.2 2.8-.5"/><path d="M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6"/>',
  gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7H8.5a2.5 2.5 0 1 1 2.5-2.5L12 7Zm0 0h3.5A2.5 2.5 0 1 0 13 4.5L12 7Z"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
  home: '<path d="M4.5 11.5 12 5l7.5 6.5"/><path d="M6.5 10.5v8h11v-8"/><path d="M10 18.5v-4h4v4"/>',
  link: '<path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  "log-in": '<path d="M5 12h10"/><path d="m11 8 4 4-4 4"/><path d="M16 5h2.2A1.8 1.8 0 0 1 20 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H16"/>',
  "log-out": '<path d="M19 12H9"/><path d="m13 8-4 4 4 4"/><path d="M8 5H5.8A1.8 1.8 0 0 0 4 6.8v10.4A1.8 1.8 0 0 0 5.8 19H8"/>',
  more: '<circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none"/>',
  message: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 12.5z"/><path d="M8 8h8M8 11h5"/>',
  "plus-square": '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>',
  receipt: '<path d="M8 4.5h8A2.5 2.5 0 0 1 18.5 7v13l-2.7-1.5L13.2 20 12 19.3 10.8 20l-2.6-1.5L5.5 20V7A2.5 2.5 0 0 1 8 4.5Z"/><path d="M9.5 9h5M9.5 13h5M9.5 17h3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  share: '<circle cx="6.5" cy="12" r="3"/><circle cx="17.5" cy="6.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="m9.2 10.7 5.6-2.8M9.2 13.3l5.6 2.8"/>',
  sparkle: '<path d="m12 3 1.1 3.2a5.2 5.2 0 0 0 3.2 3.2l3.2 1.1-3.2 1.1a5.2 5.2 0 0 0-3.2 3.2L12 18l-1.1-3.2a5.2 5.2 0 0 0-3.2-3.2l-3.2-1.1 3.2-1.1a5.2 5.2 0 0 0 3.2-3.2L12 3Z"/><path d="m19 16 .5 1.4a2.5 2.5 0 0 0 1.4 1.4l1.1.4-1.1.4a2.5 2.5 0 0 0-1.4 1.4l-.5 1.4-.5-1.4a2.5 2.5 0 0 0-1.4-1.4l-1.1-.4 1.1-.4a2.5 2.5 0 0 0 1.4-1.4L19 16Z"/>',
  sliders: '<path d="M4 7h16"/><circle cx="9" cy="7" r="2"/><path d="M4 12h16"/><circle cx="15" cy="12" r="2"/><path d="M4 17h16"/><circle cx="11" cy="17" r="2"/>',
  transfers: '<path d="M5 8h12"/><path d="m14 5 3 3-3 3"/><path d="M19 16H7"/><path d="m10 13-3 3 3 3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/><path d="M10 11v5M14 11v5"/>',
  user: '<circle cx="12" cy="8" r="3.25"/><path d="M6.2 19v-1.2c0-2.7 2.4-4.8 5.8-4.8s5.8 2.1 5.8 4.8V19"/>',
  "user-check": '<circle cx="8.5" cy="8" r="3"/><path d="M4 19v-1.2c0-2.2 1.9-4 4.5-4 1.4 0 2.6.5 3.4 1.2"/><path d="m15 16 2 2 4-5"/>',
  "user-minus": '<circle cx="9" cy="8" r="3"/><path d="M3.8 19v-1.1c0-2.5 2.2-4.4 5.2-4.4 1.5 0 2.8.5 3.7 1.3"/><path d="M16 16.5h5"/>',
  "user-plus": '<circle cx="8.5" cy="8" r="3"/><path d="M4 19v-1.2c0-2.2 1.9-4 4.5-4 1.4 0 2.6.5 3.4 1.2"/><path d="M17 12v8M13 16h8"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M4.5 19v-1.1c0-2.2 1.9-4 4.5-4s4.5 1.8 4.5 4V19"/><path d="M16.5 11.2a2.7 2.7 0 1 0 0-5.4"/><path d="M15.4 14.2c2.4.4 4.1 1.8 4.1 3.7V19"/>',
  "users-list": '<circle cx="8.5" cy="8" r="3"/><path d="M4 19v-1.2c0-2.2 1.9-4 4.5-4s4.5 1.8 4.5 4V19"/><path d="M16 7h4M16 11h4M16 15h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>'
};

export function iconSvg(name) {
  const shape = iconShapes[name] ?? "";
  return `<svg class="ui-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${shape}</svg>`;
}

export function hasIcon(name) {
  return Object.hasOwn(iconShapes, name);
}
