import { CX, CY } from './constants.js';

export function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function donutPath(rO, rI, sDeg, eDeg) {
  if (eDeg - sDeg < 0.05) return '';
  const big          = (eDeg - sDeg > 180) ? 1 : 0;
  const [ax, ay]     = polar(CX, CY, rO, sDeg);
  const [bx, by]     = polar(CX, CY, rO, eDeg);
  const [cx2, cy2]   = polar(CX, CY, rI, eDeg);
  const [dx, dy]     = polar(CX, CY, rI, sDeg);
  return `M${ax} ${ay} A${rO} ${rO} 0 ${big} 1 ${bx} ${by} ` +
         `L${cx2} ${cy2} A${rI} ${rI} 0 ${big} 0 ${dx} ${dy}Z`;
}
