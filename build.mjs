import * as esbuild from 'esbuild';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--dev');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const config = {
  entryPoints: ['src/main.js'],
  bundle: true,
  outdir: 'dist',
  sourcemap: isDev,
  minify: !isDev,
  target: ['chrome90', 'firefox88', 'safari14'],
  loader: { '.css': 'css' },
};

if (isDev) {
  const ctx = await esbuild.context(config);
  await ctx.watch();

  copyDir(path.join(__dirname, 'public'), path.join(__dirname, 'dist'));

  const mime = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.webmanifest': 'application/manifest+json',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    const parsed   = new URL(req.url, 'http://localhost');
    const urlPath  = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
    const primary  = path.join(__dirname, urlPath);
    // Fall back to dist/ for root-relative paths the manifest/SW use in production
    // e.g. /icons/icon-192.png → dist/icons/icon-192.png
    const fallback = path.join(__dirname, 'dist', urlPath);
    const tryRead  = (filePath, next) => fs.readFile(filePath, (err, data) => {
      if (err) { next(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'text/plain' });
      res.end(data);
    });
    tryRead(primary, () => tryRead(fallback, () => { res.writeHead(404); res.end('Not found'); }));
  });

  server.listen(3000, () => {
    console.log('Dev server → http://localhost:3000');
    console.log('Watching src/ for changes…');
  });
} else {
  await esbuild.build(config);
  copyDir(path.join(__dirname, 'public'), path.join(__dirname, 'dist'));
  console.log('Build complete → dist/');

  if (process.argv.includes('--deploy')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
      .replace(/dist\/main\./g, 'main.')
      .replace(/dist\/manifest\.json/g, 'manifest.json')
      .replace(/dist\/icons\//g, 'icons/');
    fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);
    console.log('Copied index.html → dist/ (paths rewritten)');

    const buildDate = Date.now();
    const swSrc = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
      .replace('__BUILD_DATE__', buildDate);
    fs.writeFileSync(path.join(__dirname, 'dist/sw.js'), swSrc);
    console.log(`Copied sw.js → dist/sw.js (cache key: clocktask-v${buildDate} / ${new Date(buildDate).toISOString()})`);
  }
}
