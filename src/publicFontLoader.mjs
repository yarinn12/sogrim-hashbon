const fontStylesheet = document.getElementById("app-font-stylesheet");

if (fontStylesheet) {
  const activateFontStylesheet = () => {
    fontStylesheet.media = "all";
  };

  if (fontStylesheet.sheet) {
    activateFontStylesheet();
  } else {
    fontStylesheet.addEventListener("load", activateFontStylesheet, { once: true });
  }
}
