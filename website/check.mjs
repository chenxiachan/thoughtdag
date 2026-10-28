import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';

const root = resolve('dist/pages');
const base = 'https://chenxiachan.github.io/thoughtdag/';
const attr = (node, key) => node.attrs?.find((a) => a.name === key)?.value;
function elements(node) {
  return [node, ...(node.childNodes || []).flatMap(elements)];
}
const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
function localFile(url) {
  const path = decodeURIComponent(url.pathname.slice(new URL(base).pathname.length));
  const candidates = [path, `${path}.html`, `${path.replace(/\/$/, '')}/index.html`];
  if (!path) candidates.unshift('index.html');
  return candidates.find((p) => existsSync(`${root}/${p}`));
}
const pages = ['index.html', 'zh.html'];
for (const locale of ['', 'zh/']) {
  for (const name of ['index', 'edit-ai-context', 'branch-ai-conversations', 'reuse-past-ai-discussions']) {
    pages.push(`docs/${locale}tutorials/${name}.html`);
  }
}
for (const path of pages) {
  const nodes = elements(parse(readFileSync(`${root}/${path}`, 'utf8')));
  const links = nodes.filter((n) => n.tagName === 'link');
  const canonicals = links.filter((n) => attr(n, 'rel') === 'canonical');
  assert.equal(canonicals.length, 1, `${path}: exactly one canonical`);
  const expected = base + path.replace(/(^|\/)index\.html$/, '$1').replace(/^docs\/(.*)\.html$/, 'docs/$1');
  assert.equal(attr(canonicals[0], 'href'), expected, `${path}: canonical URL`);
  for (const lang of ['en', 'zh-CN', 'x-default']) {
    assert(links.some((n) => attr(n, 'hreflang') === lang), `${path}: ${lang} alternate`);
  }
  assert.equal(nodes.filter((n) => n.tagName === 'h1').length, 1, `${path}: one main heading`);
  assert(nodes.some((n) => n.tagName === 'meta' && attr(n, 'name') === 'description' && attr(n, 'content')?.length > 30), `${path}: description`);
  for (const node of nodes) {
    for (const key of ['href', 'src', 'poster']) {
      const value = attr(node, key);
      if (!value || value.startsWith('#') || value.startsWith('data:')) continue;
      const url = new URL(value, expected);
      if (!url.href.startsWith(base)) continue;
      assert(localFile(url), `${path}: missing ${key} ${value}`);
    }
    if (node.tagName === 'script' && attr(node, 'type') === 'application/ld+json') JSON.parse(text(node));
  }
  if (path === 'zh.html') {
    assert.equal(attr(nodes.find((n) => n.tagName === 'html'), 'lang'), 'zh-CN');
    const main = nodes.find((n) => n.tagName === 'main');
    assert(text(main).includes('让模型的上下文看得见'), 'Chinese definition must exist without JavaScript');
    assert(nodes.some((n) => n.tagName === 'script' && text(n).includes('"FAQPage"') && text(n).includes('能不删聊天记录')), 'Chinese FAQ data');
    assert(text(main).includes('如何编辑 AI 上下文'), 'Chinese tutorial links must exist without JavaScript');
    assert.equal(attr(nodes.find((n) => attr(n, 'id') === 'language-toggle'), 'href'), './');
  }
}
const siteMap = readFileSync(`${root}/site-sitemap.xml`, 'utf8');
const docsMap = readFileSync(`${root}/docs/sitemap.xml`, 'utf8');
const index = readFileSync(`${root}/sitemap.xml`, 'utf8');
assert(index.includes('site-sitemap.xml') && index.includes('docs/sitemap.xml'), 'Sitemap index covers website and docs');
assert(siteMap.includes(`${base}zh.html`), 'Chinese homepage is discoverable');
for (const locale of ['', 'zh/']) {
  for (const slug of ['edit-ai-context', 'branch-ai-conversations', 'reuse-past-ai-discussions']) {
    assert(docsMap.includes(`${base}docs/${locale}tutorials/${slug}`), `Sitemap includes ${locale}${slug}`);
  }
}
// All sitemap URLs must resolve in the same deployment, including rewritten locales.
for (const xml of [siteMap, docsMap]) {
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) assert(localFile(new URL(match[1])), `Sitemap target missing: ${match[1]}`);
}
const media = readdirSync(`${root}/docs/media/tutorials`);
assert.equal(media.filter((p) => p.endsWith('.mp4')).length, 4);
assert.equal(media.filter((p) => p.endsWith('.gif')).length, 4);
console.log(`Passed: ${pages.length} landing/tutorial pages, metadata, internal targets, bilingual sitemaps, and four animation sets.`);
