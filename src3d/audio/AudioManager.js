// Audio (Batch 11) — every sound in the game is synthesized with the Web Audio
// API at runtime. GAME_DESIGN.md §10 lists the wanted SFX/music but the project
// ships no audio assets, and the rebuild plan explicitly allows
// "WebAudio-synthesized" in place of a sample pack; generating the sounds in
// code also keeps the same philosophy as the rest of the 3D game (dragons,
// buildings and animations are all built from code, never from files).
//
// Nothing here touches game logic: main.js subscribes AudioManager to GameState
// events, so the audio layer is a pure listener like the HUD.
//
// Browsers refuse to start an AudioContext before a user gesture, so the
// context is created lazily on the first pointer/key event (see arm()).

const PREFS_KEY = 'dragonIsland3D.audio';

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// — Music tracks ————————————————————————————————————————————————
// Each track is a step function called by the lookahead scheduler once per
// eighth note: (audio, stepIndex, when, stepSec). Writing them as code rather
// than note tables keeps the patterns short and lets bars vary cheaply.

// C major, I–vi–IV–V — the "calm, whimsical loop" the design doc asks for.
const ISLAND_CHORDS = [
  [60, 64, 67], // C
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
];
// Offsets from the bar's chord root; -1 is a rest.
const ISLAND_LEAD = [0, 7, 12, 7, 4, -1, 9, 7, 0, 4, 12, 16, 12, -1, 7, 4];

// A minor, i–VI–III–VII — faster and heavier for the arena.
const BATTLE_CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [60, 64, 67], // C
  [55, 59, 62], // G
];
const BATTLE_LEAD = [0, 0, 12, 7, 0, 3, 7, 3, 0, 0, 12, 15, 12, 7, 3, 0];

const TRACKS = {
  island: {
    bpm: 92,
    step(a, i, t, dt) {
      const bar = Math.floor(i / 8) % 4;
      const chord = ISLAND_CHORDS[bar];
      const beat = i % 8;

      // Sustained pad under the whole bar.
      if (beat === 0) {
        for (const n of chord) {
          a.note(t, midiToFreq(n - 12), dt * 7.5, {
            type: 'sine',
            gain: 0.055,
            attack: 0.7,
            release: 1.4,
            music: true,
          });
        }
      }
      // Soft plucked bass on the half-bar.
      if (beat === 0 || beat === 4) {
        a.note(t, midiToFreq(chord[0] - 24), dt * 1.6, {
          type: 'sine',
          gain: 0.1,
          attack: 0.02,
          release: 0.35,
          music: true,
        });
      }
      // Music-box lead.
      const lead = ISLAND_LEAD[i % ISLAND_LEAD.length];
      if (lead >= 0) {
        a.note(t, midiToFreq(chord[0] + lead + 12), dt * 0.85, {
          type: 'triangle',
          gain: 0.06,
          attack: 0.01,
          release: 0.3,
          music: true,
        });
      }
    },
  },

  battle: {
    bpm: 142,
    step(a, i, t, dt) {
      const bar = Math.floor(i / 8) % 4;
      const chord = BATTLE_CHORDS[bar];
      const beat = i % 8;

      if (beat % 2 === 0) a.kick(t, true); // four-on-the-floor
      if (beat % 2 === 1) a.hat(t, true);

      // Driving eighth-note bass.
      a.note(t, midiToFreq(chord[0] - 24), dt * 0.8, {
        type: 'square',
        gain: 0.055,
        attack: 0.005,
        release: 0.06,
        music: true,
      });

      if (beat === 0) {
        for (const n of chord) {
          a.note(t, midiToFreq(n - 12), dt * 7, {
            type: 'sawtooth',
            gain: 0.022,
            attack: 0.05,
            release: 0.5,
            music: true,
          });
        }
      }

      const lead = BATTLE_LEAD[i % BATTLE_LEAD.length];
      if (lead >= 0) {
        a.note(t, midiToFreq(chord[0] + lead + 12), dt * 0.9, {
          type: 'square',
          gain: 0.045,
          attack: 0.008,
          release: 0.12,
          music: true,
        });
      }
    },
  },

  // The Black Room: no beat at all, just a slow breathing drone.
  blackroom: {
    bpm: 40,
    step(a, i, t, dt) {
      if (i % 4 !== 0) return;
      const root = [45, 45, 43, 48][Math.floor(i / 4) % 4];
      a.note(t, midiToFreq(root), dt * 4.5, {
        type: 'sine',
        gain: 0.07,
        attack: 1.2,
        release: 2.2,
        music: true,
      });
      a.note(t, midiToFreq(root + 7) * 1.003, dt * 4.5, {
        type: 'sine',
        gain: 0.035,
        attack: 1.6,
        release: 2.4,
        music: true,
      });
    },
  },
};

// — Sound effects ————————————————————————————————————————————————
// One entry per GAME_DESIGN.md §10 suggestion (plus a few the 3D game needs).
const SFX = {
  click: (a, t) => a.blip(t, 680, 0.045, { type: 'square', gain: 0.07 }),
  select: (a, t) => a.slide(t, 520, 780, 0.09, { type: 'triangle', gain: 0.08 }),
  error: (a, t) => a.slide(t, 240, 120, 0.22, { type: 'square', gain: 0.09 }),

  // Collect Apple — "soft pop or crunch".
  apple: (a, t) => {
    a.slide(t, 480, 900, 0.1, { type: 'triangle', gain: 0.11 });
    a.noise(t, 0.06, { freq: 2400, gain: 0.05, sweepTo: 900 });
  },
  // Break Rock — stone cracking.
  rock: (a, t) => {
    a.noise(t, 0.28, { freq: 1400, sweepTo: 260, q: 2, gain: 0.16 });
    a.slide(t + 0.01, 130, 62, 0.2, { type: 'sine', gain: 0.14 });
  },
  coin: (a, t) => a.arp(t, [988, 1319], 0.06, { type: 'square', gain: 0.07, dur: 0.09 }),

  // Dragon Spawn — magical shimmer.
  spawn: (a, t) => {
    a.arp(t, [659, 880, 1109, 1318], 0.055, { type: 'sine', gain: 0.075, dur: 0.32 });
    a.noise(t, 0.4, { freq: 3200, gain: 0.03, sweepTo: 6000, q: 3 });
  },
  // Pack Opening — card flip / reveal.
  pack: (a, t) => {
    a.noise(t, 0.09, { freq: 2600, sweepTo: 1200, gain: 0.1, q: 1 });
    a.arp(t + 0.06, [784, 1046, 1318], 0.05, { type: 'triangle', gain: 0.07, dur: 0.16 });
  },

  // Fireball — whoosh (the impact rides on the target's hurt sound).
  fire: (a, t) => a.noise(t, 0.34, { freq: 420, sweepTo: 2600, q: 5, gain: 0.09 }),
  arrow: (a, t) => a.noise(t, 0.16, { freq: 1800, sweepTo: 5200, q: 8, gain: 0.06 }),
  hit: (a, t) => {
    a.noise(t, 0.14, { freq: 900, sweepTo: 200, gain: 0.13 });
    a.slide(t, 320, 110, 0.16, { type: 'sawtooth', gain: 0.09 });
  },

  // Building Complete — hammer hits.
  build: (a, t) => {
    a.noise(t, 0.1, { freq: 700, sweepTo: 220, q: 3, gain: 0.15 });
    a.noise(t + 0.14, 0.14, { freq: 620, sweepTo: 160, q: 3, gain: 0.17 });
    a.slide(t + 0.14, 180, 90, 0.22, { type: 'sine', gain: 0.1 });
  },
  upgrade: (a, t) => a.arp(t, [523, 659, 784, 1046], 0.07, { type: 'triangle', gain: 0.085, dur: 0.3 }),
  // Level Up — triumphant jingle.
  levelup: (a, t) => a.arp(t, [523, 659, 784, 1046, 1318], 0.085, { type: 'square', gain: 0.07, dur: 0.34 }),

  // Caretaking.
  feed: (a, t) => {
    a.noise(t, 0.08, { freq: 800, sweepTo: 300, gain: 0.1 });
    a.noise(t + 0.13, 0.08, { freq: 700, sweepTo: 260, gain: 0.09 });
  },
  pet: (a, t) => a.arp(t, [880, 1174, 1568], 0.06, { type: 'sine', gain: 0.07, dur: 0.24 }),
  rest: (a, t) => a.slide(t, 420, 220, 0.55, { type: 'sine', gain: 0.09, attack: 0.05 }),

  victory: (a, t) => a.arp(t, [523, 659, 784, 1046, 1318, 1568], 0.1, { type: 'square', gain: 0.08, dur: 0.5 }),
  defeat: (a, t) => a.arp(t, [523, 466, 392, 311], 0.16, { type: 'sawtooth', gain: 0.07, dur: 0.55 }),
  // Game Over — somber tone.
  gameover: (a, t) => {
    a.arp(t, [392, 349, 311, 233], 0.28, { type: 'sine', gain: 0.11, dur: 1.4 });
    a.slide(t, 120, 55, 2.2, { type: 'sine', gain: 0.09, attack: 0.3 });
  },
  save: (a, t) => a.arp(t, [1046, 1568], 0.05, { type: 'sine', gain: 0.05, dur: 0.1 }),
  secret: (a, t) => a.arp(t, [330, 262, 220, 165], 0.22, { type: 'sine', gain: 0.06, dur: 1.1 }),
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sound = true; // SFX on/off
    this.music = true; // music on/off
    this.#loadPrefs();

    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuffer = null;

    this._trackName = null; // what SHOULD be playing
    this._timer = null; // lookahead scheduler interval
    this._step = 0;
    this._nextTime = 0;
    this._armed = false;
    this.onPrefsChanged = null; // UI hook: () => void
  }

  // — Preferences (survive reloads alongside the save file) —
  #loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      this.sound = prefs.sound !== false;
      this.music = prefs.music !== false;
    } catch {
      /* corrupt prefs: keep the defaults */
    }
  }

  #savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sound: this.sound, music: this.music }));
    } catch {
      /* private mode / quota: audio prefs just won't persist */
    }
  }

  // — Context setup ————————————————————————————————————————————
  /** Create the AudioContext on the first user gesture (autoplay policy). */
  arm() {
    if (this._armed) return;
    this._armed = true;
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const start = () => {
      events.forEach((e) => window.removeEventListener(e, start));
      const ctx = this.#ensureContext();
      if (!ctx) return;
      // resume() is async; only start the music scheduler once it has run,
      // otherwise currentTime is still frozen and nothing gets queued.
      const go = () => {
        if (this._trackName) this.#startScheduler();
      };
      ctx.resume().then(go, go);
    };
    events.forEach((e) => window.addEventListener(e, start));
  }

  #ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null; // no Web Audio: the game just runs silent
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.music ? 1 : 0;
    this.musicBus.connect(this.master);

    // One second of white noise, reused by every percussive effect.
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return this.ctx;
  }

  // — Synth primitives ————————————————————————————————————————
  #bus(isMusic) {
    return isMusic ? this.musicBus : this.sfxBus;
  }

  /** One enveloped oscillator note. */
  note(when, freq, dur, { type = 'sine', gain = 0.1, attack = 0.01, release = 0.12, music = false } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + attack);
    env.gain.setValueAtTime(gain, when + Math.max(attack, dur));
    env.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(attack, dur) + release);
    osc.connect(env).connect(this.#bus(music));
    osc.start(when);
    osc.stop(when + Math.max(attack, dur) + release + 0.02);
  }

  /** Short fixed-pitch note. */
  blip(when, freq, dur, opts = {}) {
    this.note(when, freq, dur, { release: 0.06, ...opts });
  }

  /** A note that glides from one pitch to another. */
  slide(when, from, to, dur, { type = 'sine', gain = 0.1, attack = 0.01, music = false } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + dur);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(env).connect(this.#bus(music));
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  /** Filtered noise burst — the basis of every crunch, whoosh and hammer hit. */
  noise(when, dur, { freq = 1200, sweepTo = null, q = 1, gain = 0.1, type = 'bandpass', music = false } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, when);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter).connect(env).connect(this.#bus(music));
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  /** A run of notes, `step` seconds apart — jingles, shimmers, fanfares. */
  arp(when, freqs, step, { type = 'sine', gain = 0.08, dur = 0.25, music = false } = {}) {
    freqs.forEach((f, i) => {
      const remaining = Math.max(0.05, dur - i * step);
      this.note(when + i * step, f, remaining, { type, gain, release: 0.18, music });
    });
  }

  kick(when, music = false) {
    this.slide(when, 150, 45, 0.14, { type: 'sine', gain: 0.22, music });
  }

  hat(when, music = false) {
    this.noise(when, 0.05, { freq: 7000, q: 1, gain: 0.035, type: 'highpass', music });
  }

  // — Public API ————————————————————————————————————————————————
  /** Play a named effect from the SFX table. Silent if muted or not yet armed. */
  sfx(name) {
    if (!this.sound) return;
    const recipe = SFX[name];
    if (!recipe) return;
    const ctx = this.#ensureContext();
    if (!ctx || ctx.state !== 'running') return; // still waiting for a gesture
    recipe(this, ctx.currentTime + 0.01);
  }

  /**
   * Switch the background loop. `null` stops music. Remembers the request even
   * when the context isn't running yet, so the right track starts on unlock.
   */
  playMusic(name) {
    if (this._trackName === name) return;
    this._trackName = name;
    this.#stopScheduler();
    if (!name) return;
    const ctx = this.#ensureContext();
    if (ctx && ctx.state === 'running') this.#startScheduler();
  }

  #startScheduler() {
    const track = TRACKS[this._trackName];
    if (!track || !this.ctx || this._timer) return;
    const stepSec = 60 / track.bpm / 2; // eighth notes
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.12;
    this._timer = setInterval(() => {
      // Schedule every step that falls inside the next 200ms.
      while (this._nextTime < this.ctx.currentTime + 0.2) {
        if (this.music) track.step(this, this._step, this._nextTime, stepSec);
        this._step++;
        this._nextTime += stepSec;
      }
    }, 25);
  }

  #stopScheduler() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  setSound(on) {
    this.sound = on;
    this.#savePrefs();
    this.onPrefsChanged?.();
  }

  setMusic(on) {
    this.music = on;
    if (this.musicBus) {
      // Fade rather than cut, so toggling mid-note doesn't click.
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
      this.musicBus.gain.linearRampToValueAtTime(on ? 1 : 0, now + 0.25);
    }
    if (on) {
      const ctx = this.#ensureContext();
      if (ctx && ctx.state === 'running' && this._trackName) this.#startScheduler();
    }
    this.#savePrefs();
    this.onPrefsChanged?.();
  }

  /** Release the scheduler (page unload). */
  dispose() {
    this.#stopScheduler();
  }
}
