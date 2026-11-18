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
const markers = /(name="app-version" content="|id="app-version">|\?v=)development\b/g;

mkdirSync(output, { recursive: true });
for (const file of ['.nojekyll', 'lizard.png', 'styles.css']) {
  copyFileSync(new URL(file, root), new URL(file, output));
}
for (const file of ['index.html', 'tools/index.html', 'dashboard.js', 'backup.mjs', 'backup-ui.mjs']) {
  const source = readFileSync(new URL(file, root), 'utf8');
  const destination = new URL(file, output);
  mkdirSync(new URL('.', destination), { recursive: true });
  writeFileSync(destination, source.replace(markers, (_, prefix) => prefix + version));
}
console.log(`Version: ${version}`);
