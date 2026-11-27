import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const files = [
  'index.html', 'app.js', 'native-app.js', 'face-quality.js', 'photo-engine.js',
  'photo-worker.js', 'photo-zoom.js', 'color-palettes.js', 'onboarding.js',
  ...(await readdir(root)).filter(name => name.endsWith('.css')),
  'privacy.html', 'terms.html', 'support.html', 'android-release.json', 'app-ads.txt', 'assets', 'vendor'
];
// Validate inputs before replacing only this repository's generated output.
await access(path.join(root, 'vendor/vision/ready.json'));
for (const file of files) await access(path.join(root, file));
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid build output path');
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const file of files) await cp(path.join(root, file), path.join(output, file), { recursive: true });
console.log('HWASAEK static files prepared in dist/ (including bundled models).');
