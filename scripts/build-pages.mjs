import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const publishedAt = process.argv[2] ? new Date(process.argv[2]) : new Date();
if (!Number.isFinite(publishedAt.getTime())) throw new Error('A valid release timestamp is required.');

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const { year, month, day, hour, minute } = Object.fromEntries(
  formatter.formatToParts(publishedAt).map(({ type, value }) => [type, value])
);
const version = `${year}${month}${day}-${hour}${minute}`;
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const source = readFileSync(new URL('index.html', root), 'utf8');
const markers = /\bdevelopment\b/g;
if ([...source.matchAll(markers)].length !== 6) throw new Error('Expected version markers in the footer, metadata, and asset URLs.');

mkdirSync(output, { recursive: true });
for (const file of ['.nojekyll', 'dashboard.js', 'lizard.png', 'styles.css']) {
  copyFileSync(new URL(file, root), new URL(file, output));
}
writeFileSync(new URL('index.html', output), source.replace(markers, version));
console.log(`Version: ${version}`);
