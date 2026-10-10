// Command icons inject a static template directly; bundle it in its original
// module position so later Circle/Ledger rules retain their cascade priority.
export function nativeStaticCssTemplatePattern(sourcePath) {
  return /(?:^|[\\/])publicCommandIconLayer\.mjs$/.test(sourcePath)
    ? /((?:const CSS|style\.textContent) = )`([\s\S]*?)`;/g
    : /(const CSS = )`([\s\S]*?)`;/g;
}
