import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';

const svg = readFileSync('public/icon.svg', 'utf8');

for (const size of [192, 512]) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(`public/icon-${size}.png`, png);
  console.log(`Generated public/icon-${size}.png`);
}

// Apple touch icon — 180×180
const resvg180 = new Resvg(svg, { fitTo: { mode: 'width', value: 180 } });
writeFileSync('public/apple-touch-icon.png', resvg180.render().asPng());
console.log('Generated public/apple-touch-icon.png');
