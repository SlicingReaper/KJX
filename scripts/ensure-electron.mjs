// Runs before `npm run app` / `npm run package`.
//  1. KJX's desktop shell (Electron 45) needs Node 22.12 or newer — say so clearly instead of a cryptic crash.
//  2. Make sure Electron's own app files are present. Newer npm versions (11.20+, bundled with Node 26)
//     skip install scripts that aren't listed in package.json → allowScripts; Electron 45 then downloads
//     them on first use, which we trigger here so it happens once, visibly.
import { createRequire } from 'node:module';

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 12)) {
  console.error(`\nKJX needs Node.js 22.12 or newer — this Mac has ${process.version}.\nInstall the current LTS from https://nodejs.org (or: brew install node), then run npm install again.\n`);
  process.exit(1);
}
const require = createRequire(import.meta.url);
try {
  require('electron'); // resolves the binary path; downloads it if it is missing
} catch (e) {
  console.error('\nCould not set up Electron:', e.message, '\nTry: rm -rf node_modules && npm install\n');
  process.exit(1);
}
