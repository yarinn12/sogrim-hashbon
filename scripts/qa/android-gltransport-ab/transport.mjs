import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PIN} from './policy.mjs';

export const BUFFERS = Object.freeze({
  'hw.gltransport.asg.writeBufferSize': '1048576',
  'hw.gltransport.asg.writeStepSize': '4096',
  'hw.gltransport.asg.dataRingSize': '32768',
  'hw.gltransport.drawFlushInterval': '800',
});
export const GUEST_PROPERTIES = Object.freeze([
  'ro.boot.hardware.gltransport', 'ro.boot.qemu.gltransport.name',
  'ro.boot.qemu.gltransport', 'ro.hardware.egl', 'ro.hardware.gralloc',
]);

function value(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = [...text.matchAll(new RegExp('(?:^|\\|)\\s*' + escaped + '\\s*=\\s*"?([^"\\s]+)"?\\s*$', 'gm'))];
  assert.ok(rows.length > 0, 'Missing effective host evidence: ' + key);
  assert.equal(new Set(rows.map(r => r[1])).size, 1, 'Conflicting effective host evidence: ' + key);
  return rows[0][1];
}

export function assertTransportSupport(bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), PIN.hardwarePropertiesSha256, 'Exact emulator hardware schema drift');
  const block = bytes.toString('utf8').split(/\r?\n\s*\r?\n/).find(b => /^name\s*=\s*hw\.gltransport\s*$/m.test(b));
  assert.ok(block, 'SDK has no hw.gltransport declaration');
  assert.match(block, /^enum\s*=\s*tcp, pipe, virtio-gpu, asg\s*$/m);
  return {supported: true, sha256: PIN.hardwarePropertiesSha256};
}

export function assertTransportSelection(log, guest, transport) {
  assert.ok(['pipe', 'asg'].includes(transport), 'Unexpected transport treatment');
  for (const key of ['hw.gltransport', 'androidboot.hardware.gltransport', 'androidboot.qemu.gltransport.name'])
    assert.equal(value(log, key), transport, 'Transport override/fallback: ' + key);
  for (const key of GUEST_PROPERTIES.slice(0, 2)) assert.equal(guest[key], transport, 'Guest transport not applied: ' + key);
  assert.ok(guest['ro.boot.qemu.gltransport'] === '' || guest['ro.boot.qemu.gltransport'] === transport, 'Conflicting guest legacy transport property');
  assert.equal(guest['ro.hardware.egl'], 'emulation', 'Guest EGL driver changed');
  assert.equal(guest['ro.hardware.gralloc'], 'ranchu', 'Guest gralloc changed');
  for (const [key, expected] of Object.entries(BUFFERS)) assert.equal(value(log, key), expected, 'Buffer drift: ' + key);
  for (const feature of ['Minigbm', 'VirtioGpuNext']) assert.equal(value(log, 'gfxstreamFeature:' + feature), '0', 'Host graphics path changed: ' + feature);
  assert.doesNotMatch(log, /(?:Failed to create .*AddressSpace|Trying to create ASG stream in unsupported|gltransport.*fallback)/i);
  return {verified: true, transport, guest, buffers: BUFFERS,
    evidence: 'effective host configuration plus guest driver selection properties',
    streamExecutionProven: false};
}

export function normalizedAvdConfig(text, avd, transport) {
  const rows = text.split(/\r?\n/).filter(l => l.trim() && !/^\s*[#;]/.test(l));
  const config = {};
  for (const row of rows) {
    const at = row.indexOf('='); assert.ok(at > 0, 'Malformed AVD setting');
    const key = row.slice(0, at).trim(), val = row.slice(at + 1).trim();
    assert.ok(!(key in config), 'Duplicate AVD setting: ' + key);
    config[key] = val.split(avd).join('<owned-avd>');
  }
  assert.equal(config['hw.gltransport'], transport);
  delete config['hw.gltransport'];
  return Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b)));
}
