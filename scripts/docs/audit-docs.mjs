/** Audit tracked Markdown plus newly authored documentation; never read local-only exports. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export function visibleMarkdown(text) {
  return text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]*`/g, '');
}
export function localTargets(text) {
  const clean=visibleMarkdown(text), targets=[];
  // Repository links use plain or angle-bracket targets. Respect escaped parentheses.
  const re=/!?\[[^\]\n]*(?:\][^[\]\n]*)?\]\(\s*(<[^>]+>|(?:\\.|[^\s)])+)(?:\s+"[^"]*")?\s*\)/g;
  for(const m of clean.matchAll(re)) {
    let value=m[1].replace(/^<|>$/g,'').replace(/\\([()])/g,'$1');
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;
    const [file,anchor]=value.split('#');
    try {value=decodeURIComponent(file);} catch {value=file;}
    targets.push({target:value,anchor:anchor?decodeURIComponent(anchor):'',line:text.slice(0,text.indexOf(m[0])).split('\n').length,image:m[0].startsWith('!')});
  }
  for(const m of clean.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)) {
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1]))continue;
    const [target,anchor='']=m[1].split('#');targets.push({target:decodeURIComponent(target),anchor,line:text.slice(0,text.indexOf(m[0])).split('\n').length,image:false});
  }
  for(const m of clean.matchAll(/<(img|a)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[2]))continue;
    const [target,anchor='']=m[2].split('#');targets.push({target:decodeURIComponent(target),anchor,line:text.slice(0,text.indexOf(m[0])).split('\n').length,image:m[1].toLowerCase()==='img'});
  }
  return targets;
}
export function anchorsOf(text) {
  const anchors=new Set(), counts=new Map();
  for(const m of text.matchAll(/<(?:a|h[1-6])\b[^>]*\bid=["']([^"']+)["']/g))anchors.add(m[1]);
  for(const m of visibleMarkdown(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base=m[1].replace(/<[^>]*>/g,'').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-');
    const n=counts.get(base)??0;counts.set(base,n+1);anchors.add(base+(n?`-${n}`:''));
  }
  return anchors;
}
export function auditDocuments(root,files) {
  const broken=[],refs=[],imageFiles=new Set();
  for(const file of files) {
    const absolute=path.join(root,file), text=fs.readFileSync(absolute,'utf8');
    for(const ref of localTargets(text)) {
      const resolved=path.resolve(path.dirname(absolute),ref.target||path.basename(absolute));
      const target=path.relative(root,resolved).replaceAll('\\','/');refs.push({source:file,...ref,resolved:target});
      if(!fs.existsSync(resolved))broken.push({source:file,line:ref.line,target,reason:'missing target'});
      else if(ref.anchor&&/\.md$/i.test(resolved)&&!anchorsOf(fs.readFileSync(resolved,'utf8')).has(ref.anchor))broken.push({source:file,line:ref.line,target:`${target}#${ref.anchor}`,reason:'missing heading anchor'});
      if(ref.image)imageFiles.add(target);
    }
  }
  return {markdownFiles:files.length,localReferences:refs.length,referencedImages:imageFiles.size,broken,refs};
}
export function repositoryDocuments(root) {
  const tracked=execFileSync('git',['ls-files','-z','*.md'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const authored=['docs/plans/2026-10-09-repository-docs-refresh.md','docs/reference/documentation-review-2.3.17.md','docs/user-guide/features.md','docs/assets/ui/live-2.3.17/README.md','docs/plans/follow-up-fixes.md','resources/media-binaries/win32-x64/licenses/LICENSE.md','resources/media-binaries/win32-x64/licenses/RELICENSING.md'];
  return [...new Set([...tracked,...authored])].filter(p=>fs.existsSync(path.join(root,p))).sort();
}
export function unpublishedTargets(refs,published) {
  return refs.filter(r=>r.resolved.startsWith('../')||(!published.has(r.resolved)&&![...published].some(p=>p.startsWith(r.resolved+'/')))).map(r=>({source:r.source,line:r.line,target:r.resolved,reason:'target not in Git index (or incorrect filename case)'}));
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const result=auditDocuments(root,repositoryDocuments(root));
  if(process.argv.includes('--require-tracked')){
    const published=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean));
    result.broken.push(...unpublishedTargets(result.refs,published));
  }
  const manifestPath=path.join(root,'docs/assets/ui/live-2.3.17/manifest.json');
  const capture=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
  const integrity=[];
  if(capture)for(const entry of capture.screenshots){
    const target=path.join(root,'docs/assets/ui/live-2.3.17',entry.file);
    try{const raw=fs.readFileSync(target);const meta=await sharp(raw).metadata();await sharp(raw).raw().toBuffer();if(meta.width!==entry.width||meta.height!==entry.height||createHash('sha256').update(raw).digest('hex')!==entry.sha256)integrity.push({file:entry.file,reason:'dimensions or SHA-256 mismatch'});}catch(error){integrity.push({file:entry.file,reason:String(error)});}
  }
  const guideRefs=result.refs.filter(r=>r.source==='docs/user-guide/features.md');
  const coverage=capture?{screenshots:capture.screenshots.length,unreferenced:capture.screenshots.filter(s=>!guideRefs.some(r=>r.resolved===`docs/assets/ui/live-2.3.17/${s.file}`)).map(s=>s.file),captureFailures:capture.failures.length,integrity}:null;
  console.log(JSON.stringify({...result,refs:undefined,coverage},null,2));
  if(process.argv.includes('--json')) {fs.mkdirSync(path.join(root,'tmp/docs-audit'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/docs-audit/result.json'),JSON.stringify({...result,coverage},null,2));}
  if(result.broken.length||coverage?.unreferenced.length||coverage?.captureFailures||integrity.length)process.exitCode=1;
}
