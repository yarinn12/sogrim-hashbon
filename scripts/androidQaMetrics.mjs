export function chooseAndroidDevice(devices, requestedDevice = "") {
  const requested = String(requestedDevice || "").trim();
  if (requested) {
    const selected = devices.find(({ serial }) => serial === requested);
    if (!selected) {
      const available = devices.map(({ serial }) => serial).join(", ") || "none";
      throw new Error(`ANDROID_QA_DEVICE=${requested} is not connected. Available devices: ${available}`);
    }
    return selected.serial;
  }

  if (devices.length > 1) {
    throw new Error(`Multiple Android devices are connected (${devices.map(({ serial }) => serial).join(", ")}). Set ANDROID_QA_DEVICE to choose one explicitly.`);
  }
  return devices[0]?.serial || "";
}

export function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1)
  };
}

export function parseSmokeResult(output, { run, fallbackMs }) {
  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("result is not an object");
    }
    return parsed;
  } catch (error) {
    return {
      ready: false,
      nativeLaunchMs: 0,
      interactiveMs: fallbackMs,
      milestones: {},
      inspectionError: `Run ${run} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
