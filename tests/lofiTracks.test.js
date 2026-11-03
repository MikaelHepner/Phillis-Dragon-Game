import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, LOFI_TRACKS, noteToMidi, parseMelody } from '../src3d/audio/lofiTracks.js';

test('noteToMidi handles naturals, sharps, flats and octaves', () => {
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('D#5'), 75);
  assert.equal(noteToMidi('Bb3'), 58);
  assert.equal(noteToMidi('Ab4'), 68);
  assert.throws(() => noteToMidi('H2'));
});

test('parseMelody counts in sixteenths and skips rests', () => {
  const { notes, steps } = parseMelody('E5/1 r/0.5 A4/1.5');
  assert.equal(steps, 6);
  assert.deepEqual(notes, [
    { step: 0, midi: 76, len: 2 },
    { step: 3, midi: 69, len: 3 },
  ]);
  assert.throws(() => parseMelody('C4/0.3'));
});

test('every song has its own track', () => {
  assert.deepEqual(Object.keys(LOFI_TRACKS).sort(), SONGS.map((s) => s.id).sort());
});

for (const song of SONGS) {
  test(`${song.title}: every bar fills exactly one measure`, () => {
    song.bars.forEach((bar, i) => {
      assert.equal(parseMelody(bar.melody).steps, song.beats * 4, `bar ${i + 1}`);
      bar.chord.split(' ').forEach(noteToMidi);
      noteToMidi(bar.bass);
    });
  });

  test(`${song.title}: plays a full loop through the synth API`, () => {
    let calls = 0;
    const fake = { note: () => calls++, slide: () => calls++, noise: () => calls++ };
    const track = LOFI_TRACKS[song.id];
    for (let i = 0; i < track.lengthSteps; i++) track.step(fake, i, i * 0.15, 0.15);
    assert.ok(calls > track.lengthSteps);
  });
}
