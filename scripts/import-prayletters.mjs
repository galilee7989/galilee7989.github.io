import { access, mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const postsEndpoint = 'https://www.galilee.org.tw/wp-json/wp/v2/posts?per_page=100';
const pdfPattern = /https:\/\/www\.galilee\.org\.tw\/wp-content\/uploads\/(\d{4})\/(\d{2})\/([^"']+?\.pdf)/i;

function slugFromTitle(postTitle, pdfName) {
  const digits = pdfName.match(/(\d{6})/);
  if (digits) {
    return `${digits[1].slice(0, 4)}-${digits[1].slice(4)}`;
  }

  const match = postTitle.match(/(\d{4}).*?(\d{1,2})/);
  if (!match) {
    return pdfName.replace(/\.pdf$/i, '').toLowerCase();
  }

  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

function titleFromSlug(slug) {
  const [year, month] = slug.split('-');
  return `${year}年${month}月禱告信`;
}

async function download(url, outputPath) {
  try {
    await access(outputPath);
    return;
  } catch {
    // File does not exist yet.
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${url}`);
  }
  await pipeline(response.body, createWriteStream(outputPath));
}

const response = await fetch(postsEndpoint);
if (!response.ok) {
  throw new Error(`WordPress API failed: ${response.status}`);
}

const posts = await response.json();
const items = [];

for (const post of posts) {
  const content = post.content?.rendered ?? '';
  const match = content.match(pdfPattern);
  if (!match) continue;

  const [, uploadYear, uploadMonth, pdfName] = match;
  const pdfUrl = match[0];
  const slug = slugFromTitle(post.title?.rendered ?? '', pdfName);
  const title = titleFromSlug(slug);
  const localPdf = `/prayletters/${uploadYear}/${pdfName}`;
  const outputPath = join(root, 'public', 'prayletters', uploadYear, pdfName);

  items.push({
    title,
    slug,
    date: post.date,
    pdf: localPdf,
    originalUrl: post.link,
  });

  await download(pdfUrl, outputPath);
}

items.sort((a, b) => b.slug.localeCompare(a.slug));

await writeFile(
  join(root, 'src', 'data', 'prayletters.json'),
  `${JSON.stringify(items, null, 2)}\n`,
);

console.log(`Imported ${items.length} prayer letters.`);
