export function scaledFontSizeMatches(actual, baseline, scale, tolerance = .2) {
  return Number.isFinite(actual) && Number.isFinite(baseline) && Number.isFinite(scale)
    && actual > 0 && baseline > 0 && scale > 0 && Math.abs(actual - baseline * scale) < tolerance;
}
