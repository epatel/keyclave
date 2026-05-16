# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-based velocity-sensitive keyboard for the FREE WOLF F68 Pro magnetic (Hall-effect) keyboard. Two self-contained HTML files in `clave.html` (MIDI + sampler scaffold) and `clave-piano.html` (Salamander grand with sustain pedal). No build step, no dependencies — open the file in Chrome and it runs. State (mapping, sustain key) lives in `localStorage`. See `README.md` for user-facing setup.

## Dev loop

No build, lint, or tests. Edit a file, reload the Chrome tab, click **Connect**, pick **both** FREE WOLF F68 entries in the HID picker, press keys, watch the log pane. If the device is claimed by another tab (e.g. `iotdriver.qmk.top`), close it first — Chrome won't let the device be opened twice.

The `backup/` directory (gitignored) holds earlier development snapshots and a standalone WebHID sniffer; pull from it when the protocol needs re-derivation against a firmware change or a new analog keyboard.

## Context cards

Self-contained reference cards under `cards/`. Load the one whose trigger matches.

- [architecture](cards/architecture.md) — onboarding, cross-cutting work, dataflow questions, where layers connect
- [f68-protocol](cards/f68-protocol.md) — HID protocol, packet formats, enable handshake, polling, sniffer recovery, new keyboards
- [detector](cards/detector.md) — tweaking velocity, arm/fire/release thresholds, debugging missed or spurious notes
- [mapping](cards/mapping.md) — calibration flow, default mapping, localStorage persistence, JSON import/export
- [outputs](cards/outputs.md) — `Output` base class, MIDI routing, Web Audio sampler, adding a new backend
- [sustain-pedal](cards/sustain-pedal.md) — sustain behaviour, pedal-key assignment, why DOM `keydown` is unavailable

## Two-file invariant

`clave.html` and `clave-piano.html` mirror each other in sections 5 (HID protocol) and 6 (Detector). When changing either, **apply the change to both and diff to confirm.** Section banners number these identically.
