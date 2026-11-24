// `npm run app` launcher. Running `electron .` shows up in the Dock and menu bar as "Electron" with
// Electron's logo, because macOS takes the name and icon from the app bundle. On macOS we keep a renamed
// copy — node_modules/.kjx-dev/KJX.app with the KJX name, icon and bundle id — and launch that instead.
// The copy is rebuilt automatically when Electron is updated. Other platforms just run Electron directly.
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const electronBin = require('electron'); // path to the stock Electron executable (downloads it if missing)
const version = require('electron/package.json').version;

function run(bin) {
  const child = spawn(bin, [root], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
}

if (process.platform !== 'darwin') run(electronBin);
else {
  const srcApp = dirname(dirname(dirname(electronBin))); // …/Electron.app
  const devDir = join(root, 'node_modules', '.kjx-dev');
  const devApp = join(devDir, 'KJX.app');
  const stamp = join(devDir, 'electron-version');
  const fresh = existsSync(stamp) && readFileSync(stamp, 'utf8') === version && existsSync(join(devApp, 'Contents/MacOS/Electron'));
  if (!fresh) {
    console.log('Preparing the KJX dev app (one time, after installing or updating Electron)…');
    rmSync(devDir, { recursive: true, force: true });
    mkdirSync(devDir, { recursive: true });
    execFileSync('ditto', [srcApp, devApp]); // ditto keeps the framework symlinks intact
    const plist = join(devApp, 'Contents/Info.plist');
    for (const [k, v] of [['CFBundleName', 'KJX'], ['CFBundleDisplayName', 'KJX'], ['CFBundleIdentifier', 'com.x.kjx.dev'], ['CFBundleIconFile', 'kjx.icns']]) {
      execFileSync('plutil', ['-replace', k, '-string', v, plist]);
    }
    // KJX icon: build/icon.png → .icns
    const iconset = join(mkdtempSync(join(tmpdir(), 'kjx-')), 'kjx.iconset');
    mkdirSync(iconset);
    for (const s of [16, 32, 128, 256, 512]) {
      execFileSync('sips', ['-z', String(s), String(s), join(root, 'build/icon.png'), '--out', join(iconset, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
      execFileSync('sips', ['-z', String(s * 2), String(s * 2), join(root, 'build/icon.png'), '--out', join(iconset, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(devApp, 'Contents/Resources/kjx.icns')]);
    // Editing Info.plist breaks Electron's signature; re-sign locally (ad-hoc) so macOS will run it.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', devApp], { stdio: 'ignore' });
    writeFileSync(stamp, version);
  }
  run(join(devApp, 'Contents/MacOS/Electron'));
}
