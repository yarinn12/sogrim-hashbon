// Pure layout decision from measured glyph widths; no platform or account state.
export function primaryNavigationNeedsTwoRows({ width, labelWidths, gap = 0, inlinePadding = 4 }) {
  if (!Number.isFinite(width) || width <= 0 || !Array.isArray(labelWidths) || !labelWidths.length
    || labelWidths.some(value => !Number.isFinite(value) || value < 0)
    || !Number.isFinite(gap) || gap < 0 || !Number.isFinite(inlinePadding) || inlinePadding < 0) return false;
  const cellWidth = (width - gap * (labelWidths.length - 1)) / labelWidths.length;
  return labelWidths.some(labelWidth => labelWidth + inlinePadding > cellWidth + 0.5);
}
