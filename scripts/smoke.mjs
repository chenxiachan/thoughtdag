// Persistence smoke test — drives local Chrome against the dev server.
// Prereq: `npm run dev` running on :5173. Usage: `npm run smoke`.
// Checks: hydration completes → landing shows on empty store → injected
// node survives a reload (IndexedDB roundtrip) → no console errors.
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL ?? 'http://localhost:5173';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});

console.log('== visit 1: fresh context ==');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const landing1 = await page.getByPlaceholder('What would you like to explore?').count();
console.log('landing visible:', landing1 === 1);

const state1 = await page.evaluate(() => ({
  hydrated: window.__store?.persist?.hasHydrated?.(),
  nodes: window.__store?.getState?.().nodes?.length,
}));
console.log('store state:', JSON.stringify(state1));

// Inject a node directly through the store (no LLM dependency) to test persistence.
await page.evaluate(() => {
  window.__store.getState().setNodes([{
    id: 'smoke-node-1', type: 'thought', position: { x: 0, y: 0 },
    data: {
      question: 'smoke test question', response: 'smoke response', responses: ['smoke response'],
      responseIndex: 0, isCollapsed: false, isEditing: false, isEditingResponse: false,
      isLoading: false, tokenCount: 9, highlights: [], highlightMode: 'tag',
      attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
      roleMode: 'inherit', isRoot: true, isBranch: false,
    },
  }]);
});
await page.waitForTimeout(2000); // > 1s debounce so the write flushes

console.log('== visit 2: reload (persistence roundtrip) ==');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const state2 = await page.evaluate(() => ({
  hydrated: window.__store?.persist?.hasHydrated?.(),
  nodes: window.__store?.getState?.().nodes?.length,
  firstQuestion: window.__store?.getState?.().nodes?.[0]?.data?.question,
  historyLen: window.__store?.getState?.().history?.length,
}));
console.log('after reload:', JSON.stringify(state2));
const nodeCard = await page.locator('.thought-node').count();
console.log('node card rendered:', nodeCard);
const landing2 = await page.getByPlaceholder('What would you like to explore?').count();
console.log('landing hidden after restore:', landing2 === 0);

console.log('== errors ==');
console.log(errors.length ? errors.join('\n') : '(none)');

await browser.close();
const pass = state1.hydrated === true && landing1 === 1
  && state2.hydrated === true && state2.nodes === 1
  && state2.firstQuestion === 'smoke test question' && nodeCard === 1;
console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
process.exit(pass ? 0 : 1);
