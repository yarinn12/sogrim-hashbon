// The original Native boot gate waits once, then makes at most 180 getprop
// observations one second apart. A transient ADB transport loss can occur
// after wait-for-device; only the two explicit read-only transport errors are
// tolerated within that unchanged budget.
const WAIT_TIMEOUT_MS = 240000;
const PROBE_COUNT = 180;
const PROBE_INTERVAL_MS = 1000;
const transientTransport = /^(?:(?:adb:\s*)?error:\s*|adb:\s*)?(?:device offline|device 'emulator-5582' not found)$/;

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function rawResult(result) {
  return {
    status: Number.isInteger(result?.status) ? result.status : null,
    stdout: result?.stdout == null ? '' : String(result.stdout),
    stderr: result?.stderr == null ? '' : String(result.stderr),
    signal: result?.signal ?? null,
    timedOut: result?.timedOut === true,
    error: result?.error == null ? null : String(result.error),
  };
}

function cleanSuccess(raw) {
  return raw.status === 0 && !raw.timedOut && !raw.signal && !raw.error;
}

export async function awaitOwnedBoot({waitForDevice, assertOwner, getBootCompleted, recordObservation = () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  let wait;
  try { wait = rawResult(await waitForDevice(WAIT_TIMEOUT_MS)); }
  catch (error) {
    await recordObservation({phase: 'wait-for-device', code: 'WAIT_FOR_DEVICE_FAILED', error: error.stack || String(error)});
    throw error;
  }
  if (!cleanSuccess(wait)) {
    await recordObservation({phase: 'wait-for-device', code: 'WAIT_FOR_DEVICE_FAILED', ...wait});
    throw failure('WAIT_FOR_DEVICE_FAILED', 'Original wait-for-device failed');
  }
  await recordObservation({phase: 'wait-for-device', code: 'WAIT_FOR_DEVICE_READY', ...wait});

  for (let attempt = 1; attempt <= PROBE_COUNT; attempt++) {
    try { await assertOwner(); }
    catch (error) {
      await recordObservation({phase: 'owner', attempt, code: 'OWNER_FAILED', error: error.stack || String(error)});
      throw error;
    }
    let raw;
    try { raw = rawResult(await getBootCompleted()); }
    catch (error) {
      await recordObservation({phase: 'probe', attempt, code: 'BOOT_PROBE_FAILED', error: error.stack || String(error)});
      throw error;
    }
    const value = raw.stdout.trim();
    if (cleanSuccess(raw) && value === '1') {
      await recordObservation({phase: 'probe', attempt, code: 'BOOT_READY', ...raw});
      return {booted: true, attempts: attempt};
    }
    if (cleanSuccess(raw) && (value === '' || value === '0')) {
      await recordObservation({phase: 'probe', attempt, code: 'BOOT_PENDING', ...raw});
    } else if (raw.status === 1 && !raw.timedOut && !raw.signal && !raw.error && value === '' && transientTransport.test(raw.stderr.trim())) {
      await recordObservation({phase: 'probe', attempt, code: 'TRANSIENT_TRANSPORT', ...raw});
    } else {
      await recordObservation({phase: 'probe', attempt, code: 'BOOT_PROBE_FAILED', ...raw});
      throw failure('BOOT_PROBE_FAILED', 'Unrecognized or terminal boot probe result');
    }
    await sleep(PROBE_INTERVAL_MS);
  }
  await recordObservation({phase: 'budget', code: 'BOOT_BUDGET_EXHAUSTED', attempts: PROBE_COUNT});
  throw failure('BOOT_BUDGET_EXHAUSTED', 'Original boot budget exhausted');
}
