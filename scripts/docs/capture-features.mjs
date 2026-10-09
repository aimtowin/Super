/** Real, isolated screenshots of the released application. No user library is opened. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { _electron as electron, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const executable = path.join(root, 'out/Super-win32-x64/Super.exe');
const output = path.join(root, 'docs/assets/ui/live-2.3.17');
const reuse = process.argv.find(a => a.startsWith('--reuse='))?.slice(8);
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const temporary = reuse ? path.resolve(root, reuse) : fs.mkdtempSync(path.join(root, 'tmp/docs-capture-'));
if (!temporary.startsWith(path.join(root, 'tmp') + path.sep)) throw new Error('Capture profile must remain inside repository tmp.');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(temporary, 'fixtures'), { recursive: true });
console.log(`Owned capture directory: ${path.relative(root, temporary)}`);
const fixtures = path.join(temporary, 'fixtures');
const pictures = [
  ['海报设计', 720, 1040, '#d65c39', 'FORM / 01'],
  ['蓝色建筑', 1080, 720, '#267f9f', 'SPACE / 02'],
  ['植物参考', 900, 900, '#51816a', 'NATURE / 03'],
  ['紫色材质', 900, 900, '#7767a4', 'MATERIAL / 04'],
  ['橙色场景', 1080, 608, '#d19b3f', 'LIGHT / 05'],
  ['编辑参考', 1080, 720, '#767e89', 'STUDY / 06'],
];
for (const [name, w, h, color, label] of pictures) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/><circle cx="${w*.6}" cy="${h*.44}" r="${w*.3}" fill="#f0e4cb"/><rect x="${w*.17}" y="${h*.25}" width="${w*.3}" height="${h*.5}" fill="#263d45"/><path d="M0 ${h*.85} L${w} ${h*.52} L${w} ${h} L0 ${h}" fill="#edb397"/><text x="${w*.08}" y="${h*.12}" font-family="Arial" font-size="${w*.055}" fill="white">${label}</text><text x="${w*.08}" y="${h*.94}" font-family="Arial" font-size="${w*.025}" fill="#263d45">SUPER LIB — OWNED DOCUMENTATION FIXTURE</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(fixtures, `${name}.png`));
}
fs.writeFileSync(path.join(fixtures, '说明.txt'), 'Super Lib documentation fixture\nLocal asset organization, search and automation.\nThis file contains no personal data.');
fs.writeFileSync(path.join(fixtures, '参考.html'), '<!doctype html><html><body><h1>Super Lib reference</h1><p>Owned offline documentation fixture.</p></body></html>');
for (const name of ['cube.obj', 'cube.mtl', 'triangle.gltf', 'triangle.stl']) fs.copyFileSync(path.join(root, 'tests/fixtures/models', name), path.join(fixtures, name));
// The checked-in glTF references a generated companion; embed our own triangle
// to make the fixture portable through a normal single-file managed import.
const triangle=Buffer.alloc(42);[0,0,0,1,0,0,0,1,0].forEach((v,i)=>triangle.writeFloatLE(v,i*4));[0,1,2].forEach((v,i)=>triangle.writeUInt16LE(v,36+i*2));
const gltf=JSON.parse(fs.readFileSync(path.join(fixtures,'triangle.gltf'),'utf8'));gltf.buffers[0].uri=`data:application/octet-stream;base64,${triangle.toString('base64')}`;fs.writeFileSync(path.join(fixtures,'triangle.gltf'),JSON.stringify(gltf));
const wav = Buffer.alloc(44 + 22050 * 4 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 22050) * 6000), 44 + i * 2);
fs.writeFileSync(path.join(fixtures, '提示音.wav'), wav);
const pdfObjects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R 5 0 R] /Count 2 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
for (let i=0; i<2; i++) pdfObjects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents ${6+i} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
for (let i=0; i<2; i++) { const s=`0.15 0.35 0.4 rg 50 250 500 420 re f BT /F1 28 Tf 50 720 Td (SUPER LIB / REFERENCE ${i+1}) Tj ET`; pdfObjects.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`); }
let pdf='%PDF-1.4\n'; const offsets=[0];
for (const [i,o] of pdfObjects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`; }
const xref=Buffer.byteLength(pdf); pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(fixtures, '设计说明.pdf'), pdf);
const video=path.join(fixtures, '场景演示.webm');
if (!fs.existsSync(video)) execFileSync(path.join(root, 'resources/ffmpeg/win32-x64/ffmpeg.exe'), ['-y','-loop','1','-i',path.join(fixtures,'橙色场景.png'),'-t','4','-c:v','libvpx','-deadline','realtime','-pix_fmt','yuv420p',video], {stdio:'pipe'});
const files=fs.readdirSync(fixtures).filter(n=>!n.endsWith('.mtl')).map(n=>path.join(fixtures,n));
const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>k!=='ELECTRON_RUN_AS_NODE'&&typeof v==='string'));
const app=await electron.launch({executablePath:executable,args:[],cwd:path.dirname(executable),env:{...env,SUPER_E2E:'1',SUPER_E2E_USER_DATA_PATH:path.join(temporary,'profile'),SUPER_ALLOW_MULTI_INSTANCE:'1',SUPER_E2E_THEME:'dark',SUPER_E2E_LOCALE:'zh-CN',SUPER_PREVIEW_CACHE_FORCE:'1'}});
const oldManifest=reuse&&fs.existsSync(path.join(output,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8')):null;
const screenshots=oldManifest?.screenshots??[]; const failures=[]; let page;
async function shot(name, title, target=page, keepPointer=false) {
  if(!keepPointer)await target.mouse.move(1250,840).catch(()=>{});
  await target.waitForTimeout(450);
  const file=path.join(output, `${name}.png`);
  await target.screenshot({path:file});
  const metadata=await sharp(file).metadata();
  const entry={file:`${name}.png`,title,width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  const index=screenshots.findIndex(s=>s.file===entry.file);if(index<0)screenshots.push(entry);else screenshots[index]=entry;
  console.log(`Captured ${name}: ${title}`);
}
async function run(name, fn) {
  if(only&&!only.includes(name))return;
  try {await fn();} catch(error) {
    failures.push({name,error:String(error)}); console.error(`FAILED ${name}: ${error}`);
    fs.writeFileSync(path.join(temporary, `${name}-dom.txt`), await page.locator('body').innerText().catch(()=>''));
    await page.screenshot({path:path.join(temporary, `${name}-error.png`)}).catch(()=>{});
    await page.keyboard.press('Escape').catch(()=>{});
  } finally {
    if(await page.locator('#ai-smart-collection-dialog').isVisible())await page.locator('#ai-smart-collection-dialog').getByRole('button',{name:'取消',exact:true}).click();
    const tasks=page.getByRole('button',{name:'关闭后台任务',exact:true});if(await tasks.isVisible())await tasks.click();
  }
}
async function menu(section,item) {await page.locator('.main-menu-trigger').click();await page.locator(`[data-main-menu-section-id="${section}"]`).hover();const target=page.locator(`[data-main-menu-item-id="${item}"]`);if(item==='edit.clear-selection'&&!await target.isEnabled()){await page.keyboard.press('Escape');return;}await target.click();}
async function openOwnedLibrary(){await app.evaluate((_e,lib)=>{globalThis.__docsPick.files=[lib];},path.join(temporary,'功能演示'));await page.getByRole('button',{name:'打开资源库',exact:true}).first().click();await expect(page.getByRole('button',{name:/^所有资产/}).first()).toBeEnabled({timeout:60000});await app.evaluate((_e,files)=>{globalThis.__docsPick.files=files;},files);}
try {
  const identity=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,userData:app.getPath('userData')}));
  if (identity.version!=='2.3.17'||!identity.packaged||path.resolve(identity.userData)!==path.join(temporary,'profile')) throw new Error('Wrong version/profile: refuse to capture.');
  await app.evaluate(({dialog},options)=>{globalThis.__docsPick=options;dialog.showOpenDialog=async(...args)=>{const o=args.at(-1);return {canceled:false,filePaths:o.title==='Create Library'||o.title==='创建资源库'?[globalThis.__docsPick.root]:globalThis.__docsPick.files};};},{root:temporary,files});
  page=await app.firstWindow(); page.setDefaultTimeout(8000);
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1440,960);});
  if (await page.locator('#quick-start-guide').isVisible()) {await shot('01-onboarding','首次使用引导');await page.getByRole('button',{name:'跳过引导',exact:true}).click();}
  if(reuse)await openOwnedLibrary();
  if (!reuse) {
    await shot('02-library-start','本地资源库入口');
    await page.getByRole('button',{name:'创建资源库',exact:true}).click();
    await page.getByRole('textbox',{name:'名称'}).fill('功能演示');
    await shot('03-create-library','创建本地资源库');
    await page.getByRole('button',{name:'创建',exact:true}).click();
    await expect(page.getByRole('button',{name:'添加文件夹'})).toBeVisible({timeout:30000});
    await page.getByRole('button',{name:'导入文件',exact:true}).first().click();
    await expect(page.locator('.asset-card')).toHaveCount(files.length,{timeout:90000});
    await page.waitForTimeout(3500);
    const seeded=await page.evaluate(async()=>{const api=globalThis.super.library;const must=r=>{if(!r.ok)throw new Error(JSON.stringify(r));return r.value;};const lib=must(await api.listOpen())[0];const libraryId=lib.libraryId;const assets=must(await api.listAssets({libraryId,recursive:true}));const folders=[];for (const name of ['设计参考','项目素材']) folders.push(must(await api.createFolder({libraryId,name})));const tag=must(await api.createTag({libraryId,name:'设计灵感'}));const asset=assets.find(a=>a.displayName==='海报设计.png');const m=must(await api.getAssetMetadata({libraryId,assetId:asset.assetId}));must(await api.setAssetMetadata({libraryId,assetId:asset.assetId,expectedVersion:m.entityVersion,description:'文档演示：自有素材，不包含个人数据。',rating:5,favorite:true,author:'Super Lib 演示',sourcePageUrl:'https://example.com/reference'}));must(await api.assignTags({libraryId,assetIds:[asset.assetId],tagIds:[tag.tagId]}));const c=must(await api.createCollection({libraryId,name:'项目灵感'}));must(await api.addCollectionAssets({libraryId,collectionId:c.collectionId,assetIds:assets.filter(a=>a.displayName.endsWith('.png')).slice(0,4).map(a=>a.assetId)}));return {libraryId,assets,folders};});
    fs.writeFileSync(path.join(temporary,'seed.json'),JSON.stringify(seeded,null,2));
    await page.getByRole('button',{name:'刷新磁盘变化',exact:true}).click();
    await page.waitForTimeout(1500);
  }
  await expect(page.getByRole('button',{name:/^所有资产/}).first()).toBeEnabled({timeout:60000});
  await page.getByRole('button',{name:/^所有资产/}).first().click();
  await page.waitForTimeout(5500);
  await run('workspace',async()=>{await menu('edit','edit.clear-selection');await shot('04-workspace','画布、资源库、文件夹与合集');await page.locator('.asset-card[title="海报设计.png"]').click();await shot('05-inspector','属性、标签、评分、收藏、来源与描述');await page.locator('.asset-card[title="海报设计.png"]').click({button:'right'});await shot('06-asset-actions','资产操作、导出、分析和删除');await page.keyboard.press('Escape');});
  await run('folder',async()=>{await page.getByRole('button',{name:'设计参考',exact:true}).click({button:'right'});await shot('07-folder-actions','文件夹操作与规则');await page.getByRole('menuitem',{name:'设置文件夹图标',exact:true}).click();await expect(page.locator('#sidebar-emoji-input')).toBeVisible();await page.locator('#sidebar-emoji-input').fill('🎨');await shot('08-folder-icon','自定义 Emoji 图标');await page.getByRole('button',{name:'保存',exact:true}).click();});
  await run('settings',async()=>{await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.locator('#app-settings-dialog')).toBeVisible();for(const category of ['general','assets','appearance','browse','ai','mcp','plugins','sync']) {await page.locator(`#app-settings-tab-${category}`).click();await shot(`settings-${category}`,`${category} 设置（外部服务未连接）`);if(category==='ai')await page.getByText('高级设置',{exact:true}).click();if(['appearance','ai','general'].includes(category)){await page.locator('#app-settings-dialog .app-settings-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});await shot(`settings-${category}-details`,`${category} 设置下半页`);}}await page.keyboard.press('Escape');});
  await run('library-settings',async()=>{await menu('library','library.settings');for(const category of ['general','ignore','sync']) {await page.locator(`#library-settings-tab-${category}`).click();await shot(`library-${category}`,`资源库 ${category} 设置`);}await page.keyboard.press('Escape');});
  await run('filters',async()=>{for(const dimension of ['color','tags','shape','rating','analysis','format','more']){const button=page.locator(`.dimension-filter-dim[data-dimension="${dimension}"] > button`);await button.hover();await expect(page.locator(`.dimension-filter-popover[data-dimension="${dimension}"]`)).toBeVisible();await shot(`filter-${dimension}`,`${dimension} 筛选条件`,page,true);await page.mouse.move(1000,650);await page.waitForTimeout(500);}});
  await run('filter-exclusion',async()=>{await page.locator('.dimension-filter-dim[data-dimension="format"] > button').hover();const panel=page.locator('.dimension-filter-popover[data-dimension="format"]');await panel.getByRole('button',{name:'png',exact:true}).click();await panel.getByRole('radio',{name:'排除',exact:true}).check();await shot('filter-exclusion','排除格式与当前条件摘要',page,true);await page.mouse.move(1100,650);await page.waitForTimeout(400);await shot('filter-summary','生效条件、排除标记与清除');await page.getByRole('button',{name:'全部清除',exact:true}).click();});
  await run('tags',async()=>{await page.getByRole('button',{name:'标签管理',exact:true}).click();await shot('09-tag-manager','标签管理');await page.getByRole('button',{name:/^所有资产/}).first().click();});
  for(const [name,file] of [['image','海报设计.png'],['video','场景演示.webm'],['audio','提示音.wav'],['model','cube.obj'],['pdf','设计说明.pdf'],['text','说明.txt'],['html','参考.html']])await run(`viewer-${name}`,async()=>{await page.locator(`.asset-card[title="${file}"]`).dblclick();await expect(page.getByRole('region',{name:`${file} 查看页面`})).toBeVisible();await page.waitForTimeout(1800);await shot(`viewer-${name}`,`${name} 查看器`);if(name==='image'||name==='pdf'){await page.getByRole('button',{name:'悬浮预览',exact:true}).click();await page.waitForTimeout(1200);const floating=(await app.windows()).find(w=>w.url().includes('floating-preview.html'));if(!floating)throw new Error('Missing floating window');await shot(`floating-${name}`,`${name} 悬浮参考窗口`,floating);await floating.getByRole('button',{name:'关闭悬浮预览',exact:true}).click();await page.waitForTimeout(400);}await page.keyboard.press('Escape');});
  await run('tools',async()=>{await page.getByRole('button',{name:'更多工具',exact:true}).click();await shot('11-tools','批量命令与自动化入口');await page.keyboard.press('Escape');});
  await run('scripts',async()=>{await page.getByRole('button',{name:'更多工具',exact:true}).click();await page.getByRole('menuitem',{name:'自动化脚本',exact:true}).click();await shot('15-automation-script','受限脚本编辑与执行');await page.keyboard.press('Escape');});
  await run('ai-search',async()=>{await page.getByRole('button',{name:'AI 查找已分析素材',exact:true}).click();await shot('16-ai-search','已分析素材的 AI 查询（未提交外部请求）');await page.keyboard.press('Escape');});
  await run('collections',async()=>{await page.getByRole('button',{name:/^项目灵感/}).first().click();await shot('17-collection','合集虚拟分组与手动排序');await page.getByRole('button',{name:/^项目灵感/}).first().click({button:'right'});await shot('18-collection-actions','合集管理、嵌套与图标');await page.keyboard.press('Escape');await page.getByRole('button',{name:/^所有资产/}).first().click();});
  await run('smart-collection',async()=>{await page.getByRole('button',{name:'新建智能合集',exact:true}).click();await shot('19-smart-collection','根据当前查询新建智能合集');await page.keyboard.press('Escape');});
  await run('import-menu',async()=>{await page.locator('.main-menu-trigger').click();await page.locator('[data-main-menu-section-id="file"]').hover();await shot('20-import-menu','托管导入与链接导入',page,true);await page.keyboard.press('Escape');});
  await run('library-index',async()=>{await page.getByRole('button',{name:/^当前资源库/}).click();await shot('21-library-menu','切换资源库、索引与云端库入口');await page.getByRole('menuitem',{name:'资源库索引',exact:true}).click();await shot('22-library-index','资源库索引（隔离测试模式不存最近记录）');await openOwnedLibrary();});
  await run('search',async()=>{await page.keyboard.press('Control+f');await page.getByPlaceholder('搜索',{exact:true}).fill('name:海报 -tag:草图');await page.waitForTimeout(1000);await shot('23-search','字段限定、AND/OR/排除语法');await page.getByPlaceholder('搜索',{exact:true}).fill('');});
  await run('linked-folder',async()=>{const linked=path.join(temporary,'项目外部素材');fs.mkdirSync(linked,{recursive:true});fs.copyFileSync(path.join(fixtures,'植物参考.png'),path.join(linked,'外部参考.png'));if(!await page.getByRole('button',{name:/^项目外部素材/}).first().isVisible()){await app.evaluate((_e,paths)=>{globalThis.__docsPick.files=[paths.linked];},{linked});await menu('file','file.import-linked-folder');await page.waitForTimeout(1200);}const tasks=page.getByRole('button',{name:'关闭后台任务',exact:true});if(await tasks.isVisible())await tasks.click();await page.getByRole('button',{name:/^项目外部素材/}).first().click({button:'right'});await shot('24-linked-folder','原位链接目录、重连、规则及转为托管');await page.keyboard.press('Escape');await app.evaluate((_e,files)=>{globalThis.__docsPick.files=files;},files);});
  await run('duplicates',async()=>{await app.evaluate((_e,file)=>{globalThis.__docsPick.files=[file];},path.join(fixtures,'海报设计.png'));await menu('file','file.import-files');await page.waitForTimeout(1000);await shot('25-import-conflicts','重复内容与同名冲突处理');await page.getByRole('button',{name:'取消本次导入',exact:true}).click();await app.evaluate((_e,files)=>{globalThis.__docsPick.files=files;},files);});
  await run('trash',async()=>{await page.getByRole('button',{name:/^所有资产/}).first().click();await page.locator('.asset-card[title="蓝色建筑.png"]').click({button:'right',position:{x:10,y:10}});await page.getByRole('menuitem',{name:/^移入回收站/}).click();await page.getByRole('button',{name:'回收站',exact:true}).click();await page.waitForTimeout(800);await shot('26-trash','回收站、恢复与不可逆删除入口');await page.locator('.asset-card').first().click({button:'right',position:{x:10,y:10}});await shot('27-trash-actions','恢复与永久删除的不同操作');await page.keyboard.press('Escape');await page.getByRole('button',{name:/^所有资产/}).first().click();});
  await run('script-sample',async()=>{await page.getByRole('button',{name:'更多工具',exact:true}).click();await page.getByRole('menuitem',{name:'自动化脚本',exact:true}).click();await page.locator('#script-sandbox-preview-source').fill('const page = await superApi.assets.search({ query: null, limit: 20 });\nreturn { count: page.items.length, total: page.total };');await app.evaluate(({dialog})=>{globalThis.__docsOriginalMessageBox=dialog.showMessageBox;dialog.showMessageBox=async(...args)=>{const o=args.at(-1);if(o.title==='运行自动化脚本'&&o.buttons?.[1]==='运行脚本')return {response:1,checkboxChecked:false};return globalThis.__docsOriginalMessageBox(...args);};});try{await page.getByRole('button',{name:'运行',exact:true}).click();await expect(page.locator('.script-sandbox-preview-result')).toHaveAttribute('data-state',/completed|failed/,{timeout:30000});const state=await page.locator('.script-sandbox-preview-result').getAttribute('data-state');await shot(state==='completed'?'28-script-result':'28-script-runtime-error',state==='completed'?'真实只读查询结果':'实际成品脚本运行失败：缺少 typescript；记录已知限制而非通过');}finally{await app.evaluate(({dialog})=>{dialog.showMessageBox=globalThis.__docsOriginalMessageBox;});}await page.keyboard.press('Escape');});
  await run('display',async()=>{await page.getByRole('button',{name:'平铺视图',exact:true}).click();await shot('29-grid-view','平铺视图、缩略图与多选');await page.getByRole('button',{name:'瀑布流视图',exact:true}).click();});
  await run('appearance-extra',async()=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('#app-settings-tab-appearance').click();await page.getByRole('radio',{name:'暗色',exact:true}).check();await shot('31-dark-theme','暗色主题与外观');await page.getByRole('radio',{name:'亮色',exact:true}).check();await page.getByText('应用背景',{exact:true}).click();await shot('32-background','自定义背景设置');await page.keyboard.press('Escape');});
  await run('jobs',async()=>{await menu('window','window.background-jobs');await shot('12-background-jobs','后台任务、状态与取消');await page.keyboard.press('Escape');});
  await run('diagnostics',async()=>{await menu('window','window.diagnostics');await shot('13-diagnostics','诊断日志入口');await page.keyboard.press('Escape');});
  await run('about',async()=>{await menu('about','about.super');await shot('14-about-update','当前版本与更新入口');await page.keyboard.press('Escape');});
  fs.writeFileSync(path.join(temporary,'final-dom.txt'),await page.locator('body').innerText());
  const manifest={version:identity.version,packaged:identity.packaged,sourceTag:'v2.3.17',capturedAt:new Date().toISOString(),executableSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),fixtureOwnership:'Generated illustrations/audio/video/PDF/text and repository-owned model fixtures; isolated disposable library.',externalServices:'No AI provider, WebDAV server, MCP credential or third-party plugin connected.',screenshots,failures};
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Captured ${screenshots.length}; failed ${failures.length}.`);
  if (failures.length) process.exitCode=1;
} finally {await app.close().catch(()=>{});}
