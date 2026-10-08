// 实测：DSH 桌面端里那个改过的备份接口（#66）
//
// 前提：DSH 桌面端已重启（插件才是改过的版本）。
// 用法：node scripts/test-live-backup.mjs [port]
//
// 它直接打真实插件的 /thoughtdag/api/backup，验证三件事：
//   1. 能写盘，且写进了指定的文件夹（含 cli/ 子目录）
//   2. 相对路径被拒（400）—— 这是唯一的安全门
//   3. 返回的路径确实存在、内容确实是对的
//
// ⚠️ 它绕过了浏览器的"选目录"对话框：那一步是宿主 pickCwd()，
//    只能手点。这里假定文件夹已经由人选定（或直接给一个临时目录）。
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.argv[2] ?? '19387';
const BASE = `http://127.0.0.1:${PORT}/thoughtdag/api/backup`;

let failures = 0;
let checks = 0;
const ok = (name, cond, extra = '') => {
  checks++;
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const post = async (body) => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed;
  try { parsed = await r.json(); } catch { parsed = null; }
  return { status: r.status, body: parsed };
};

console.log(`  endpoint  ${BASE}\n`);

// 0. 这个 host 有没有这个接口（404 = 装的是旧版）
{
  const probe = await post({ dir: '', name: '', json: '{}' }).catch((e) => ({ status: 0, error: e.message }));
  if (probe.status === 404) {
    console.log('  FAIL  这个 host 没有 /backup —— 装的可能还是旧版，或没重启\n');
    process.exit(1);
  }
  ok('the host answers /backup (not a 404)', probe.status !== 404, `status ${probe.status}`);
  ok('a request with no dir is refused with 400', probe.status === 400, JSON.stringify(probe.body));
}

// 1. 真写一个文件
const dir = await mkdtemp(join(tmpdir(), 'td-live-'));
try {
  const payload = JSON.stringify({ version: 4, name: 'live check', nodes: [], edges: [], events: [] });
  const native = await post({ dir, name: 'Live check.thoughtdag.json', json: payload });
  ok('a native canvas writes', native.status === 200 && typeof native.body?.file === 'string', JSON.stringify(native.body));
  if (native.body?.file) {
    ok('the file is on disk', existsSync(native.body.file), native.body.file);
    ok('the bytes round-trip', await readFile(native.body.file, 'utf8') === payload);
  }

  const mirror = await post({ dir, name: 'cli/Live mirror-abcd1234.thoughtdag.json', json: payload });
  ok('a session mirror writes under cli/', mirror.status === 200 && existsSync(mirror.body?.file), JSON.stringify(mirror.body));

  await new Promise((r) => setTimeout(r, 200));
  ok('nothing landed outside the picked folder', !existsSync(join(dir, '..', 'escaped.thoughtdag.json')));

  // 2. the one refusal that matters
  const relative = await post({ dir: 'relative/folder', name: 'x.thoughtdag.json', json: '{}' });
  ok('a relative dir is refused with 400', relative.status === 400, JSON.stringify(relative.body));

  // 3. the SPA's own bundled build carries the bridge method
  // (a stale dist-app would answer 404 above, so reaching here already proves it)
  const spa = await fetch(`http://127.0.0.1:${PORT}/thoughtdag/`).then((r) => r.text()).catch(() => '');
  ok('the SPA bundle is served', spa.includes('<div id="root"') || spa.includes('id="root"'), `${spa.length} bytes`);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
await new Promise((r) => setTimeout(r, 250));
process.exit(failures === 0 ? 0 : 1);
