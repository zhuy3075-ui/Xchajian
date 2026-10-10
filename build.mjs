import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const target = targetArg?.split('=')[1] ?? (process.argv.includes('--firefox') ? 'firefox' : 'chrome');
const isFirefox = target === 'firefox';
const outDir = isFirefox ? 'dist-firefox' : 'dist';

if (!['chrome', 'firefox'].includes(target)) {
  console.error(`Unknown build target "${target}". Expected "chrome" or "firefox".`);
  process.exit(1);
}

const commonOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  target: isFirefox ? 'firefox128' : 'chrome120',
  logLevel: 'info',
};

function firefoxManifest(manifest) {
  const next = structuredClone(manifest);

  next.background = {
    scripts: ['background.js'],
    service_worker: 'background.js',
    type: 'module',
  };
  next.browser_specific_settings = {
    gecko: {
      id: 'xclipper@zendegani.github.io',
      strict_min_version: '128.0',
    },
  };

  return next;
}

function writeManifest() {
  const manifestPath = resolve(__dirname, 'src/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const output = isFirefox ? firefoxManifest(manifest) : manifest;
  writeFileSync(
    resolve(__dirname, outDir, 'manifest.json'),
    JSON.stringify(output, null, 2) + '\n'
  );
}

async function build() {
  rmSync(resolve(__dirname, outDir), { recursive: true, force: true });
  mkdirSync(resolve(__dirname, outDir), { recursive: true });

  // Build content script (IIFE — content scripts can't use ES modules)
  const contentBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/content/content.ts')],
    outfile: resolve(__dirname, outDir, 'content.js'),
    format: 'iife',
  });

  // Build injector content script (IIFE)
  const injectorBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/content/injector.ts')],
    outfile: resolve(__dirname, outDir, 'injector.js'),
    format: 'iife',
  });

  // Build background service worker (ESM for MV3)
  const backgroundBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/background/background.ts')],
    outfile: resolve(__dirname, outDir, 'background.js'),
    format: 'esm',
  });

  // Build popup script (IIFE)
  const popupBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/popup/popup.ts')],
    outfile: resolve(__dirname, outDir, 'popup.js'),
    format: 'iife',
  });

  const obsidianConnectBuild = esbuild.build({
    ...commonOptions, entryPoints: [resolve(__dirname, 'src/obsidian-connect/connect.ts')],
    outfile: resolve(__dirname, outDir, 'obsidian-connect.js'), format: 'iife',
  });

  // Build print page (IIFE)
  const printBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/print/print.ts')],
    outfile: resolve(__dirname, outDir, 'print.js'),
    format: 'iife',
  });

  const dukouDir = resolve(__dirname, outDir, 'dukou');
  mkdirSync(dukouDir, { recursive: true });
  // Extension pages/content scripts are bundled; the shared fill layer stays
  // a classic script because platform adapters use its global fill helpers.
  const dukouBuilds = ['popup', 'import', 'wechat-extract'].map((name) => esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, `src/dukou/${name}.js`)],
    outfile: resolve(dukouDir, `${name}.js`),
    format: 'iife',
  }));

  const lensDir = resolve(__dirname, outDir, 'lens');
  mkdirSync(lensDir, { recursive: true });
  const lensBuilds = ['inject', 'content', 'popup'].map(name => esbuild.build({
    ...commonOptions, entryPoints: [resolve(__dirname, `src/lens/${name}.js`)],
    outfile: resolve(lensDir, `${name}.js`), format: 'iife',
  }));
  for (const file of ['popup.html', 'content.css', 'LICENSE', 'NOTICE.md']) {
    cpSync(resolve(__dirname, 'src/lens', file), resolve(lensDir, file));
  }
  cpSync(resolve(__dirname, 'src/workbench.css'), resolve(__dirname, outDir, 'workbench.css'));

  await Promise.all([...lensBuilds, obsidianConnectBuild, contentBuild, injectorBuild, backgroundBuild, popupBuild, printBuild, ...dukouBuilds]);

  for (const file of ['popup.html', 'import.html', 'x-adapter.js', 'bili-adapter.js',
    'huasheng-adapter.js', 'fill-common.js', 'jszip.min.js', 'LICENSE', 'NOTICE.md']) {
    cpSync(resolve(__dirname, 'src/dukou', file), resolve(dukouDir, file));
  }

  // Copy static assets
  writeManifest();
  cpSync(resolve(__dirname, 'src/popup/popup.html'), resolve(__dirname, outDir, 'popup.html'));
  cpSync(resolve(__dirname, 'src/popup/popup.css'), resolve(__dirname, outDir, 'popup.css'));
  cpSync(resolve(__dirname, 'src/print/print.html'), resolve(__dirname, outDir, 'print.html'));

  cpSync(resolve(__dirname, 'src/obsidian-connect/connect.html'), resolve(__dirname, outDir, 'obsidian-connect.html'));

  // Copy icons
  const iconsDir = resolve(__dirname, 'src/icons');
  const distIconsDir = resolve(__dirname, outDir, 'icons');
  if (existsSync(iconsDir)) {
    mkdirSync(distIconsDir, { recursive: true });
    cpSync(iconsDir, distIconsDir, { recursive: true });
  }

  // Copy _locales for i18n
  const localesDir = resolve(__dirname, 'src/_locales');
  const distLocalesDir = resolve(__dirname, outDir, '_locales');
  if (existsSync(localesDir)) {
    mkdirSync(distLocalesDir, { recursive: true });
    cpSync(localesDir, distLocalesDir, { recursive: true });
  }

  console.log(`✅ Build complete → ${outDir}/`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
