# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pair of self-contained HTML files that read **analog key depth** from the
FREE WOLF F68 Pro magnetic-switch keyboard over WebHID and turn it into MIDI
(`clave.html`) or play piano samples directly (`clave-piano.html`). No build
step, no dependencies, no server — open the file in Chrome and it runs.

`README.md` documents user-facing setup, tuning controls, calibration, and the
reverse-engineered HID protocol. Read it before working on the protocol or
adding new outputs.

## How to "run" / iterate

There is no build, lint, or test suite. The dev loop is:

1. `open -a "Google Chrome" /Users/epatel/xxx/test/keyclave/clave.html`
   (or `clave-piano.html`).
2. Edit the file. Reload the tab.
3. Click **Connect**, pick both FREE WOLF F68 entries in Chrome's HID picker,
   press keys and watch the log pane.

If the F68 was just connected to something else (e.g. iotdriver.qmk.top in
another tab), close that tab first — Chrome won't let the device be claimed
twice.

The `backup/` directory contains earlier development snapshots and the
standalone WebHID sniffer; it is gitignored. The sniffer is what we use when
the protocol changes or another keyboard appears: paste it into the DevTools
console on the vendor's web configurator and play with that UI to see which
`sendFeatureReport` / `receiveFeatureReport` packets the configurator sends.

## Architecture

Both HTML files are organized into the **same 8 numbered sections** (see the
banner comments). When changing protocol or detector logic, the two files
should usually move together — diff them before declaring work done.

```
1. Default mapping            (the bundled physical-key → MIDI-note table)
2. Utilities                  ($, log, midiName, isWhite, clamp, hex)
3. Mapping module             (load/save/clear, syncs to localStorage)
4. Output abstraction         (clave.html: Output base + MidiOutput +
                               SamplerOutput scaffold; clave-piano.html: just
                               the Piano sampler — no abstraction needed)
5. F68 HID protocol           (connect, enable handshake, poll loop)
6. Detector                   (frame parser → press/release callbacks)
7. Calibration                (next-press-records-mapping flow)
8. UI wiring                  (button handlers + Detector.onPress/onRelease)
```

### The HID layer is the load-bearing piece

The F68 Pro presents itself as **two HID interfaces**, and the protocol uses
both. This is not obvious from the descriptor alone:

- `devOut` — vendor collection `ffff/2`, accepts 64-byte feature reports.
  All commands (enable handshake, poll requests, disable) go here.
- `devIn`  — vendor collection `ffff/1`, fires input report id=5 with the
  mode-transition ACKs (`0f 01` / `0f 00`).

`F68.connect()` opens both, picks each by descriptor (`featureReports` for
out, `inputReports[id=5]` for in). If you change device selection, preserve
this two-device dance or input acks won't arrive and polling will return
all-zero frames.

### Detector is the layer that turns depth into musical events

`Detector.processFrame(bank, data)` runs per poll. Each 64-byte response is
32 little-endian 16-bit slots; key id = `bank*32 + slot`. Per-key state:

- **arm** when depth crosses arm-threshold *while rising*.
- Track peak `dv/dt`. `lastT[key]` is updated every frame (even idle) so a
  press that goes 0→bottom inside one poll cycle still gets a valid velocity
  estimate.
- **fire** when depth ≥ fire-threshold *or* peak velocity ≥ `vmax` (hard hits
  trigger early; soft hits wait until they reach bottom).
- **release** when depth ≤ release-threshold.

Consumers subscribe via `Detector.onPress(key, vel, peakV, depth)` and
`Detector.onRelease(key)`. They are nullable — `releaseAll()` calls
`onRelease` if set, so subscribers must be ready for it during shutdown.

### Output and mapping flow

`Detector.onPress` → `Calibration.record(key)` if calibrating, else
`Mapping.get(key)` → output's `noteOn(midi, vel)`. Unmapped keys are
silently dropped (this is intentional — only calibrated keys play).

`Mapping.save()` writes localStorage AND re-renders the mapping table; any
mutation through `Mapping.set` / `remove` / `clearAll` / `resetToDefault`
calls it. Don't write directly to `Mapping.table` from new code; go through
those methods so persistence and UI stay consistent.

### Sustain (clave-piano.html only)

The F68 stops sending normal HID keystrokes during analog streaming, so DOM
`keydown` for Space doesn't work. Instead `Sustain` lets the user designate
a physical key off the analog stream itself; that assignment persists in
localStorage. Sustain handling happens **before** the calibration/mapping
checks in `Detector.onPress`, so the pedal key never plays a note or gets
calibrated.

## Conventions

- Hex literal style is `0x1c`, byte arrays printed as space-separated hex.
- `pkt(...bytes)` builds a 64-byte feature report; byte 7 is the checksum
  (`0xff − sum(byte[0..6])`). All command packets share this layout.
- Default mapping (24 keys, C3–B4) is inlined as `DEFAULT_MAPPING`; user
  edits live in localStorage and the JSON download. **Reset to default**
  is the only way to wipe a saved mapping without devtools.
- `polling = true` is the loop's run flag; `Stop` flips it false and the
  loop drops out at the next iteration. Don't block inside the body.
- Two HTML files, no shared file. When the protocol or detector logic moves,
  apply the change to both. Diff to confirm.

## Working on the protocol

If the F68 firmware changes, or a new analog keyboard appears, the procedure
is the same one used to bring this up:

1. Run `backup/sniffer.js` in DevTools on the vendor's web configurator.
2. Walk through their UI; press a couple of keys.
3. `__hidSniffer.dump()` → paste the JSON to Claude.
4. Look for the enable command(s), the response layout (which bytes hold
   the data), and any per-key mapping. Update `F68.enable()` /
   `F68.startPolling()` accordingly.
