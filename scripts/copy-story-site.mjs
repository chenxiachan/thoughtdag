import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'marketing', 'story-site');
const target = join(root, 'dist', 'story');

if (!existsSync(join(source, 'index.html'))) {
  throw new Error('marketing/story-site/index.html is missing');
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(source, 'index.html'), join(target, 'index.html'));
cpSync(join(source, 'assets'), join(target, 'assets'), { recursive: true });

console.log('Copied ThoughtDAG product story to dist/story/');
