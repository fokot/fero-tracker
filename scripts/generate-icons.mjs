// Rasterize the existing checkmark identity without extra build dependencies.
// Square, opaque backgrounds also work when the OS applies its own icon mask.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
};
const distance = (x, y, ax, ay, bx, by) => {
  const t = Math.max(0, Math.min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
  return Math.hypot(x-ax-t*(bx-ax), y-ay-t*(by-ay));
};
mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const [file, size, scale] of [['icon-192',192,1], ['icon-512',512,1], ['maskable-512',512,.85], ['apple-touch-icon',180,1]]) {
  const pixels = Buffer.alloc((size*3+1)*size), background = [33,91,232];
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    let coverage=0;
    for (let sy=0; sy<4; sy++) for (let sx=0; sx<4; sx++) {
      const px=((x+(sx+.5)/4)/size*192-96)/scale+96, py=((y+(sy+.5)/4)/size*192-96)/scale+96;
      if (Math.min(distance(px,py,48,98,78,128),distance(px,py,78,128,144,62)) <= 9) coverage++;
    }
    for (let c=0; c<3; c++) pixels[y*(size*3+1)+1+x*3+c]=Math.round(background[c]+(255-background[c])*coverage/16);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  writeFileSync(new URL(`../public/icons/${file}.png`,import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
