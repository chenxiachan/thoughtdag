// Assemble the self-contained runtime the packaged app ships with:
// server.mjs + built dist + production node_modules. Run from desktop/.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(desktop);
const payload = path.join(desktop, 'payload');

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ missing — run `npm run build` at the repo root first.');
  process.exit(1);
}

rmSync(payload, { recursive: true, force: true });
mkdirSync(payload, { recursive: true });
for (const f of ['server.mjs', 'package.json', 'package-lock.json']) {
  cpSync(path.join(root, f), path.join(payload, f));
}
cpSync(path.join(root, 'dist'), path.join(payload, 'dist'), { recursive: true });
console.log('installing production dependencies…');
execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: payload, stdio: 'inherit' });
console.log('payload ready:', payload);
