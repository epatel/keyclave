# outputs

Pluggable backends that turn `(midi, velocity)` and pressure updates into sound or MIDI traffic. `clave.html` has a full `Output` abstraction; `clave-piano.html` skips it and exposes a single `Piano` object.

## Contract

```js
class Output {
  constructor(name) { this.ready = false; this.name = name; }
  async start() {}
  async stop()  {}
  noteOn(midi, velocity)  {}
  noteOff(midi)           {}
  aftertouch(midi, value) {}   // value 0..127, called as held depth changes
}
```

- `start()` runs once when the user clicks **Apply** (audio context creation, MIDI permission request, etc.). May throw — the UI catches and logs.
- `stop()` runs when switching modes or disconnecting. Should release every voice/port.
- `noteOn` / `noteOff` are called synchronously from `Detector` callbacks. Return fast; defer scheduling to the backend's own clock.

`outputFor(mode)` is the factory in `clave.html`:

```js
function outputFor(mode) {
  if (mode === 'midi')    return new MidiOutput();
  if (mode === 'sampler') return new SamplerOutput();
  return null;   // "off"
}
```

## MidiOutput

Wraps `navigator.requestMIDIAccess({ sysex: false })`. Picks the **first** available output port — if multiple ports are present and the user wants a specific one, this is where to add port selection. MIDI channel comes from the UI input (`#ch`).

Permission prompt fires at `start()` time. On macOS, the IAC Driver typically appears as an output once enabled in Audio MIDI Setup.

### Aftertouch

`MidiOutput.aftertouch(midi, value)` reads the aftertouch mode from the UI:

| Mode      | Sends                                          |
| --------- | ---------------------------------------------- |
| `off`     | nothing                                        |
| `poly`    | `[0xA0 | ch, note, value]` — polyphonic AT     |
| `channel` | `[0xD0 | ch, value]` — channel pressure        |
| `cc`      | `[0xB0 | ch, ccNumber, value]` — Control Change |

Polyphonic aftertouch is the closest fit when the receiver supports it (per-note resolution). Channel pressure is the most widely supported but collapses all held notes' aftertouch to one stream — useful for monophonic playing, lossy for polyphonic. CC mode is for driving specific synth parameters (CC 74 brightness, CC 11 expression, CC 1 mod wheel, etc.); the CC number is editable in the UI.

The Detector already throttles by suppressing emits when the quantized 7-bit value hasn't changed, so the MIDI bus only sees one message per discernible pressure step.

## SamplerOutput (clave.html scaffold)

Web Audio backend with a 2-osc placeholder synth (triangle + sine an octave up) so the audio path is verifiable end-to-end without samples. `loadSamples(urlMap)` decodes a `{ midi: url }` map and switches `noteOn` to the sample path automatically — nearest pitch wins, detune via `playbackRate = 2^((target - sampleMidi) / 12)`.

Voice tracking is a `Map<midi, { source, gain }>`; `noteOff(midi)` ramps `gain` down with an exponential, then stops the source. Re-triggering an already-held note in `noteOn` calls `noteOff(midi)` first to cut the previous voice cleanly.

## Piano (clave-piano.html)

Same structure as `SamplerOutput` but always-on samples: 30 Salamander notes every 3 semitones from A0 (MIDI 21) to C8 (108), fetched from `https://tonejs.github.io/audio/salamander/{Name}{Octave}.mp3`. Note-name file format uses `s` for sharps (`Cs4`, not `C#4`).

Specific to this object:

- **Velocity curve** is perceptual: `(vel / 127) ** 1.4 * 0.95`. Linear feels too loud at the bottom of the dynamic range.
- **Release tail** is configurable in the UI (default 0.6 s). Exponential ramp on `gain`, then `stop()`.
- **Master gain** is a `GainNode` between voices and `destination`; the volume slider updates it live.
- **Loading is async and non-blocking**: `noteOn` returns silently if no sample is loaded yet. The progress bar reflects fetch+decode status.

## Adding a new output

```js
class MyOutput extends Output {
  constructor() { super('my'); }
  async start()         { /* connect, request perms */ this.ready = true; }
  async stop()          { /* tear down */; this.ready = false; }
  noteOn(midi, vel)     { if (!this.ready) return; /* play */ }
  noteOff(midi)         { if (!this.ready) return; /* stop */ }
  aftertouch(midi, val) { if (!this.ready) return; /* optional */ }
}
// in outputFor():
if (mode === 'my') return new MyOutput();
// in HTML:
// <option value="my">My output</option>
```

Four things to remember:

- Guard every method against `!this.ready` so they're safe before `start()` resolves.
- `stop()` should be idempotent — the **Apply** button re-runs it on every mode switch.
- Output is a singleton; the previous instance is stopped before a new one starts. Don't hold global state outside the instance.
- `aftertouch` defaults to a no-op in the base class. Only implement it if your backend has somewhere to send the value.
