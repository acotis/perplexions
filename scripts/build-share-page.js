// Postbuild: create dist/puzzle/index.html — a copy of the built index.html
// with the social-embed (Open Graph) block removed. Share links point at
// /puzzle/ so that pasting results into Discord etc. never unfurls an embed,
// while the bare https://perplexions.io/ keeps its embed tags.
//
// The block in index.html is delimited by <!-- og-start ... --> and
// <!-- og-end --> markers. We fail the build if they're missing, so a marker
// typo can never silently ship an embed-carrying /puzzle/ page.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const html = readFileSync(join(distDir, 'index.html'), 'utf8');
const ogBlock = /[ \t]*<!-- og-start[\s\S]*?<!-- og-end -->\n?/;
if (!ogBlock.test(html)) {
  console.error('build-share-page: og-start/og-end markers not found in dist/index.html');
  process.exit(1);
}

mkdirSync(join(distDir, 'puzzle'), { recursive: true });
writeFileSync(join(distDir, 'puzzle', 'index.html'), html.replace(ogBlock, ''));
console.log('build-share-page: wrote dist/puzzle/index.html (og block stripped)');
