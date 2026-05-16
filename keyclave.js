// keyclave.js — reusable layer for the FREE WOLF F68 Pro magnetic keyboard
//
// Exposes window.KC with:
//   KC.midiName(n), KC.isWhite(n), KC.clamp(lo,hi,v), KC.hex(u8), KC.NOTE_NAMES
//   KC.DEFAULT_MAPPING
//   KC.makeMapping({ storageKey, defaults, onChange }) → mapping instance
//   KC.F68                       → singleton HID protocol object
//   KC.makeDetector({ getThresholds, callbacks }) → detector instance
//
// Plain non-module script so it works from file://.  No build step.

(() => {
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const midiName = n => NOTE_NAMES[((n%12)+12)%12] + (Math.floor(n/12) - 1);
  const isWhite  = n => [0,2,4,5,7,9,11].includes(((n%12)+12)%12);
  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join(' ');

  // 24 keys, C3–B4.  Override in the consumer if needed.
  const DEFAULT_MAPPING = {
    "2": 48, "7": 49, "8": 50, "13": 51, "14": 52, "20": 53,
    "25": 54, "26": 55, "31": 56, "32": 57, "37": 58, "38": 59,
    "44": 60, "49": 61, "50": 62, "55": 63, "56": 64, "62": 65,
    "67": 66, "68": 67, "73": 68, "74": 69, "79": 70, "80": 71,
  };

  // ── Mapping ──────────────────────────────────────────────────────────────
  // Each consumer gets its own instance so localStorage keys don't collide.
  function makeMapping({
    storageKey = 'clave-map',
    defaults = DEFAULT_MAPPING,
    onChange = () => {},
  } = {}) {
    const m = {
      table: {},
      has(k)   { return k in this.table; },
      get(k)   { return this.table[k]; },
      set(k, midi)   { this.table[k] = midi; this.save(); },
      remove(k)      { delete this.table[k];  this.save(); },
      clearAll()     { this.table = {};                  this.save(); },
      resetToDefault() { this.table = { ...defaults };    this.save(); },
      replace(table) { this.table = { ...table };         this.save(); },
      save() {
        try { localStorage.setItem(storageKey, JSON.stringify(this.table)); } catch {}
        onChange(this);
      },
      load() {
        try {
          const j = localStorage.getItem(storageKey);
          this.table = j ? JSON.parse(j) : { ...defaults };
        } catch { this.table = { ...defaults }; }
        onChange(this);
      },
    };
    m.load();
    return m;
  }

  // ── F68 HID protocol ─────────────────────────────────────────────────────
  // Singleton — one F68 connection per page.
  const F68 = {
    VID: 0x3151,
    PID: 0x5029,
    devIn: null, devOut: null,
    featId: 0, featLen: 64,
    polling: false, pollCount: 0,
    log: () => {},       // overridable by consumer

    pkt(...b) {
      const a = new Uint8Array(this.featLen);
      for (let i = 0; i < Math.min(b.length, 7); i++) a[i] = b[i];
      let s = 0;
      for (let i = 0; i < 7; i++) s += a[i];
      a[7] = (0xff - s) & 0xff;
      return a;
    },
    async sendFeat(bytes) { await this.devOut.sendFeatureReport(this.featId, bytes); },
    async recvFeat() {
      return new Uint8Array((await this.devOut.receiveFeatureReport(this.featId)).buffer);
    },
    waitInput(pred, timeoutMs = 1500) {
      return new Promise(resolve => {
        let done = false;
        const handler = ev => {
          const b = new Uint8Array(ev.data.buffer);
          if (pred(b, ev.reportId)) {
            done = true;
            this.devIn.removeEventListener('inputreport', handler);
            resolve(b);
          }
        };
        this.devIn.addEventListener('inputreport', handler);
        setTimeout(() => {
          if (!done) {
            this.devIn.removeEventListener('inputreport', handler);
            resolve(null);
          }
        }, timeoutMs);
      });
    },

    async connect() {
      let ds = await navigator.hid.requestDevice({
        filters: [
          { vendorId: this.VID, productId: this.PID, usagePage: 0xffff, usage: 1 },
          { vendorId: this.VID, productId: this.PID, usagePage: 0xffff, usage: 2 },
        ],
      });
      if (!ds.length) ds = await navigator.hid.requestDevice({
        filters: [{ vendorId: this.VID, productId: this.PID }],
      });
      if (!ds.length) return false;

      for (const d of ds) {
        if (!d.opened) await d.open();
        this.log('opened', d.productName);
      }

      const reportSize = r => Math.ceil(((r.items || [])
        .reduce((s, it) => s + (it.reportSize || 0) * (it.reportCount || 0), 0)) / 8);
      this.devOut = ds.find(d => d.collections.some(c =>
        c.usagePage === 0xffff && (c.featureReports || []).length)) || ds[0];
      this.devIn = ds.find(d => d.collections.some(c =>
        c.usagePage === 0xffff && (c.inputReports || []).some(r => r.reportId === 5))) || ds[0];
      const vendorColl = this.devOut.collections.find(c =>
        c.usagePage === 0xffff && (c.featureReports || []).length);
      const fr = vendorColl && vendorColl.featureReports[0];
      if (fr) {
        this.featId = fr.reportId | 0;
        this.featLen = reportSize(fr) || 64;
      }
      this.log(`feature report id=${this.featId} len=${this.featLen}`);

      this.devIn.addEventListener('inputreport', e => {
        if (e.reportId !== 5) return;
        this.log('← state', hex(new Uint8Array(e.data.buffer).slice(0, 2)));
      });

      await this.enable();
      return true;
    },

    async enable() {
      this.log('→ 1c 01');
      await this.sendFeat(this.pkt(0x1c, 0x01));
      await new Promise(r => setTimeout(r, 150));
      this.log('→ 1c 00');
      const p1 = this.waitInput(b => b[0] === 0x0f && b[1] === 0x01);
      await this.sendFeat(this.pkt(0x1c, 0x00));
      await p1;
      await this.waitInput(b => b[0] === 0x0f && b[1] === 0x00, 500);
      this.log('→ 1e 01 (streaming)');
      await this.sendFeat(this.pkt(0x1e, 0x01));
      await new Promise(r => setTimeout(r, 50));
    },
    async disable() { try { await this.sendFeat(this.pkt(0x1e, 0x00)); } catch {} },

    async startPolling(onFrame, onProgress = () => {}) {
      this.polling = true; this.pollCount = 0;
      let bank = 0;
      let consecutiveErrors = 0;
      const MAX_ERRORS = 8;
      while (this.polling && this.devOut && this.devOut.opened) {
        try {
          await this.sendFeat(this.pkt(0xe5, 0xfe, 0x01, bank));
          onFrame(bank, await this.recvFeat());
          consecutiveErrors = 0;
          this.pollCount++;
          if ((this.pollCount & 31) === 0) onProgress(this.pollCount);
        } catch (err) {
          consecutiveErrors++;
          if (consecutiveErrors === 1) this.log('poll hiccup:', err.message, '(retrying)');
          if (consecutiveErrors >= MAX_ERRORS) {
            this.log(`poll failed ${consecutiveErrors}× — giving up`);
            break;
          }
          await new Promise(r => setTimeout(r, 20 * consecutiveErrors));
        }
        bank = (bank + 1) & 3;
        await new Promise(r => setTimeout(r, 2));
      }
      this.polling = false;
    },

    async shutdown() {
      this.polling = false;
      if (this.devOut) await this.disable();
      for (const d of [this.devIn, this.devOut]) {
        if (!d) continue;
        try { await d.close(); } catch {}
      }
      this.devIn = this.devOut = null;
    },
  };

  // ── Detector ─────────────────────────────────────────────────────────────
  // Per-key state machine.  Consumer supplies a `getThresholds()` callback
  // returning { arm, fire, release, vmax } (so it can read live UI values).
  function makeDetector({
    nkeys = 128,
    getThresholds = () => ({ arm: 60, fire: 280, release: 30, vmax: 12 }),
    bottom = 355,
    callbacks = {},
  } = {}) {
    const det = {
      prevDepth: new Int16Array(nkeys),
      lastT:     new Float64Array(nkeys),
      peakVel:   new Float32Array(nkeys),
      armed:     new Uint8Array(nkeys),
      on:        new Uint8Array(nkeys),
      lastPressure: new Int16Array(nkeys),   // last quantized 0..127 sent

      onPress:   callbacks.onPress   || null,  // (key, midiVel, peakV, depth)
      onRelease: callbacks.onRelease || null,  // (key)
      onPressure: callbacks.onPressure || null, // (key, midiValue 0..127, depth)

      velocityFromPeak(peak) {
        const { vmax } = getThresholds();
        const VMIN = 0.4, VMAX = vmax || 12;
        return clamp(1, 127, Math.round((peak - VMIN) / (VMAX - VMIN) * 107 + 20));
      },

      // Map depth past the fire threshold to MIDI 0..127.  At fire = 0, at
      // bottom-out = 127.  Useful for aftertouch / pressure controllers.
      pressureFromDepth(depth, fire) {
        const span = Math.max(1, bottom - fire);
        return clamp(0, 127, Math.round((depth - fire) * 127 / span));
      },

      processFrame(bank, data) {
        const now = performance.now();
        const { arm, fire, release, vmax } = getThresholds();
        const slotsPerBank = 32;
        for (let slot = 0; slot < slotsPerBank; slot++) {
          const off = slot * 2;
          if (off + 1 >= data.length) break;
          const d = data[off] | (data[off + 1] << 8);
          const key = bank * slotsPerBank + slot;
          if (key >= nkeys) break;
          const p = this.prevDepth[key];
          const lt = this.lastT[key];

          let dv = 0;
          if (lt) dv = (d - p) / Math.max(0.5, now - lt);
          this.lastT[key] = now;
          this.prevDepth[key] = d;
          if (dv > this.peakVel[key]) this.peakVel[key] = dv;

          if (!this.on[key]) {
            if (!this.armed[key] && d >= arm && d > p) this.armed[key] = 1;
            if (this.armed[key] && (d >= fire || this.peakVel[key] >= vmax)) {
              this.on[key] = 1;
              this.armed[key] = 0;
              this.lastPressure[key] = 0;
              const v = this.velocityFromPeak(this.peakVel[key]);
              this.onPress && this.onPress(key, v, this.peakVel[key], d);
            }
          } else if (d <= release) {
            this.on[key] = 0;
            this.armed[key] = 0;
            this.peakVel[key] = 0;
            this.lastPressure[key] = 0;
            this.onRelease && this.onRelease(key);
          } else if (this.onPressure) {
            // Streaming pressure while held; throttle to changes in the
            // quantized 7-bit value.
            const q = this.pressureFromDepth(d, fire);
            if (q !== this.lastPressure[key]) {
              this.lastPressure[key] = q;
              this.onPressure(key, q, d);
            }
          }
        }
      },

      releaseAll() {
        for (let k = 0; k < nkeys; k++) {
          if (this.on[k] && this.onRelease) this.onRelease(k);
          this.on[k] = 0;
          this.armed[k] = 0;
          this.peakVel[k] = 0;
          this.lastPressure[k] = 0;
        }
      },
    };
    return det;
  }

  // ── exports ──────────────────────────────────────────────────────────────
  window.KC = {
    NOTE_NAMES, midiName, isWhite, clamp, hex,
    DEFAULT_MAPPING,
    makeMapping,
    F68,
    makeDetector,
  };
})();
