import {mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const videoDir = resolve(scriptDir, '..');
const sourceVideo = join(
  videoDir,
  'out',
  'final',
  'thoughtdag-zh-horizontal.mp4',
);
const sourceDir = join(videoDir, 'public', 'audio', 'royalty-free-candidates');
const outputDir = join(videoDir, 'out', 'music-options');
const audioDir = join(outputDir, 'audio-masters');
const duration = 31.850667;

const options = [
  {
    id: 'a-cinematic-build',
    label: 'Driving Ambition — cinematic build',
    source: '14-driving-ambition-ahjay-stelino.mp3',
    start: 0,
    postGain: -0.1,
  },
  {
    id: 'b-tech-pulse',
    label: 'Close Up — progressive tech pulse',
    source: '13-close-up-michael-ramir-c.mp3',
    start: 0,
    postGain: 0.5,
  },
  {
    id: 'c-playful-drive',
    label: 'Motivating Mornings — playful drive',
    source: '15-motivating-mornings-ahjay-stelino.mp3',
    start: 0,
    postGain: -1.5,
  },
  {
    id: 'd-warm-lift',
    label: 'Reaching Out — warm indie lift',
    source: '16-reaching-out-michael-ramir-c.mp3',
    start: 0,
    postGain: 0.1,
  },
];

const run = (command, args) => {
  const result = spawnSync(command, args, {stdio: 'inherit'});
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}`);
  }
};

mkdirSync(outputDir, {recursive: true});
mkdirSync(audioDir, {recursive: true});

// The curve follows the visual arc:
// hook -> expansion -> control -> prune -> merge -> logo resolve.
// Brief dips at pruning and merging replace detached sound effects with
// negative space inside the music itself.
const volumeCurve = [
  'if(lt(t,1.8),0.30+0.12*t/1.8,',
  'if(lt(t,8.2),0.50+0.10*(t-1.8)/6.4,',
  'if(lt(t,15.6),0.66+0.08*(t-8.2)/7.4,',
  'if(lt(t,19.45),0.78+0.06*(t-15.6)/3.85,',
  'if(lt(t,19.72),0.48,',
  'if(lt(t,23.05),0.86,',
  'if(lt(t,23.30),0.60,',
  'if(lt(t,29.4),1.00,0.88))))))))',
].join('');

for (const option of options) {
  const input = join(sourceDir, option.source);
  const audioOutput = join(audioDir, `${option.id}.wav`);
  const videoOutput = join(outputDir, `${option.id}.mp4`);

  const audioFilter = [
    `atrim=start=${option.start}:duration=${duration}`,
    'asetpts=PTS-STARTPTS',
    'highpass=f=32',
    `volume='${volumeCurve}':eval=frame`,
    'afade=t=in:st=0:d=0.18',
    `afade=t=out:st=${duration - 0.9}:d=0.9`,
    'loudnorm=I=-16.5:TP=-1.5:LRA=12',
    `volume=${option.postGain}dB`,
  ].join(',');

  run('ffmpeg', [
    '-y',
    '-i',
    input,
    '-af',
    audioFilter,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s24le',
    audioOutput,
  ]);

  run('ffmpeg', [
    '-y',
    '-i',
    sourceVideo,
    '-i',
    audioOutput,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '256k',
    '-movflags',
    '+faststart',
    '-t',
    String(duration),
    videoOutput,
  ]);

  console.log(`Built ${option.label}: ${videoOutput}`);
}
