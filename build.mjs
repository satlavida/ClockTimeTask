import * as esbuild from 'esbuild';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--dev');

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

  const mime = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.svg':  'image/svg+xml',
  };

  const server = http.createServer((req, res) => {
    const urlPath  = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'text/plain' });
      res.end(data);
    });
  });

  server.listen(3000, () => {
    console.log('Dev server → http://localhost:3000');
    console.log('Watching src/ for changes…');
  });
} else {
  await esbuild.build(config);
  console.log('Build complete → dist/');
}
