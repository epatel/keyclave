# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-based velocity-sensitive keyboard for the FREE WOLF F68 Pro magnetic (Hall-effect) keyboard. A reusable layer (`keyclave.js`, exposed as `window.KC`) holds the HID protocol, Detector, and Mapping. Two frontends consume it: `clave.html` (MIDI + sampler scaffold, with aftertouch) and `clave-piano.html` (Salamander grand with sustain pedal). No build step, no dependencies — open the HTML in Chrome and it runs. State lives in `localStorage`. See `README.md` for user-facing setup.

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

## Layering

Protocol and Detector live in `keyclave.js` — change them once. The HTML frontends only hold their own UI, output wiring, and (in `clave-piano.html`) the sustain pedal. They have **no shared frontend code** beyond what `KC` exposes.

## Keep these docs current

When you change code, update the docs in the same commit. They're the only way the next agent (and the next you) finds these details quickly.

- **`CLAUDE.md` (this file)** — update **Overview** when the file set or top-level layering changes, **Dev loop** when the build/run story changes (it currently shouldn't), and **Context cards** when adding/removing/renaming a card. Keep it short — anything specific belongs in a card.
- **`cards/`** — touch every card whose trigger area is affected. A change to the HID packet format hits `f68-protocol`; new Detector events hit `detector` and (likely) `architecture`; a new Output backend hits `outputs`. Honour the cards rule: **self-contained, no cross-card "see also" links** — if two cards need the same fact, hoist it into a third.
- **`README.md`** — user-facing surface only (controls, calibration UI, knobs the user touches). Don't restate card content here.
- **Diagrams** — when you add or change one, prefer mermaid over ASCII. The state machine in `cards/detector.md` and the dataflow in `cards/architecture.md` are the load-bearing ones; keep them honest.

If you change `KC`'s public surface, also update the README "use it from your own page" example block.
