import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, parseFragment, serialize } from 'parse5';

// Existing data-zh attributes are the translation source. Emit real Chinese HTML.
const out = resolve('dist/pages');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('website', out, { recursive: true, filter: (p) => !p.endsWith('.mjs') });
cpSync('docs/.vitepress/dist', `${out}/docs`, { recursive: true });
const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;

// The download block carries a hard-coded fallback version; the page rewrites it from the GitHub
// API at runtime, but that call is rate-limited for anonymous visitors, so the build stamps the
// latest release in: THOUGHTDAG_RELEASE from the workflow, else the API, else the fallback stays.
async function latestRelease() {
  if (process.env.THOUGHTDAG_RELEASE) return process.env.THOUGHTDAG_RELEASE.trim();
  try {
    const res = await fetch('https://api.github.com/repos/chenxiachan/thoughtdag/releases/latest', { signal: AbortSignal.timeout(5000) });
    if (res.ok) return (await res.json()).tag_name;
  } catch { /* offline build keeps the fallback */ }
  return null;
}
// The FAQ's structured data is read from the visible questions block of each language, so the
// two cannot drift apart.
function addFaqData(doc, lang) {
  const all = (n) => [n, ...(n.childNodes || []).flatMap(all)];
  const textOf = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes || []).map(textOf).join('')).replace(/\s+/g, ' ').trim();
  const nodes = all(doc);
  const faq = nodes.find((n) => attr(n, 'id') === 'faq');
  if (!faq) return;
  const mainEntity = all(faq).filter((n) => n.tagName === 'details').map((d) => {
    const parts = all(d);
    return {
      '@type': 'Question',
      name: textOf(parts.find((p) => p.tagName === 'summary')),
      acceptedAnswer: { '@type': 'Answer', text: textOf(parts.find((p) => p.tagName === 'p')) },
    };
  });
  const head = nodes.find((n) => n.tagName === 'head');
  const script = { nodeName: 'script', tagName: 'script', namespaceURI: 'http://www.w3.org/1999/xhtml', attrs: [{ name: 'type', value: 'application/ld+json' }], childNodes: [], parentNode: head };
  script.childNodes.push({ nodeName: '#text', value: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang, mainEntity }), parentNode: script });
  head.childNodes.push(script);
}
const release = await latestRelease();
const version = release ? release.replace(/^v/, '') : null;
const VERSION_RE = /\d+\.\d+\.\d+/g;
function stampRelease(node) {
  if (version && node.attrs) {
    const id = attr(node, 'id') || '';
    if (id === 'dl-version') node.childNodes = [{ nodeName: '#text', value: `v${version}`, parentNode: node }];
    if (/^dl-(mac-arm|mac-x64|win|linux)$/.test(id) && attr(node, 'href')) {
      const a = node.attrs.find((x) => x.name === 'href'); a.value = a.value.replace(VERSION_RE, version);
    }
  }
  node.childNodes?.forEach(stampRelease);
}
const enDoc = parse(readFileSync('website/index.html', 'utf8'));
stampRelease(enDoc);
addFaqData(enDoc, 'en');
writeFileSync(`${out}/index.html`, serialize(enDoc));
const doc = parse(readFileSync('website/index.html', 'utf8'));
stampRelease(doc);
const setAttr = (node, name, value) => {
  const existing = node.attrs.find((a) => a.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
};
const setText = (node, value) => {
  node.childNodes = [{ nodeName: '#text', value, parentNode: node }];
};
const title = 'ThoughtDAG — 开源 AI 对话画布与上下文编辑工具';
const description = 'ThoughtDAG 是开源 AI 对话画布，让模型的上下文看得见、改得动、测得出。编辑上下文、展开分支、接上过去的讨论，并公开关于上下文的研究、数据与脚本。';
function localize(node) {
  if (node.attrs) {
    if (attr(node, 'data-zh') !== undefined) setText(node, attr(node, 'data-zh'));
    if (attr(node, 'data-zh-html') !== undefined) {
      node.childNodes = parseFragment(node, attr(node, 'data-zh-html')).childNodes;
      node.childNodes.forEach((child) => { child.parentNode = node; });
    }
    if (attr(node, 'data-zh-href')) setAttr(node, 'href', attr(node, 'data-zh-href'));
    if (node.tagName === 'html') setAttr(node, 'lang', 'zh-CN');
    if (node.tagName === 'title') setText(node, title);
    if (node.tagName === 'link' && attr(node, 'rel') === 'canonical') setAttr(node, 'href', 'https://chenxiachan.github.io/thoughtdag/zh.html');
    if (node.tagName === 'meta') {
      const key = attr(node, 'name') || attr(node, 'property');
      if (key === 'description' || key === 'og:description') setAttr(node, 'content', description);
      if (key === 'og:title') setAttr(node, 'content', title);
      if (key === 'og:url') setAttr(node, 'content', 'https://chenxiachan.github.io/thoughtdag/zh.html');
      if (key === 'og:image' || key === 'twitter:image') setAttr(node, 'content', attr(node, 'content').replace('-en-', '-zh-'));
    }
    if (attr(node, 'id') === 'language-toggle') {
      setText(node, 'EN');
      setAttr(node, 'href', './');
      setAttr(node, 'hreflang', 'en');
      setAttr(node, 'aria-label', 'Switch to English');
    }
    if (node.tagName === 'script' && attr(node, 'type') === 'application/ld+json') {
      const data = JSON.parse(node.childNodes[0].value);
      data.description = description;
      data.url = 'https://chenxiachan.github.io/thoughtdag/zh.html';
      data.inLanguage = 'zh-CN';
      setText(node, JSON.stringify(data));
    }
  }
  node.childNodes?.forEach(localize);
}
localize(doc);
addFaqData(doc, 'zh-CN');
writeFileSync(`${out}/zh.html`, serialize(doc));
writeFileSync(`${out}/.nojekyll`, '');
console.log(`Built English and static Chinese landing pages with docs: ${out}${version ? ` (downloads stamped v${version})` : ' (release lookup failed; fallback version kept)'}`);
