// Copies the static site into www/ for the Android (Capacitor) build.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'icons', 'fonts']) {
  cpSync(join(root, item), join(out, item), { recursive: true });
}
mkdirSync(join(out, 'vendor'));
cpSync(join(root, 'node_modules/@capacitor/core/dist/index.js'), join(out, 'vendor/capacitor-core.js'));
console.log('www/ ready');
