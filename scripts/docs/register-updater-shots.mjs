import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=path.join(root,'docs/assets/ui/live-2.3.17');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
manifest.knownProductIssues=[{feature:'Desktop Console script execution',code:'RUNTIME_PROCESS_EXITED',cause:'Packaged utility process cannot resolve typescript.',status:'Observed in isolated 2.3.17 package; not fixed or re-released in the documentation task.',evidence:'28-script-runtime-error.png'}];
for(const [file,title] of [['updater-progress.png','原生更新窗口进度（当前 Inno 源码的安全预览，固定 56%，不实际安装）'],['updater-completed.png','原生更新完成提示（安全预览，为截图暂时保持，不实际打开应用）']]){
  const input=path.join(dir,file), metadata=await sharp(input).metadata();
  const entry={file,title,width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(fs.readFileSync(input)).digest('hex'),captureMode:'native-current-source-isolated-preview'};
  const index=manifest.screenshots.findIndex(s=>s.file===file);if(index<0)manifest.screenshots.push(entry);else manifest.screenshots[index]=entry;
}
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Registered isolated native updater screenshots.');
