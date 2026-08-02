import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const videoDir = resolve(scriptDir, '..');
const outputDir = join(videoDir, 'public', 'audio', 'scroll-animatic-en-wide');
const outputPath = join(outputDir, 'clap-story.wav');
const masterPath = join(outputDir, 'clap-story-master.wav');

const sampleRate = 48000;
const duration = 30.5;
const totalSamples = Math.floor(sampleRate * duration);
const bpm = 116;
const beat = 60 / bpm;
const tau = Math.PI * 2;
const left = new Float32Array(totalSamples);
const right = new Float32Array(totalSamples);

let randomState = 0x74686f75;
const random = () => {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 0xffffffff;
};

const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const midi = (note) => 440 * 2 ** ((note - 69) / 12);
const panGains = (pan) => {
  const angle = ((clamp(pan) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

const add = (time, length, generator, gain = 1, pan = 0) => {
  const start = Math.max(0, Math.floor(time * sampleRate));
  const end = Math.min(totalSamples, Math.floor((time + length) * sampleRate));
  const [gainL, gainR] = panGains(pan);
  for (let i = start; i < end; i += 1) {
    const t = (i - start) / sampleRate;
    const sample = generator(t, length) * gain;
    left[i] += sample * gainL;
    right[i] += sample * gainR;
  }
};

const sine = (frequency, time, phase = 0) =>
  Math.sin(tau * frequency * time + phase);

const pluck = (time, note, gain = 0.12, pan = 0, length = 0.42) => {
  const frequency = midi(note);
  add(
    time,
    length,
    (t) => {
      const attack = Math.min(1, t / 0.008);
      const envelope = attack * Math.exp(-8.5 * t);
      return (
        sine(frequency, t) * 0.72 +
        sine(frequency * 2.01, t, 0.25) * 0.24 +
        sine(frequency * 3.99, t, 0.5) * 0.09
      ) * envelope;
    },
    gain,
    pan,
  );
};

const marimba = (time, note, gain = 0.12, pan = 0) => {
  const frequency = midi(note);
  add(
    time,
    0.55,
    (t) =>
      sine(frequency, t) * Math.exp(-7.2 * t) +
      sine(frequency * 3.98, t) * Math.exp(-13 * t) * 0.42 +
      sine(frequency * 8.1, t) * Math.exp(-22 * t) * 0.12,
    gain,
    pan,
  );
};

const bass = (time, note, gain = 0.13, length = 0.44) => {
  const frequency = midi(note);
  add(
    time,
    length,
    (t, total) => {
      const envelope =
        Math.min(1, t / 0.012) *
        Math.min(1, (total - t) / 0.07) *
        Math.exp(-2.4 * t);
      return (sine(frequency, t) * 0.8 + sine(frequency * 2, t) * 0.14) * envelope;
    },
    gain,
  );
};

const kick = (time, gain = 0.18) => {
  add(
    time,
    0.28,
    (t) => {
      const frequency = 48 + 100 * Math.exp(-18 * t);
      return (
        sine(frequency, t) * Math.exp(-13 * t) +
        (random() * 2 - 1) * Math.exp(-62 * t) * 0.05
      );
    },
    gain,
  );
};

const stomp = (time, gain = 0.24) => {
  let lowNoise = 0;
  add(
    time,
    0.42,
    (t) => {
      lowNoise = lowNoise * 0.84 + (random() * 2 - 1) * 0.16;
      return (
        sine(55 + 42 * Math.exp(-12 * t), t) * Math.exp(-10 * t) * 0.74 +
        lowNoise * Math.exp(-14 * t) * 0.26
      );
    },
    gain,
  );
};

const clap = (time, gain = 0.2, pan = 0) => {
  let previous = 0;
  add(
    time,
    0.32,
    (t) => {
      const noise = random() * 2 - 1;
      const high = noise - previous * 0.72;
      previous = noise;
      const burst =
        Math.exp(-34 * t) +
        (t > 0.022 ? Math.exp(-46 * (t - 0.022)) * 0.82 : 0) +
        (t > 0.048 ? Math.exp(-55 * (t - 0.048)) * 0.58 : 0);
      const body = sine(910, t) * Math.exp(-23 * t) * 0.12;
      return high * burst * 0.6 + body;
    },
    gain,
    pan,
  );
};

const shaker = (time, gain = 0.035, pan = 0) => {
  let previous = 0;
  add(
    time,
    0.085,
    (t) => {
      const noise = random() * 2 - 1;
      const high = noise - previous * 0.9;
      previous = noise;
      return high * Math.exp(-48 * t);
    },
    gain,
    pan,
  );
};

const snap = (time, gain = 0.14, pan = 0) => {
  add(
    time,
    0.18,
    (t) =>
      (random() * 2 - 1) * Math.exp(-58 * t) * 0.55 +
      sine(1080, t) * Math.exp(-28 * t) * 0.35,
    gain,
    pan,
  );
};

const whoosh = (time, length, gain = 0.1, direction = 1) => {
  let smooth = 0;
  add(
    time,
    length,
    (t, total) => {
      const x = t / total;
      smooth = smooth * 0.55 + (random() * 2 - 1) * 0.45;
      const envelope = Math.sin(Math.PI * x) ** 1.4;
      const frequency = 180 + (direction > 0 ? x : 1 - x) * 1900;
      return envelope * (smooth * 0.54 + sine(frequency, t) * 0.1);
    },
    gain,
    direction > 0 ? 0.25 : -0.25,
  );
};

const pad = (start, end, notes, gain = 0.02) => {
  add(
    start,
    end - start,
    (t, total) => {
      const envelope =
        Math.min(1, t / 0.35) * Math.min(1, (total - t) / 0.45);
      return (
        notes.reduce(
          (sum, note, index) =>
            sum +
            sine(midi(note), t, index * 0.45) * 0.35 +
            sine(midi(note) * 2.002, t, index * 0.7) * 0.05,
          0,
        ) * envelope
      );
    },
    gain,
  );
};

const chordStab = (time, notes, gain = 0.08) => {
  notes.forEach((note, index) => pluck(time + index * 0.009, note, gain, (index - 1) * 0.2, 0.5));
};

const melody = [72, 76, 79, 76, 74, 79, 81, 79];
const bassRoots = [48, 43, 45, 41];
const chords = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
];

// One paper, one question: sparse and curious.
pad(0, 6.5, [60, 64, 67], 0.016);
pluck(0.3, 72, 0.12, -0.16);
pluck(0.82, 76, 0.1, 0.16);
clap(1.55, 0.1, -0.08);
marimba(2.08, 79, 0.1, 0.1);
clap(2.18, 0.12, 0.08);

// Questions accumulate. Each visible branch gets a clap punctuation.
for (let time = 2.58, index = 0; time < 6.5; time += beat / 2, index += 1) {
  if (index % 4 === 0) kick(time, 0.09);
  if (index % 4 === 1 || index % 4 === 3) clap(time, 0.12 + index * 0.002, index % 4 === 1 ? -0.18 : 0.18);
  shaker(time, index % 2 === 0 ? 0.024 : 0.016, index % 2 ? 0.2 : -0.2);
  if (index % 2 === 0) pluck(time, melody[index % melody.length], 0.075, index % 4 ? 0.22 : -0.22);
}

// The transcript becomes busy and hard to follow.
pad(6.35, 10.05, [57, 60, 64, 67], 0.024);
for (let time = 6.5, index = 0; time < 9.85; time += beat / 2, index += 1) {
  if (index % 2 === 0) kick(time, 0.14);
  clap(time, index % 2 === 0 ? 0.16 : 0.11, index % 2 ? 0.28 : -0.28);
  shaker(time + beat / 4, 0.04, index % 2 ? -0.22 : 0.22);
  marimba(time, melody[(index + 2) % melody.length], 0.07, index % 2 ? 0.24 : -0.24);
}
whoosh(9.38, 0.58, 0.14, -1);
stomp(9.92, 0.19);

// Narrative drop: no groove while the loss of context lands.
pad(10, 12.55, [57, 60, 64], 0.025);
pluck(10.18, 69, 0.07, -0.1, 1.2);
pluck(11.42, 72, 0.065, 0.12, 1.1);
whoosh(11.86, 0.62, 0.12, 1);

// The conversation becomes a map: one decisive stomp-clap and a fresh groove.
stomp(12.5, 0.34);
clap(12.52, 0.28);
chordStab(12.54, [60, 64, 67], 0.09);
pad(12.45, 22.05, [60, 64, 67, 72], 0.022);

for (let time = 12.5, index = 0; time < 16; time += beat / 2, index += 1) {
  if (index % 4 === 0) kick(time, 0.14);
  if (index % 4 === 1 || index % 4 === 3) clap(time, 0.17, index % 4 === 1 ? -0.2 : 0.2);
  shaker(time, 0.03, index % 2 ? 0.2 : -0.2);
  if (index % 2 === 0) marimba(time, melody[index % melody.length], 0.09, index % 4 ? 0.24 : -0.24);
}

// Shape the context: full, cheerful clap-pop with a rising motif.
for (let time = 16, index = 0; time < 22; time += beat / 2, index += 1) {
  const bar = Math.floor(index / 8) % chords.length;
  if (index % 4 === 0) {
    kick(time, 0.18);
    bass(time, bassRoots[bar], 0.12);
  }
  if (index % 4 === 1 || index % 4 === 3) clap(time, 0.2, index % 4 === 1 ? -0.22 : 0.22);
  shaker(time, index % 2 === 0 ? 0.038 : 0.026, index % 2 ? 0.24 : -0.24);
  if (index % 2 === 0) pluck(time, melody[(index + 4) % melody.length], 0.09, index % 4 ? 0.2 : -0.2);
  if (index % 8 === 0) chordStab(time, chords[bar], 0.052);
}

// Edge cut and merge are written into the percussion.
snap(18.5, 0.24, 0.28);
whoosh(18.54, 0.28, 0.08, -1);
clap(19.48, 0.24, -0.2);
clap(19.68, 0.22, 0.2);
stomp(20.78, 0.25);
chordStab(20.82, [64, 67, 72], 0.08);

// Payoff: the brightest version of the motif.
pad(21.9, 25.55, [60, 64, 67, 72, 76], 0.027);
for (let time = 22, index = 0; time < 25.5; time += beat / 2, index += 1) {
  if (index % 4 === 0) {
    kick(time, 0.2);
    bass(time, bassRoots[index % bassRoots.length], 0.13);
  }
  clap(time, index % 2 === 0 ? 0.21 : 0.15, index % 2 ? 0.22 : -0.22);
  shaker(time + beat / 4, 0.04, index % 2 ? -0.24 : 0.24);
  marimba(time, melody[(index + 5) % melody.length] + (index > 8 ? 12 : 0), 0.095, index % 2 ? 0.2 : -0.2);
}

// Principle and logo: resolve, then leave air.
stomp(25.5, 0.27);
clap(25.52, 0.25);
chordStab(25.54, [60, 64, 67, 72], 0.085);
pad(25.48, 30.5, [60, 64, 67, 72], 0.027);
pluck(26.28, 76, 0.1, -0.18, 0.8);
pluck(26.8, 79, 0.11, 0.18, 0.8);
stomp(27.35, 0.22);
clap(27.37, 0.2);
marimba(27.4, 84, 0.13, 0, 1.1);
pluck(28.55, 79, 0.08, -0.12, 1.1);
pluck(29.08, 84, 0.08, 0.12, 1.25);

// Gentle master limiter and 16-bit stereo WAV encoding.
const pcm = Buffer.alloc(totalSamples * 4);
for (let i = 0; i < totalSamples; i += 1) {
  const fadeOut = i > totalSamples - sampleRate * 0.8
    ? (totalSamples - i) / (sampleRate * 0.8)
    : 1;
  const limit = (sample) => Math.tanh(sample * 1.28) * 0.82 * clamp(fadeOut, 0, 1);
  pcm.writeInt16LE(Math.round(limit(left[i]) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(limit(right[i]) * 32767), i * 4 + 2);
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

mkdirSync(outputDir, {recursive: true});
writeFileSync(outputPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${outputPath}`);

const normalized = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    outputPath,
    '-af',
    'loudnorm=I=-15:TP=-1.5:LRA=9',
    '-ar',
    String(sampleRate),
    masterPath,
  ],
  {stdio: 'inherit'},
);

if (normalized.status !== 0) {
  throw new Error(`ffmpeg loudness normalization failed with status ${normalized.status}`);
}
console.log(`Wrote ${masterPath}`);
