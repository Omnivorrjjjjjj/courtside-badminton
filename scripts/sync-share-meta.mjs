import { readFile, writeFile } from 'node:fs/promises';
import { cloudConfig, tournamentId } from '../dist/config.js';

// Social crawlers need metadata in the HTML response, before Firebase JS runs.
// Read only the public event title; no admin credentials or database writes.
const pageUrl = 'https://omnivorrjjjjjj.github.io/courtside-badminton/';
const documentUrl = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cloudConfig.projectId)}/databases/(default)/documents/badmintonEvents/${encodeURIComponent(tournamentId)}`);
documentUrl.searchParams.set('mask.fieldPaths', 'title');
const response = await fetch(documentUrl, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Cannot read the public event title: HTTP ${response.status}`);
const event = await response.json();
const eventTitle = event.fields?.title?.stringValue?.trim();
if (!eventTitle || eventTitle.length > 80) throw new Error('The public event title is missing or invalid.');

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const title = escapeHtml(`${eventTitle} · COURTSIDE`);
const description = escapeHtml(`${eventTitle}：即時比分、上場球員、隊伍積分與場邊文字播報。`);
const metadata = `<!-- share-metadata:start -->
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_TW">
  <meta property="og:site_name" content="COURTSIDE 場邊速報">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${pageUrl}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <!-- share-metadata:end -->`;
const htmlPath = new URL('../dist/index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
const block = /<!-- share-metadata:start -->[\s\S]*?<!-- share-metadata:end -->/;
if (!block.test(html)) throw new Error('Share metadata block not found; refusing to change unrelated HTML.');
// Use a replacer so event names containing "$&" remain literal text.
await writeFile(htmlPath, html.replace(block, () => metadata));
console.log(`Share metadata synchronized: ${eventTitle}`);
