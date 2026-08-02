import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const videoDir = resolve(scriptDir, '..');
const outputDir = join(videoDir, 'public', 'audio', 'scroll-animatic-zh');
const sampleRate = 48000;
const introDuration = 1.8;
const previousIntroDuration = 1;
const syncShift = introDuration - previousIntroDuration;
const duration = 31.8;
const totalSamples = sampleRate * duration;
const tau = Math.PI * 2;

const midi = (note) => 440 * 2 ** ((note - 69) / 12);
const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const panGains = (pan) => {
  const angle = ((clamp(pan) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

const makeTrack = (seed) => {
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 0xffffffff;
  };

  const add = (time, length, generator, gain = 1, pan = 0) => {
    const start = Math.max(0, Math.floor(time * sampleRate));
    const end = Math.min(totalSamples, Math.floor((time + length) * sampleRate));
    const [gainL, gainR] = panGains(pan);
    for (let i = start; i < end; i += 1) {
      const t = (i - start) / sampleRate;
      const sample = generator(t, length, random) * gain;
      left[i] += sample * gainL;
      right[i] += sample * gainR;
    }
  };

  return {left, right, random, add};
};

const triangle = (frequency, t) =>
  (2 / Math.PI) * Math.asin(Math.sin(tau * frequency * t));

const pluck = (track, time, note, gain, pan = 0, length = 0.55) => {
  const frequency = midi(note);
  track.add(
    time,
    length,
    (t, total, random) => {
      const attack = Math.min(1, t / 0.008);
      const envelope = attack * Math.exp((-5.8 * t) / total);
      return (
        envelope *
          (Math.sin(tau * frequency * t) +
            0.34 * Math.sin(tau * frequency * 2.01 * t + 0.2) +
            0.14 * Math.sin(tau * frequency * 3.98 * t + 0.6)) +
        (random() * 2 - 1) * Math.exp(-70 * t) * 0.12
      );
    },
    gain,
    pan,
  );
};

const marimba = (track, time, note, gain, pan = 0, length = 0.7) => {
  const frequency = midi(note);
  track.add(
    time,
    length,
    (t) => {
      const envelope = Math.exp((-6.5 * t) / length);
      return (
        Math.sin(tau * frequency * t) * envelope +
        0.5 * Math.sin(tau * frequency * 3.98 * t) * Math.exp(-11 * t) +
        0.2 * Math.sin(tau * frequency * 9.1 * t) * Math.exp(-18 * t)
      );
    },
    gain,
    pan,
  );
};

const bass = (track, time, note, gain, length = 0.42) => {
  const frequency = midi(note);
  track.add(
    time,
    length,
    (t, total) => {
      const attack = Math.min(1, t / 0.012);
      const release = Math.min(1, (total - t) / 0.08);
      const envelope = attack * release * Math.exp(-1.9 * t);
      return (
        Math.sin(tau * frequency * t) * 0.78 +
        triangle(frequency * 2, t) * 0.18
      ) * envelope;
    },
    gain,
  );
};

const pad = (track, start, end, notes, gain) => {
  track.add(
    start,
    end - start,
    (t, total) => {
      const envelope =
        Math.min(1, t / 0.35) * Math.min(1, (total - t) / 0.45);
      return (
        notes.reduce((sum, note, index) => {
          const frequency = midi(note);
          return (
            sum +
            Math.sin(tau * frequency * t + index * 0.6) * 0.46 +
            Math.sin(tau * frequency * 2.003 * t + index) * 0.08
          );
        }, 0) * envelope
      );
    },
    gain,
  );
};

const chordStab = (track, time, notes, gain, pan = 0) => {
  track.add(
    time,
    0.24,
    (t) => {
      const envelope = Math.min(1, t / 0.006) * Math.exp(-16 * t);
      return (
        notes.reduce(
          (sum, note, index) =>
            sum + triangle(midi(note), t + index * 0.0007) * 0.32,
          0,
        ) * envelope
      );
    },
    gain,
    pan,
  );
};

const kick = (track, time, gain) => {
  track.add(
    time,
    0.3,
    (t, _total, random) => {
      const phaseFrequency = 46 + 95 * Math.exp(-17 * t);
      return (
        Math.sin(tau * phaseFrequency * t) * Math.exp(-12 * t) +
        (random() * 2 - 1) * Math.exp(-65 * t) * 0.06
      );
    },
    gain,
  );
};

const snare = (track, time, gain, pan = 0) => {
  let filtered = 0;
  track.add(
    time,
    0.24,
    (t, _total, random) => {
      filtered = filtered * 0.3 + (random() * 2 - 1) * 0.7;
      return (
        filtered * Math.exp(-18 * t) * 0.72 +
        Math.sin(tau * 185 * t) * Math.exp(-20 * t) * 0.22
      );
    },
    gain,
    pan,
  );
};

const hat = (track, time, gain, pan = 0, open = false) => {
  let previous = 0;
  track.add(
    time,
    open ? 0.22 : 0.07,
    (t, _total, random) => {
      const noise = random() * 2 - 1;
      const high = noise - previous * 0.88;
      previous = noise;
      return high * Math.exp(-(open ? 17 : 58) * t);
    },
    gain,
    pan,
  );
};

const shaker = (track, time, gain, pan = 0) => {
  track.add(
    time,
    0.1,
    (t, _total, random) =>
      (random() * 2 - 1) *
      Math.exp(-38 * t) *
      (0.4 + Math.sin(tau * 4100 * t) * 0.12),
    gain,
    pan,
  );
};

const whoosh = (track, time, length, gain, direction = 1) => {
  let smoothNoise = 0;
  track.add(
    time,
    length,
    (t, total, random) => {
      const x = t / total;
      smoothNoise = smoothNoise * 0.58 + (random() * 2 - 1) * 0.42;
      const envelope = Math.sin(Math.PI * x) ** 1.45;
      const sweep = 180 + (direction > 0 ? x : 1 - x) * 2100;
      return envelope * (smoothNoise * 0.58 + Math.sin(tau * sweep * t) * 0.1);
    },
    gain,
    direction > 0 ? 0.28 : -0.28,
  );
};

const uiSnap = (track, time, gain, pan = 0) => {
  track.add(
    time,
    0.25,
    (t, _total, random) =>
      Math.sin(tau * (680 + 260 * Math.exp(-18 * t)) * t) *
        Math.exp(-20 * t) *
        0.65 +
      (random() * 2 - 1) * Math.exp(-48 * t) * 0.2,
    gain,
    pan,
  );
};

const addCommonPictureSync = (track) => {
  const at = (time) => time + syncShift;
  // Picture events follow the longer hook while the groove stays continuous.
  track.add(
    at(0.78),
    0.5,
    (t, _total, random) =>
      Math.sin(tau * (76 - t * 32) * t) * Math.exp(-6 * t) +
      (random() * 2 - 1) * Math.exp(-24 * t) * 0.08,
    0.16,
  );
  whoosh(track, at(4.22), 0.5, 0.075, 1);
  whoosh(track, at(7.54), 0.42, 0.085, -1);
  uiSnap(track, at(7.75), 0.08, -0.38);
  uiSnap(track, at(7.92), 0.08, 0.38);
  whoosh(track, at(10.74), 0.36, 0.09, 1);
  uiSnap(track, at(11.12), 0.085);
  whoosh(track, at(12.46), 0.44, 0.095, -1);
  uiSnap(track, at(13.08), 0.09, -0.28);
  uiSnap(track, at(13.4), 0.09, 0.3);
  whoosh(track, at(16.1), 0.4, 0.11, 1);
  uiSnap(track, at(16.45), 0.105, -0.32);
  uiSnap(track, at(16.82), 0.105, 0.32);
  whoosh(track, at(18.8), 0.42, 0.11, -1);
  track.add(
    at(19.27),
    0.13,
    (t, _total, random) => (random() * 2 - 1) * Math.exp(-52 * t),
    0.18,
    0.25,
  );
  whoosh(track, at(21.58), 0.5, 0.125, 1);
  uiSnap(track, at(22.04), 0.12, -0.2);
  uiSnap(track, at(22.22), 0.12, 0.2);
  whoosh(track, at(25.14), 0.62, 0.16, 1);
  whoosh(track, at(27.68), 0.48, 0.085, -1);
  uiSnap(track, at(28.02), 0.075);
};

const chords = [
  {notes: [62, 65, 69], root: 38},
  {notes: [58, 62, 65], root: 34},
  {notes: [65, 69, 72], root: 41},
  {notes: [60, 64, 67], root: 36},
];

const energyAt = (time) => {
  const shiftedTime = time - syncShift;
  if (shiftedTime < 1) return 0;
  if (shiftedTime < 5) return 0.34;
  if (shiftedTime < 10) return 0.52;
  if (shiftedTime < 14) return 0.64;
  if (shiftedTime < 18.8) return 0.75;
  if (shiftedTime < 19.55) return 0.72;
  if (shiftedTime < 22) return 0.82;
  if (shiftedTime < 25) return 0.92;
  if (shiftedTime < 27.85) return 1;
  return 0.08;
};

const candidateA = () => {
  const track = makeTrack(0xa1120a);
  const bpm = 120;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const melody = [0, 2, 1, 2, 0, 1, 2, 1];

  for (let start = introDuration, barIndex = 0; start < 28.65; start += bar, barIndex += 1) {
    const chord = chords[barIndex % chords.length];
    const energy = energyAt(start);
    pad(track, start, Math.min(start + bar + 0.12, 28), chord.notes, 0.012 + energy * 0.009);

    for (let step = 0; step < 8; step += 1) {
      const time = start + step * (beat / 2);
      if (time >= 20.04 && time <= 20.16) continue;
      const note = chord.notes[melody[(step + barIndex) % melody.length]] + (step % 4 === 3 ? 12 : 0);
      pluck(track, time, note, 0.055 + energy * 0.045, step % 2 ? 0.16 : -0.16, 0.42);
      if (energy > 0.48) hat(track, time, 0.014 + energy * 0.018, step % 2 ? 0.2 : -0.2);
    }

    for (let step = 0; step < 4; step += 1) {
      const time = start + step * beat;
      if (time >= 20.04 && time <= 20.16) continue;
      bass(track, time, chord.root + (step === 3 ? 7 : 0), 0.07 + energy * 0.07, beat * 0.8);
      if (step === 0 || (energy > 0.72 && step === 2)) kick(track, time, 0.09 + energy * 0.08);
      if (step === 1 || step === 3) snare(track, time, 0.035 + energy * 0.055, step === 1 ? -0.08 : 0.08);
    }
  }

  chordStab(track, 28, [65, 69, 72, 77], 0.12);
  pad(track, 28.52, duration, [65, 69, 72, 76], 0.025);
  pluck(track, 28.85, 77, 0.11, 0, 1.4);
  addCommonPictureSync(track);
  return track;
};

const candidateB = () => {
  const track = makeTrack(0xb1140b);
  const bpm = 114;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const patterns = [
    [0, 1, 2, 1, 0, 2, 1, 2],
    [0, 2, 1, 2, 0, 1, 2, 1],
  ];

  for (let start = introDuration, barIndex = 0; start < 28.65; start += bar, barIndex += 1) {
    const chord = chords[barIndex % chords.length];
    const energy = energyAt(start);
    const pattern = patterns[barIndex % patterns.length];
    pad(track, start, Math.min(start + bar + 0.18, 28), chord.notes, 0.016 + energy * 0.009);

    for (let step = 0; step < 8; step += 1) {
      const time = start + step * (beat / 2);
      if (time >= 20.04 && time <= 20.16) continue;
      const octave = step === 3 || (energy > 0.82 && step === 7) ? 12 : 0;
      marimba(
        track,
        time,
        chord.notes[pattern[step]] + octave,
        0.06 + energy * 0.048,
        step % 2 ? 0.22 : -0.22,
        0.52,
      );
      shaker(track, time, 0.014 + energy * 0.018, step % 2 ? 0.25 : -0.25);
    }

    for (let step = 0; step < 4; step += 1) {
      const time = start + step * beat;
      if (time >= 20.04 && time <= 20.16) continue;
      bass(track, time, chord.root, 0.065 + energy * 0.055, beat * 0.72);
      if (step === 0 || (energy > 0.82 && step === 2)) kick(track, time, 0.075 + energy * 0.065);
      if ((step === 1 || step === 3) && energy > 0.42) {
        snare(track, time, 0.025 + energy * 0.042, step === 1 ? -0.12 : 0.12);
      }
    }
  }

  marimba(track, 27.98, 77, 0.13, -0.12, 1.2);
  marimba(track, 28.25, 81, 0.11, 0.12, 1.25);
  pad(track, 28.52, duration, [65, 69, 72, 76], 0.028);
  marimba(track, 28.84, 84, 0.1, 0, 1.5);
  addCommonPictureSync(track);
  return track;
};

const candidateC = () => {
  const track = makeTrack(0xc1220c);
  const bpm = 122;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bassPattern = [0, 0.75, 1.5, 2.25, 3.25, 3.75];

  for (let start = introDuration, barIndex = 0; start < 28.65; start += bar, barIndex += 1) {
    const chord = chords[barIndex % chords.length];
    const energy = energyAt(start);
    pad(track, start, Math.min(start + bar + 0.08, 28), chord.notes, 0.009 + energy * 0.006);

    bassPattern.forEach((offset, index) => {
      const time = start + offset * beat;
      if (time >= 20.04 && time <= 20.16) return;
      const passing = index === 3 || index === 5 ? 7 : 0;
      bass(track, time, chord.root + passing, 0.08 + energy * 0.075, beat * 0.54);
    });

    for (let step = 0; step < 8; step += 1) {
      const time = start + step * (beat / 2);
      if (time >= 20.04 && time <= 20.16) continue;
      hat(track, time, 0.018 + energy * 0.027, step % 2 ? 0.23 : -0.23, step === 7);
      if (step % 2 === 1) {
        chordStab(track, time, chord.notes.map((note) => note + 12), 0.022 + energy * 0.035, step % 4 === 1 ? -0.14 : 0.14);
      }
    }

    for (let step = 0; step < 4; step += 1) {
      const time = start + step * beat;
      if (time >= 20.04 && time <= 20.16) continue;
      if (step === 0 || step === 2 || (energy > 0.82 && step === 3)) {
        kick(track, time, 0.09 + energy * 0.09);
      }
      if (step === 1 || step === 3) snare(track, time, 0.045 + energy * 0.065);
    }

    if (energy > 0.6) {
      const motif = [chord.notes[0] + 12, chord.notes[2] + 12, chord.notes[1] + 12];
      motif.forEach((note, index) => {
        pluck(track, start + (index * 1.5 + 0.25) * beat, note, 0.045 + energy * 0.035, index - 1, 0.32);
      });
    }
  }

  chordStab(track, 27.92, [65, 69, 72, 77], 0.16);
  chordStab(track, 28.25, [69, 72, 76, 81], 0.13);
  pad(track, 28.52, duration, [65, 69, 72, 76], 0.027);
  pluck(track, 28.83, 81, 0.12, 0, 1.45);
  addCommonPictureSync(track);
  return track;
};

const encodeWav = (track, outputPath) => {
  const pcm = Buffer.alloc(totalSamples * 4);
  for (let i = 0; i < totalSamples; i += 1) {
    const time = i / sampleRate;
    let duck = 1;
    if (time >= 20.02 && time < 20.08) duck = 1 - ((time - 20.02) / 0.06) * 0.28;
    if (time >= 20.08 && time < 20.14) duck = 0.72;
    if (time >= 20.14 && time < 20.22) duck = 0.72 + ((time - 20.14) / 0.08) * 0.28;
    const limiter = (sample) => Math.tanh(sample * duck * 1.25) * 0.82;
    pcm.writeInt16LE(Math.round(limiter(track.left[i]) * 32767), i * 4);
    pcm.writeInt16LE(Math.round(limiter(track.right[i]) * 32767), i * 4 + 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(outputPath, Buffer.concat([header, pcm]));
};

mkdirSync(outputDir, {recursive: true});
[
  ['music-a-kinetic-electronic.wav', candidateA()],
  ['music-b-wooden-bounce.wav', candidateB()],
  ['music-c-digital-funk.wav', candidateC()],
].forEach(([filename, track]) => {
  const outputPath = join(outputDir, filename);
  encodeWav(track, outputPath);
  console.log(outputPath);
});
