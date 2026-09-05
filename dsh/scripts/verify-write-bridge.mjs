// Live check of the write bridge against the running web profile. Uses the
// small "Hey" session on disk: fork after its one turn, inject context into
// the child, then one tiny follow-up so the model actually reads it.
// Spends ONE short model request on the profile's default model. Run with
//   node scripts/verify-write-bridge.mjs
// while `dsh web` is up; pass a session id as argv[2] to fork another one.
const B = 'http://127.0.0.1:3080/thoughtdag/api';
const HEY = process.argv[2] ?? 'session-e093e195-bb3a-4c56-93a1-b56c31894f5f';
const j = async (path, init) => { const r = await fetch(B + path, init); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { status: r.status, body: b }; };
const post = (path, body) => j(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const log = async (id) => (await fetch(`${B}/sessions/${id}/log`)).text();
const ok = (name, cond, extra = '') => console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);

const turns = await j(`/sessions/${HEY}/turns`);
ok('turns of a cold session', turns.status === 200 && turns.body.turns?.length === 1, JSON.stringify(turns.body.turns));
const endSeq = turns.body.turns?.[0]?.endSeq;

const bad = await post(`/sessions/${HEY}/fork`, { afterTurn: 7 });
ok('fork at an unknown turn is refused', bad.status === 400, JSON.stringify(bad.body));
const fork = await post(`/sessions/${HEY}/fork`, { afterTurn: 1 });
ok('fork after turn 1', fork.status === 200 && typeof fork.body.session === 'string' && fork.body.atSeq === endSeq, JSON.stringify(fork.body));
const child = fork.body.session;

const live = await j('/sessions');
ok('child is a live session', live.body.sessions?.some(s => s.id === child), live.body.sessions?.map(s => s.id.slice(0, 16)).join(','));
const childLog0 = await log(child);
ok('child inherited the parent prefix', childLog0.includes('"Hey"') && childLog0.includes('"type":"turn/end"'), `${childLog0.split('\n').length} lines`);

const empty = await post(`/sessions/${child}/inject`, { text: '' });
ok('empty inject is refused', empty.status === 400, JSON.stringify(empty.body));
const CTX = '[ThoughtDAG context] The person is verifying a write bridge. Their favourite colour, for this test only, is teal.';
const inj = await post(`/sessions/${child}/inject`, { text: CTX });
ok('inject accepted', inj.status === 200 && inj.body.accepted === true, JSON.stringify(inj.body));
await new Promise(r => setTimeout(r, 800));
const childLog1 = await log(child);
ok('injected context is on the child log (inbox splice, source plugin)', childLog1.includes('teal') && childLog1.includes('"plugin":"dsh-thoughtdag"'));

const fu = await post(`/sessions/${child}/followup`, { text: 'Reply with the favourite colour from the context, one word, nothing else.' });
ok('followup accepted', fu.status === 200 && fu.body.accepted === true, JSON.stringify(fu.body));
let answer = null, ctxOnSurface = false;
for (let i = 0; i < 90 && answer === null; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const lines = (await log(child)).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  ctxOnSurface = lines.some(e => e.type === 'user/message' && e.data?.source?.kind === 'plugin' && JSON.stringify(e.data.content).includes('teal'));
  // only the child's OWN turn counts: the inherited prefix has an answer too
  // (seedLength on the header; firstLiveSeq from the summary on a bridge that predates it)
  const seed = lines[0]?.seedLength ?? (await j(`/sessions/${child}`)).body?.session?.firstLiveSeq ?? 0;
  const a = lines.filter(e => e.type === 'assistant/message' && e.seq >= seed).pop();
  const text = a ? (a.data?.message?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('') : '';
  if (text) answer = text;
}
ok('the injected context entered the child surface as a user/message from the plugin', ctxOnSurface);
ok('the model answered from the injected context', answer !== null && /teal/i.test(answer), JSON.stringify(answer));
console.log('child session:', child);
