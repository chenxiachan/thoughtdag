import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const videoDir = resolve(scriptDir, '..');
const configPath = join(videoDir, 'narration', 'product-film-zh.json');
const outputDir = join(videoDir, 'public', 'narration', 'product-film-zh');
const timingPath = join(videoDir, 'narration', 'product-film-zh-timing.json');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
mkdirSync(outputDir, { recursive: true });

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const timing = [];
for (const segment of config.segments) {
  const aiffPath = join(outputDir, `${segment.id}.aiff`);
  const mp3Path = join(outputDir, `${segment.id}.mp3`);
  run('say', [
    '-v',
    config.voice,
    '-r',
    String(config.rate),
    '-o',
    aiffPath,
    segment.text,
  ]);
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    aiffPath,
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '2',
    mp3Path,
  ]);
  const seconds = Number(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mp3Path,
    ]),
  );
  unlinkSync(aiffPath);
  timing.push({ ...segment, seconds });
}

writeFileSync(
  timingPath,
  `${JSON.stringify({ voice: config.voice, rate: config.rate, segments: timing }, null, 2)}\n`,
);

console.log(`Generated ${timing.length} narration clips in ${outputDir}`);
console.log(`Timing written to ${timingPath}`);
