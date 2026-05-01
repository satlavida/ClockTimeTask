import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');

// ClockTask icon: dark circle with amber clock hands + center dot
const svgTemplate = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <!-- Background -->
  <circle cx="50" cy="50" r="50" fill="#181818"/>
  <!-- Clock face rim -->
  <circle cx="50" cy="50" r="44" fill="none" stroke="#2a2a2a" stroke-width="2"/>
  <!-- Hour markers -->
  <line x1="50" y1="10" x2="50" y2="16" stroke="#444" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="84" x2="50" y2="90" stroke="#444" stroke-width="2" stroke-linecap="round"/>
  <line x1="10" y1="50" x2="16" y2="50" stroke="#444" stroke-width="2" stroke-linecap="round"/>
  <line x1="84" y1="50" x2="90" y2="50" stroke="#444" stroke-width="2" stroke-linecap="round"/>
  <!-- Hour hand (pointing ~10 o'clock) -->
  <line x1="50" y1="50" x2="32" y2="28" stroke="#e0e0e0" stroke-width="4" stroke-linecap="round"/>
  <!-- Minute hand (pointing ~2 o'clock) -->
  <line x1="50" y1="50" x2="68" y2="22" stroke="#e0e0e0" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Second hand (pointing ~6 o'clock, amber) -->
  <line x1="50" y1="50" x2="50" y2="74" stroke="#F5B731" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Center dot -->
  <circle cx="50" cy="50" r="3" fill="#F5B731"/>
</svg>`;

for (const size of [192, 512]) {
  const svgPath = path.join(outDir, `icon-${size}.svg`);
  const pngPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(svgPath, svgTemplate(size));
  execSync(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${pngPath}"`);
  fs.unlinkSync(svgPath);
  console.log(`Generated ${pngPath}`);
}
