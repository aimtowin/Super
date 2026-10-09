import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {visibleMarkdown,localTargets,anchorsOf,auditDocuments,unpublishedTargets} from './audit-docs.mjs';
test('ignore examples and remote links, retain local images and references',()=>{
  const text='[remote](https://example.com/a)\n![UI](../assets/ui.png)\n`[sample](missing.md)`\n```md\n[x](missing.md)\n```\n[ref]: page.md#intro';
  assert.equal(visibleMarkdown(text).includes('sample'),false);
  assert.deepEqual(localTargets(text).map(x=>[x.target,x.anchor]),[['../assets/ui.png',''],['page.md','intro']]);
});
test('heading anchors cover Chinese, duplicates and explicit IDs',()=>{
  const anchors=anchorsOf('# 使用手册\n## API & Tools\n## API & Tools\n<a id="safe"></a>');
  for(const value of ['使用手册','api--tools','api--tools-1','safe'])assert.ok(anchors.has(value),value);
});
test('HTML logo and navigation targets are audited, remote HTML is ignored',()=>{
  const refs=localTargets('<img src="docs/logo.png"><a href="guide.md#intro">Guide</a><img src="https://example.com/logo.png">');
  assert.deepEqual(refs.map(r=>[r.target,r.anchor,r.image]),[['docs/logo.png','',true],['guide.md','intro',false]]);
});
test('publication rejects local-only and wrong-case links but accepts Git directories',()=>{
  const refs=['guide.md','Guide.md','docs/private.md','src','../secret.md'].map(resolved=>({source:'README.md',line:1,resolved}));
  assert.deepEqual(unpublishedTargets(refs,new Set(['guide.md','src/main.ts'])).map(r=>r.target),['Guide.md','docs/private.md','../secret.md']);
});
test('missing targets and broken fragment links are reported independently',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'super-doc-audit-test-'));
  try {fs.writeFileSync(path.join(dir,'a.md'),'[good](b.md#intro)\n[bad](b.md#absent)\n![missing](no.png)');fs.writeFileSync(path.join(dir,'b.md'),'# Intro');const result=auditDocuments(dir,['a.md','b.md']);assert.equal(result.localReferences,3);assert.equal(result.broken.length,2);assert.equal(result.referencedImages,1);}finally{fs.rmSync(dir,{recursive:true});}
});
