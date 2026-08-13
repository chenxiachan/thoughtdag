// Assemble the self-contained runtime the packaged app ships with:
// server.mjs + built dist + the server's OWN production node_modules.
// The root dependencies are dominated by frontend libraries (react,
// canvas, markdown) the server never imports — installing them all
// ballooned the payload to 220MB and dragged native .node binaries in
// (a notarization hazard). So the payload gets a minimal package.json
// holding exactly what server.mjs imports, and installs that.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(desktop);
const payload = path.join(desktop, 'payload');

// Every non-node: import at the top of server.mjs, nothing else.
// zod rides into the root tree as a transitive dep, so its version is
// read from the installed copy when package.json doesn't pin it.
const SERVER_DEPS = [
  'express',
  'cors',
  'ai',
  'zod',
  'zhipu-ai-provider',
  '@ai-sdk/openai-compatible',
  '@ai-sdk/mcp',
  '@ai-sdk/openai',
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  '@ai-sdk/deepseek',
  'pdfjs-dist',
];

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ missing — run `npm run build` at the repo root first.');
  process.exit(1);
}

const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = {};
for (const name of SERVER_DEPS) {
  const declared = rootPkg.dependencies?.[name];
  if (declared) {
    dependencies[name] = declared;
  } else {
    const installed = JSON.parse(
      readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
    );
    dependencies[name] = `^${installed.version}`;
  }
}

rmSync(payload, { recursive: true, force: true });
mkdirSync(payload, { recursive: true });
cpSync(path.join(root, 'server.mjs'), path.join(payload, 'server.mjs'));
cpSync(path.join(root, 'dist'), path.join(payload, 'dist'), { recursive: true });
writeFileSync(
  path.join(payload, 'package.json'),
  JSON.stringify({ name: 'thoughtdag-server-payload', private: true, dependencies }, null, 2),
);

console.log('installing server dependencies…');
// --omit=optional keeps native optional deps out (fsevents, pdfjs's
// canvas backend) — text extraction works without them, and Resources
// must stay free of unsigned Mach-O binaries for notarization.
execSync('npm install --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund', {
  cwd: payload,
  stdio: 'inherit',
});

const leftover = execSync('find node_modules -name "*.node" | head -5', { cwd: payload })
  .toString()
  .trim();
if (leftover) {
  console.error('native binaries slipped into the payload:\n' + leftover);
  process.exit(1);
}
console.log('payload ready:', payload);
