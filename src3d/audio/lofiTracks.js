// Lofi arrangements of public-domain German songs — the island soundtrack,
// one song per place (main.js picks which). Same philosophy as AudioManager:
// no samples. Each song is written as data (bars of chord voicing + bass +
// melody) and a shared lofi band plays it: felt piano / Rhodes / music box /
// guitar / cello voices, a swung sixteenth-note kit, and per-song ambience
// (rain, birds, fire, chimes, vinyl). AudioManager adds the rest of the lofi
// sound (lowpass and tape wobble) through its 'lofi' bus.
//
// Melody bars are "Note/eighths" tokens — `G4/2` is a quarter note, `Ab4/0.5`
// a sixteenth, `r` a rest. Chords are explicit voicings so they can be
// re-harmonised with jazz colours (maj9, m9, 13sus …).
//
// Sources for the melodies: Mutopia (Der Mond, Schulz 1790), Wikibooks
// Liederbuch (Die Gedanken sind frei, Kein schöner Land), Carus Liederprojekt
// (Der Lindenbaum, Silcher's version of Schubert).

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_BASE[m[1]] + acc;
}

/** "E5/1 r/0.5 A4/1.5" → { notes: [{ step, midi, len }], steps } in sixteenths (rests dropped). */
export function parseMelody(src) {
  const notes = [];
  let step = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const [name, len] = tok.split('/');
    const steps = Number(len) * 2;
    if (!(steps > 0) || !Number.isInteger(steps)) throw new Error(`Bad length in token: ${tok}`);
    if (name !== 'r') notes.push({ step, midi: noteToMidi(name), len: steps });
    step += steps;
  }
  return { notes, steps: step };
}

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = Math.random;

// — Instruments ———————————————————————————————————————————————————
// (a, when, freq, durSec, gain). Everything melodic goes through the 'lofi' bus.
const VOICES = {
  rhodes(a, when, freq, dur, gain) {
    const release = Math.max(0.4, dur * 1.2);
    a.note(when, freq, 0.04, { type: 'sine', gain, attack: 0.01, release, music: 'lofi' });
    a.note(when, freq * 1.0035, 0.04, { type: 'sine', gain: gain * 0.55, attack: 0.01, release, music: 'lofi' });
    a.note(when, freq * 2, 0.02, { type: 'triangle', gain: gain * 0.25, attack: 0.004, release: 0.2, music: 'lofi' });
  },
  // Soft hammer, quick decay, a little upper partial — the "felt piano".
  felt(a, when, freq, dur, gain) {
    const release = Math.min(1.4, Math.max(0.3, dur * 0.9));
    a.note(when, freq, 0.03, { type: 'sine', gain, attack: 0.006, release, music: 'lofi' });
    a.note(when, freq * 2, 0.02, { type: 'sine', gain: gain * 0.2, attack: 0.006, release: release * 0.5, music: 'lofi' });
    a.note(when, freq * 3, 0.01, { type: 'sine', gain: gain * 0.07, attack: 0.004, release: 0.15, music: 'lofi' });
  },
  musicBox(a, when, freq, dur, gain) {
    a.note(when, freq, 0.01, { type: 'sine', gain, attack: 0.003, release: 1.0, music: 'lofi' });
    a.note(when, freq * 4, 0.01, { type: 'sine', gain: gain * 0.15, attack: 0.002, release: 0.3, music: 'lofi' });
  },
  // Plucked nylon-ish string: a saw for the pick, a triangle for the body.
  guitar(a, when, freq, dur, gain) {
    a.note(when, freq, 0.01, { type: 'sawtooth', gain: gain * 0.45, attack: 0.003, release: Math.max(0.2, dur * 0.8), music: 'lofi' });
    a.note(when, freq, 0.01, { type: 'triangle', gain, attack: 0.003, release: Math.max(0.3, dur * 1.2), music: 'lofi' });
  },
  pad(a, when, freq, dur, gain) {
    a.note(when, freq, dur, { type: 'sine', gain, attack: dur * 0.3, release: 0.9, music: 'lofi' });
    a.note(when, freq * 1.004, dur, { type: 'triangle', gain: gain * 0.4, attack: dur * 0.4, release: 0.9, music: 'lofi' });
  },
  cello(a, when, freq, dur, gain) {
    a.note(when, freq, dur * 0.8, { type: 'sawtooth', gain, attack: 0.18, release: dur * 0.3, music: 'lofi' });
  },
};

function bass(a, when, freq, dur) {
  a.note(when, freq, dur * 0.5, { type: 'triangle', gain: 0.1, attack: 0.008, release: dur * 0.5, music: 'lofi' });
  a.note(when, freq / 2, dur * 0.5, { type: 'sine', gain: 0.07, attack: 0.008, release: dur * 0.5, music: 'lofi' });
}

// — Drum kit ——————————————————————————————————————————————————————
const DRUM_VOICES = {
  kick: (a, at, g) => a.slide(at, 125, 42, 0.2, { type: 'sine', gain: 0.2 * g, music: 'lofi' }),
  snare(a, at, g) {
    a.noise(at, 0.16, { freq: 1800, sweepTo: 950, q: 0.7, gain: 0.08 * g, music: 'lofi' });
    a.slide(at, 220, 150, 0.07, { type: 'triangle', gain: 0.035 * g, music: 'lofi' });
  },
  rim(a, at, g) {
    a.noise(at, 0.03, { freq: 2600, q: 4, gain: 0.06 * g, music: 'lofi' });
    a.note(at, 820, 0.005, { type: 'triangle', gain: 0.025 * g, attack: 0.002, release: 0.04, music: 'lofi' });
  },
  brush: (a, at, g) => a.noise(at, 0.26, { freq: 3200, sweepTo: 1600, q: 0.6, gain: 0.05 * g, music: 'lofi' }),
  // Hats skip the lowpass (plain music bus) or they'd vanish.
  hat: (a, at, g) => a.noise(at, 0.03, { freq: 6500, q: 1.2, gain: 0.014 * g, music: true }),
};

// Patterns on the sixteenth grid: [step, velocity]. `hat` = hat every N steps.
const KITS = {
  boombap4: { kick: [[0, 1], [7, 0.8], [10, 1]], snare: [[4, 1], [12, 1], [15, 0.3]], hat: 1 },
  boombap3: { kick: [[0, 1], [7, 0.8]], snare: [[4, 1], [10, 0.3]], hat: 1 },
  light3: { kick: [[0, 0.85], [7, 0.6]], rim: [[4, 1], [8, 0.6]], hat: 2 },
  brush3: { kick: [[0, 0.9], [7, 0.7]], brush: [[4, 1], [8, 0.7]], rim: [[11, 0.4]], hat: 1 },
  heartbeat3: { kick: [[0, 0.75], [2, 0.5]], hat: 2 },
};

// — Comping (what the chord instrument does through the bar) ——————————————
const COMPS = {
  // Rhodes chord stabs: on the one, then pushed off-beats.
  stab(a, s, steps, at, dt, chord, voice) {
    const hits = steps === 16 ? [0, 6, 11] : [0, 7];
    if (!hits.includes(s)) return;
    chord.forEach((m, k) => voice(a, at + k * 0.01, midiToFreq(m), dt * 4, s === 0 ? 0.024 : 0.017));
  },
  // Fingerpicked eighths up and down the chord.
  arp(a, s, steps, at, dt, chord, voice) {
    if (s % 2 !== 0) return;
    const order = [0, 1, 2, 3, 2, 1, 2, 3];
    const m = chord[order[(s / 2) % order.length] % chord.length];
    voice(a, at, midiToFreq(m), dt * 3, s === 0 ? 0.04 : 0.03);
  },
  pad(a, s, steps, at, dt, chord, voice) {
    if (s !== 0) return;
    chord.forEach((m) => voice(a, at, midiToFreq(m), dt * steps, 0.022));
  },
};

// — Ambience ————————————————————————————————————————————————————————
// Called every step; none of it goes through the lowpass.
const AMBIENCE = {
  vinyl(a, t, dt) {
    if (rand() > 0.3) return;
    a.noise(t + rand() * dt, 0.006, { freq: 2500 + rand() * 3500, q: 0.5, gain: 0.01 + rand() * 0.025, type: 'highpass', music: true });
  },
  rain(a, t, dt) {
    for (let k = 0; k < 2; k++) {
      a.noise(t + rand() * dt, 0.02, { freq: 4000 + rand() * 4000, q: 2, gain: 0.004 + rand() * 0.007, music: true });
    }
  },
  birds(a, t) {
    if (rand() > 0.012) return;
    const f = 2600 + rand() * 1400;
    const chirps = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < chirps; k++) {
      a.slide(t + k * 0.09, f, f * 1.25, 0.06, { type: 'sine', gain: 0.016, music: true });
    }
  },
  fire(a, t, dt) {
    if (rand() > 0.35) return;
    a.noise(t + rand() * dt, 0.01 + rand() * 0.02, { freq: 900 + rand() * 1800, q: 1, gain: 0.015 + rand() * 0.035, music: true });
  },
  // An occasional high bell on one of the bar's melody notes.
  chimes(a, t, dt, s, bar) {
    if (s !== 0 || rand() > 0.35 || !bar.melodyNotes.length) return;
    const m = bar.melodyNotes[Math.floor(rand() * bar.melodyNotes.length)] + 12;
    a.note(t + rand() * dt * 8, midiToFreq(m), 0.01, { type: 'sine', gain: 0.016, attack: 0.003, release: 2, music: true });
  },
};

// — The songs ——————————————————————————————————————————————————————
export const SONGS = [
  {
    id: 'mond',
    title: 'Der Mond ist aufgegangen',
    composer: 'Johann Abraham Peter Schulz',
    place: 'Jungle by day, the open island at night',
    bpm: 84,
    beats: 4,
    lead: 'felt',
    keys: 'rhodes',
    comp: 'stab',
    kit: 'boombap4',
    ambience: ['rain', 'chimes', 'vinyl'],
    bars: [
      { chord: 'E3 G3 A3 C4', bass: 'F2', melody: 'G4/2 F4/2 Bb4/2 A4/2' },
      { chord: 'F3 Bb3 D4', bass: 'C3', melody: 'G4/4 F4/2 A4/2' },
      { chord: 'F3 A3 C4 E4', bass: 'D2', melody: 'A4/2 A4/2 D5/2 C5/2' },
      { chord: 'D3 F3 A3 C4', bass: 'Bb2', melody: 'Bb4/4 A4/2 A4/2' },
      { chord: 'F3 A3 Bb3 D4', bass: 'G2', melody: 'A4/2 A4/2 Bb4/2 A4/2' },
      { chord: 'E3 Bb3 D4', bass: 'C3', melody: 'G4/6 F4/2' },
      { chord: 'E3 G3 A3 C4', bass: 'F2', melody: 'G4/2 F4/2 Bb4/2 A4/2' },
      { chord: 'F3 Bb3 D4', bass: 'C3', melody: 'G4/4 F4/2 A4/2' },
      { chord: 'F3 A3 C4 E4', bass: 'D2', melody: 'A4/2 A4/2 D5/2 C5/2' },
      { chord: 'D3 F3 A3 C4', bass: 'Bb2', melody: 'Bb4/4 A4/2 A4/2' },
      { chord: 'F3 A3 Bb3 D4', bass: 'G2', melody: 'A4/2 A4/2 Bb4/2 A4/2' },
      { chord: 'F3 Bb3 D4', bass: 'C3', melody: 'G4/2 G4/2 F4/2 F4/2' },
    ],
  },
  {
    id: 'keinSchoenerLand',
    title: 'Kein schöner Land',
    composer: 'Anton Wilhelm von Zuccalmaglio',
    place: 'The meadow by day',
    bpm: 96,
    beats: 3,
    lead: 'felt',
    keys: 'guitar',
    comp: 'arp',
    kit: 'light3',
    ambience: ['birds', 'vinyl'],
    bars: [
      { chord: 'C#3 E3 G#3 B3', bass: 'A2', melody: 'A4/2 C#5/2 B4/1 A4/1' },
      { chord: 'D3 F#3 G#3 B3', bass: 'E2', melody: 'B4/3 E4/1 E4/1 E4/1' },
      { chord: 'C#3 E3 G#3 B3', bass: 'A2', melody: 'A4/2 C#5/2 B4/1 A4/1' },
      { chord: 'D3 F#3 G#3 B3', bass: 'E2', melody: 'B4/3 C#5/1 A4/1 B4/1' },
      { chord: 'C#3 E3 G#3 B3', bass: 'A2', melody: 'C#5/1 E5/1 D5/1 C#5/1 B4/1 A4/1' },
      { chord: 'D3 F#3 G#3 B3', bass: 'E2', melody: 'B4/1 D5/1 C#5/1 B4/1 A4/1 B4/1' },
      { chord: 'C#3 E3 G#3 B3', bass: 'A2', melody: 'C#5/3 C#5/1 A4/1 B4/1' },
      { chord: 'C#3 F#3 A3 E4', bass: 'A2', melody: 'C#5/1 E5/1 D5/1 C#5/1 B4/1 A4/1' },
      { chord: 'D3 F#3 G#3 B3', bass: 'E2', melody: 'B4/1 D5/1 C#5/1 B4/1 A4/1 G#4/1' },
      { chord: 'C#3 E3 G#3 B3', bass: 'A2', melody: 'A4/3 E4/1 E4/1 E4/1' },
    ],
  },
  {
    id: 'gedanken',
    title: 'Die Gedanken sind frei',
    composer: 'Traditional (c. 1800)',
    place: 'The Fire Fields',
    bpm: 100,
    beats: 3,
    lead: 'rhodes',
    keys: 'rhodes',
    comp: 'stab',
    kit: 'brush3',
    melodyShift: 12, // up an octave so the tune sits above the chords
    ambience: ['vinyl', 'vinyl'], // extra crackle
    bars: [
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'C5/2 C5/2 E5/1 C5/1' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'G4/4 G4/2' },
      { chord: 'F3 B3 E4', bass: 'G2', melody: 'F4/2 D4/2 G4/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'E4/2 C4/2 G4/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'C5/2 C5/2 E5/1 C5/1' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'G4/4 G4/2' },
      { chord: 'F3 B3 E4', bass: 'G2', melody: 'F4/2 D4/2 G4/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'E4/2 C4/2 C5/2' },
      { chord: 'F3 B3 E4', bass: 'G2', melody: 'B4/2 D5/2 B4/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'C5/2 E5/2 C5/2' },
      { chord: 'F3 B3 E4', bass: 'G2', melody: 'B4/2 D5/2 B4/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'C5/2 E5/2 C5/2' },
      { chord: 'A3 C4 E4', bass: 'F2', melody: 'A4/2 A4/2 C5/1 A4/1' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'G4/4 C5/1 E5/1' },
      { chord: 'F3 B3 E4', bass: 'G2', melody: 'E5/1 D5/1 C5/2 B4/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C3', melody: 'C5/4 G4/1 G4/1' },
    ],
  },
  {
    id: 'lindenbaum',
    title: 'Am Brunnen vor dem Tore (Der Lindenbaum)',
    composer: 'Franz Schubert, arr. Friedrich Silcher',
    place: 'Near your buildings by day',
    bpm: 84,
    beats: 3,
    lead: 'felt',
    keys: 'guitar',
    comp: 'arp',
    kit: 'light3',
    cello: true,
    melodyShift: 12,
    ambience: ['fire', 'vinyl'],
    bars: [
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'Bb4/3 G4/1 G4/1 G4/1' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'G4/2 Eb4/2 r/1 Eb4/1' },
      { chord: 'Ab3 D4 G4', bass: 'Bb2', melody: 'F4/3 G4/1 Ab4/1.5 F4/0.5' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'G4/4 r/1 Bb4/1' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'Bb4/3 G4/1 G4/1 G4/1' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'G4/2 Eb4/2 r/1 Eb4/1' },
      { chord: 'Ab3 D4 G4', bass: 'Bb2', melody: 'F4/3 G4/1 Ab4/1 G4/0.5 F4/0.5' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'Eb4/4 r/1 Eb4/1' },
      { chord: 'D3 F3 G3 C4', bass: 'Bb2', melody: 'F4/3 F4/1 F4/1 F4/1' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'G4/1.5 Ab4/0.5 Bb4/3 Bb4/1' },
      { chord: 'C3 G3 Bb3 Eb4', bass: 'Ab2', melody: 'C5/3 Bb4/1 G4/1 Eb4/1' },
      { chord: 'D3 F3 G3 C4', bass: 'Bb2', melody: 'F4/4 r/1 F4/1' },
      { chord: 'Ab3 D4 G4', bass: 'Bb2', melody: 'F4/3 F4/1 F4/1 F4/1' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'G4/1.5 Ab4/0.5 Bb4/3 Bb4/1' },
      { chord: 'Ab3 C4 Eb4 G4', bass: 'Bb2', melody: 'Eb5/2 Bb4/1 G4/1 Ab4/1 F4/1' },
      { chord: 'D3 G3 Bb3 Eb4', bass: 'G2', melody: 'Bb4/4 r/1 Bb4/1' },
      { chord: 'Ab3 C4 Eb4 G4', bass: 'Bb2', melody: 'Eb5/2 Bb4/1 G4/1 Bb4/1 Ab4/0.5 F4/0.5' },
      { chord: 'D3 G3 Bb3 F4', bass: 'Eb2', melody: 'Eb4/4 r/1 Bb4/1' },
    ],
  },
  {
    id: 'gutenAbend',
    title: 'Guten Abend, gut Nacht',
    composer: 'Johannes Brahms',
    place: 'Near your buildings at night, while the dragons sleep',
    bpm: 76,
    beats: 3,
    lead: 'musicBox',
    keys: 'pad',
    comp: 'pad',
    kit: 'heartbeat3',
    ambience: ['chimes', 'vinyl'],
    bars: [
      { chord: 'E3 G3 B3 D4', bass: 'C2', melody: 'G5/4 E5/1 E5/1' },
      { chord: 'E3 G3 B3 D4', bass: 'C2', melody: 'G5/4 E5/1 G5/1' },
      { chord: 'A3 C4 E4 G4', bass: 'F2', melody: 'C6/2 B5/3 A5/1' },
      { chord: 'G3 C4 E4', bass: 'A2', melody: 'A5/2 G5/2 D5/1 E5/1' },
      { chord: 'F3 A3 B3 D4', bass: 'G2', melody: 'F5/2 D5/2 D5/1 E5/1' },
      { chord: 'F3 A3 B3 D4', bass: 'G2', melody: 'F5/4 D5/1 F5/1' },
      { chord: 'F3 B3 E4', bass: 'G2', melody: 'B5/1 A5/1 G5/2 B5/2' },
      { chord: 'E3 G3 B3 D4', bass: 'C2', melody: 'C6/4 E5/1 E5/1' },
    ],
  },
];

// — The band ————————————————————————————————————————————————————————
const SWING = 0.22; // off-beat sixteenths land this fraction of a step late
const LEAD_GAIN = { felt: 0.07, rhodes: 0.055, musicBox: 0.05 };

/**
 * Turn a song into an AudioManager track. The band plays on a sixteenth grid,
 * so the track's `bpm` is doubled: AudioManager steps in "eighths" of that.
 */
export function makeLofiTrack(song) {
  const steps = song.beats * 4;
  const kit = KITS[song.kit];
  const lead = VOICES[song.lead];
  const keys = VOICES[song.keys];
  const comp = COMPS[song.comp];
  const shift = song.melodyShift ?? 0;
  const bars = song.bars.map((b) => {
    const byStep = Array.from({ length: steps }, () => []);
    const notes = parseMelody(b.melody).notes;
    for (const n of notes) byStep[n.step].push({ midi: n.midi + shift, len: n.len });
    return {
      chord: b.chord.split(' ').map(noteToMidi),
      bass: noteToMidi(b.bass),
      byStep,
      melodyNotes: notes.map((n) => n.midi + shift),
    };
  });
  const kickSteps = kit.kick.map(([s]) => s);

  return {
    title: song.title,
    composer: song.composer,
    bpm: song.bpm * 2,
    lengthSteps: steps * bars.length,
    step(a, i, t, dt) {
      const bar = bars[Math.floor(i / steps) % bars.length];
      const s = i % steps;
      const at = t + (s % 2 === 1 ? dt * SWING : 0);

      comp(a, s, steps, at, dt, bar.chord, keys);

      // Bass follows the kick, ringing until the next one.
      if (kickSteps.includes(s)) {
        const next = kickSteps.find((k) => k > s) ?? steps;
        bass(a, at, midiToFreq(bar.bass), dt * (next - s));
      }
      if (song.cello && s === 0) VOICES.cello(a, at, midiToFreq(bar.bass + 12), dt * steps, 0.02);

      for (const n of bar.byStep[s]) {
        const humanize = (rand() - 0.5) * 0.014;
        lead(a, at + humanize, midiToFreq(n.midi), dt * n.len, LEAD_GAIN[song.lead] * (0.85 + rand() * 0.15));
      }

      for (const voice of ['kick', 'snare', 'rim', 'brush']) {
        const hit = kit[voice]?.find(([k]) => k === s);
        if (hit) DRUM_VOICES[voice](a, at, hit[1]);
      }
      if (s % kit.hat === 0) DRUM_VOICES.hat(a, at, s % 4 === 0 ? 1 : s % 2 === 0 ? 0.7 : 0.45);

      for (const name of song.ambience) AMBIENCE[name](a, t, dt, s, bar);
    },
  };
}

export const LOFI_TRACKS = Object.fromEntries(SONGS.map((s) => [s.id, makeLofiTrack(s)]));
