import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const videoDir = resolve(scriptDir, '..');
const outputDir = join(videoDir, 'public', 'audio', 'scroll-animatic-zh');
const outputPath = join(outputDir, 'sound-design.wav');

const sampleRate = 48000;
const duration = 30;
const totalSamples = sampleRate * duration;
const left = new Float32Array(totalSamples);
const right = new Float32Array(totalSamples);
const bpm = 112;
const beat = 60 / bpm;
const tau = Math.PI * 2;

let randomState = 0x54d4a617;
const random = () => {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 0xffffffff;
};

const panGains = (pan) => {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

const add = (time, length, generator, gain = 1, pan = 0) => {
  const start = Math.max(0, Math.floor(time * sampleRate));
  const end = Math.min(totalSamples, Math.floor((time + length) * sampleRate));
  const [gainL, gainR] = panGains(pan);
  for (let i = start; i < end; i += 1) {
    const localTime = (i - start) / sampleRate;
    const sample = generator(localTime, length) * gain;
    left[i] += sample * gainL;
    right[i] += sample * gainR;
  }
};

const sine = (frequency, time, phase = 0) =>
  Math.sin(tau * frequency * time + phase);

const tonalHit = (time, frequency, gain, pan = 0, decay = 1.15) => {
  add(
    time,
    Math.min(2.8, decay * 4),
    (t) => {
      const envelope = Math.exp((-5.2 * t) / decay);
      const attack = Math.min(1, t / 0.012);
      return (
        attack *
        envelope *
        (sine(frequency, t) +
          0.32 * sine(frequency * 2.01, t, 0.2) +
          0.12 * sine(frequency * 3.98, t, 0.6))
      );
    },
    gain,
    pan,
  );
};

const softKick = (time, gain = 0.16) => {
  add(
    time,
    0.34,
    (t) => {
      const frequency = 88 * Math.exp(-7 * t) + 42;
      return (
        sine(frequency, t) * Math.exp(-13 * t) +
        (random() * 2 - 1) * Math.exp(-55 * t) * 0.08
      );
    },
    gain,
  );
};

const mutedTick = (time, gain = 0.07, pan = 0) => {
  add(
    time,
    0.12,
    (t) =>
      (random() * 2 - 1) *
      Math.exp(-42 * t) *
      (0.45 + 0.55 * Math.sin(tau * 2350 * t)),
    gain,
    pan,
  );
};

const snap = (time, gain = 0.14, pan = 0) => {
  add(
    time,
    0.42,
    (t) => {
      const noise = (random() * 2 - 1) * Math.exp(-35 * t);
      const tone = sine(740 + 240 * Math.exp(-18 * t), t) * Math.exp(-16 * t);
      return noise * 0.42 + tone * 0.58;
    },
    gain,
    pan,
  );
};

const whoosh = (time, length, gain = 0.12, direction = 1) => {
  add(
    time,
    length,
    (t, total) => {
      const x = t / total;
      const envelope = Math.sin(Math.PI * x) ** 1.35;
      const sweep = 160 + (direction > 0 ? x : 1 - x) * 1800;
      const noise = random() * 2 - 1;
      return envelope * (noise * 0.52 + sine(sweep, t) * 0.18);
    },
    gain,
    direction > 0 ? 0.28 : -0.28,
  );
};

const warmPad = (start, end, frequencies, gain, fade = 0.8) => {
  add(
    start,
    end - start,
    (t, total) => {
      const attack = Math.min(1, t / fade);
      const release = Math.min(1, (total - t) / fade);
      const drift = 0.7 + 0.3 * Math.sin(tau * 0.08 * t);
      const chord = frequencies.reduce(
        (sum, frequency, index) =>
          sum +
          sine(frequency, t, index * 0.37) * (index === 0 ? 0.72 : 0.42),
        0,
      );
      return attack * release * drift * chord;
    },
    gain,
  );
};

const granularAir = (start, end, gain) => {
  let smoothNoise = 0;
  add(
    start,
    end - start,
    (t, total) => {
      smoothNoise = smoothNoise * 0.988 + (random() * 2 - 1) * 0.012;
      const envelope =
        Math.min(1, t / 1.2) * Math.min(1, (total - t) / 1.2);
      return smoothNoise * envelope;
    },
    gain,
  );
};

// A single motif grows into a fuller harmonic field.
warmPad(0, 10.2, [73.42, 110, 146.83], 0.018);
warmPad(9.7, 18.25, [73.42, 110, 146.83, 220], 0.024);
warmPad(18.7, 24.4, [65.41, 98, 130.81, 196], 0.025);
warmPad(23.8, 27.25, [87.31, 130.81, 174.61, 261.63], 0.034);
warmPad(26.85, 30, [87.31, 130.81, 174.61, 220], 0.028, 0.45);
granularAir(0, 27.2, 0.032);

// Felt-piano-like motif: D, F, A, C, with increasing answers.
[
  [0.28, 146.83, 0.12, -0.08],
  [2.1, 174.61, 0.09, 0.1],
  [4.05, 220, 0.11, -0.3],
  [5.08, 261.63, 0.1, 0.32],
  [7.28, 146.83, 0.11, -0.35],
  [7.82, 174.61, 0.1, 0.35],
  [9.68, 220, 0.11, 0],
  [11.78, 293.66, 0.105, -0.18],
  [12.32, 349.23, 0.095, 0.2],
  [15.42, 261.63, 0.11, -0.28],
  [15.96, 329.63, 0.1, 0.3],
  [18.72, 130.81, 0.1, 0],
  [21.18, 174.61, 0.12, -0.24],
  [21.72, 220, 0.11, 0.24],
  [24.32, 261.63, 0.14, -0.08],
  [24.86, 349.23, 0.13, 0.1],
  [26.96, 174.61, 0.15, 0],
].forEach(([time, frequency, gain, pan]) =>
  tonalHit(time, frequency, gain, pan),
);

// The pulse enters quietly, then doubles as the graph converges.
for (let time = 5.9, index = 0; time < 18.05; time += beat, index += 1) {
  const growth = Math.min(1, (time - 5.9) / 7);
  if (index % 4 === 0) softKick(time, 0.07 + growth * 0.055);
  mutedTick(time, 0.018 + growth * 0.028, index % 2 ? 0.18 : -0.18);
}
for (let time = 18.85, index = 0; time < 24.2; time += beat / 2, index += 1) {
  if (index % 4 === 0) softKick(time, 0.14);
  mutedTick(time, index % 2 === 0 ? 0.052 : 0.034, index % 2 ? 0.2 : -0.2);
}
for (let time = 24.2, index = 0; time < 27.05; time += beat / 2, index += 1) {
  if (index % 4 === 0) softKick(time, 0.2);
  mutedTick(time, index % 2 === 0 ? 0.075 : 0.05, index % 2 ? 0.25 : -0.25);
}

// Camera and interaction punctuation.
add(
  0,
  0.72,
  (t) =>
    sine(66 - t * 24, t) * Math.exp(-5.4 * t) +
    (random() * 2 - 1) * Math.exp(-18 * t) * 0.2,
  0.22,
);
whoosh(3.22, 0.55, 0.09, 1);
whoosh(6.54, 0.42, 0.105, -1);
snap(6.75, 0.085, -0.42);
snap(6.93, 0.085, 0.42);
whoosh(9.75, 0.36, 0.12, 1);
snap(10.12, 0.1);
whoosh(11.48, 0.46, 0.12, -1);
add(
  11.9,
  1.5,
  (t) => (random() * 2 - 1) * Math.exp(-2.2 * t) * 0.35,
  0.045,
  -0.15,
);
snap(12.1, 0.1, -0.3);
snap(12.42, 0.1, 0.32);
whoosh(15.12, 0.4, 0.14, 1);
snap(15.46, 0.13, -0.34);
snap(15.84, 0.13, 0.34);
whoosh(17.82, 0.42, 0.15, -1);

// Prune: a deliberate pocket of space and a dry cut.
add(
  18.28,
  0.14,
  (t) => (random() * 2 - 1) * Math.exp(-45 * t),
  0.24,
  0.28,
);
tonalHit(18.48, 493.88, 0.08, 0.24, 0.45);

whoosh(20.62, 0.48, 0.17, 1);
snap(21.05, 0.16, -0.22);
snap(21.23, 0.16, 0.22);
whoosh(24.18, 0.62, 0.21, 1);
tonalHit(24.54, 523.25, 0.11, 0, 1.35);
whoosh(26.72, 0.52, 0.12, -1);
snap(27.04, 0.09);

// Gentle limiter and WAV encoding.
const pcm = Buffer.alloc(totalSamples * 4);
for (let i = 0; i < totalSamples; i += 1) {
  const softLimit = (sample) => Math.tanh(sample * 1.35) * 0.78;
  pcm.writeInt16LE(Math.round(softLimit(left[i]) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(softLimit(right[i]) * 32767), i * 4 + 2);
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
console.log(outputPath);
