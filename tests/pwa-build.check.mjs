import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';

// Separate from fast unit tests: inspect real production artifacts at multiple bases.
for (const base of ['/', '/fero-tracker/', '/tools/tracker/']) {
  test(`installable app and documentation build under ${base}`, async () => {
    const outDir=await mkdtemp(path.join(tmpdir(),'fero-pwa-'));
    try {
      await build({base,logLevel:'error',build:{outDir,emptyOutDir:true}});
      const app=await readFile(path.join(outDir,'index.html'),'utf8');
      const docs=await readFile(path.join(outDir,'docs/index.html'),'utf8');
      assert.ok(app.includes(`href="${base}manifest.webmanifest"`));
      assert.ok(app.includes(`href="${base}icons/apple-touch-icon.png"`));
      assert.ok(docs.includes('<html lang="en">'));
      assert.ok(docs.includes(`href="${base}"`));
      assert.ok(!app.includes('%BASE_URL%')&&!docs.includes('%BASE_URL%'));
      for (const html of [app,docs]) for (const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (!url.startsWith('/') || url.startsWith('//')) continue;
        assert.ok(url.startsWith(base),`${url} escapes ${base}`);
        assert.ok((await stat(path.join(outDir,url.slice(base.length)))).isFile() || url===base,url);
      }
      const manifest=JSON.parse(await readFile(path.join(outDir,'manifest.webmanifest'),'utf8'));
      const manifestUrl=`https://tracker.test${base}manifest.webmanifest`;
      for (const key of ['id','scope','start_url']) assert.equal(new URL(manifest[key],manifestUrl).pathname,base);
      for (const icon of manifest.icons) {
        const iconUrl=new URL(icon.src,manifestUrl);assert.ok(iconUrl.pathname.startsWith(base));
        const buffer=await readFile(path.join(outDir,iconUrl.pathname.slice(base.length)));
        if (icon.type==='image/png') {
          assert.equal(buffer.subarray(1,4).toString(),'PNG');
          assert.equal(`${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`,icon.sizes);
        }
      }
      const apple=await readFile(path.join(outDir,'icons/apple-touch-icon.png'));assert.equal(apple.readUInt32BE(16),180);
      const worker=await readFile(path.join(outDir,'sw.js'),'utf8');
      const assets=JSON.parse(worker.match(/const ASSETS = (.+);/)[1]);
      for (const url of assets) {assert.ok(url.startsWith(base));assert.ok((await stat(path.join(outDir,url.slice(base.length)))).isFile(),url);}
      assert.ok(assets.includes(base+'docs/index.html'));
      assert.ok(assets.includes(base+'index.html'));
      const bundles=await readdir(path.join(outDir,'assets'));
      const scripts=await Promise.all(bundles.filter(name=>name.endsWith('.js')).map(name=>readFile(path.join(outDir,'assets',name),'utf8')));
      assert.ok(scripts.some(source=>source.includes(`${base}sw.js`)),'registration uses the production base');
    } finally {await rm(outDir,{recursive:true,force:true});}
  });
}
