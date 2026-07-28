import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bundles the Preact + MapLibre widget into a single self-contained HTML file
 * (JS as an inline module, CSS inlined). MapLibre's own stylesheet is bundled
 * via the CSS entry so map controls/popups render correctly inside the iframe.
 * Output: dist/widget/event-carousel.html, read by src/widget-resource.ts.
 */

const jsResult = await build({
  entryPoints: [join(root, 'widget/src/main.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  minify: true,
  write: false,
  loader: { '.css': 'empty' },
});

const cssResult = await build({
  entryPoints: [join(root, 'widget/src/bundle.css')],
  bundle: true,
  minify: true,
  write: false,
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
});

const script = jsResult.outputFiles[0].text;
const styles = cssResult.outputFiles[0].text;

const template = readFileSync(join(root, 'widget/index.html'), 'utf8');
const html = template
  .replace('{{STYLES}}', () => styles)
  .replace('{{SCRIPT}}', () => script);

const outDir = join(root, 'dist/widget');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'event-carousel.html'), html, 'utf8');

console.log(
  `Widget bundled: ${(html.length / 1024).toFixed(0)} kB → dist/widget/event-carousel.html`,
);
