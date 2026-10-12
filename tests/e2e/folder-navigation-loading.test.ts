import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SuperLibraryApi } from '../../src/shared/library-api';
import { dismissQuickStart, resolveElectronExecutablePath } from './electron-test-helpers';

type Probe = {
  events: Array<{kind:string; folderId:string; at:number}>;
  releasePage: ()=>void;
  releaseFolders: ()=>void;
  releaseInspector: ()=>void;
};
type Host = typeof globalThis & {__canvasFirstProbe?:Probe};
test.describe.configure({timeout:120_000});

test('folder navigation keeps pending canvas distinct from empty and paints before Inspector', async () => {
  const root=mkdtempSync(path.join(tmpdir(),'super-canvas-first-'));
  const sources=['Asset A.txt','Asset B.txt'].map(name=>path.join(root,name));
  sources.forEach(file=>writeFileSync(file,'canvas-first isolated fixture '+path.basename(file)));
  const packaged=process.env.SUPER_E2E_PACKAGED_EXECUTABLE;
  const app=await electron.launch({executablePath:packaged??resolveElectronExecutablePath(),args:packaged?[]:[process.cwd()],
    env:{...process.env,SUPER_E2E:'1',SUPER_E2E_RESTORE_RECENT:'1',SUPER_E2E_CREATE_PARENT_PATH:root,
      SUPER_E2E_USER_DATA_PATH:path.join(root,'profile'),SUPER_E2E_IMPORT_FILES:sources.join(path.delimiter)}});
  try {
    if(packaged) await app.evaluate(({dialog},paths)=>{
      dialog.showOpenDialog=async(...args:unknown[])=>{
        const options=args.at(-1) as {title?:string};
        return {canceled:false,filePaths:options.title==='Create Library'||options.title==='创建资源库'?[paths.root]:paths.sources};
      };
    },{root,sources});
    const page=await app.firstWindow();
    await dismissQuickStart(page);
    await page.getByRole('button',{name:'创建资源库',exact:true}).click();
    await page.getByRole('textbox',{name:'名称',exact:true}).fill('Canvas priority');
    await page.getByRole('button',{name:'创建',exact:true}).click();
    await page.getByRole('button',{name:'导入文件',exact:true}).first().click();
    await expect(page.locator('.asset-card')).toHaveCount(2);
    const ids=await page.evaluate(async()=>{
      const api=(window as unknown as {super:{library:SuperLibraryApi}}).super.library;
      const opened=await api.listOpen();if(!opened.ok||!opened.value[0])throw Error('Missing isolated library');
      const libraryId=opened.value[0].libraryId;
      const populated=await api.createFolder({libraryId,name:'Has assets'});
      const parent=await api.createFolder({libraryId,name:'Has folders'});
      const empty=await api.createFolder({libraryId,name:'Actually empty'});
      if(!populated.ok||!parent.ok||!empty.ok)throw Error('Fixture folders failed');
      const child=await api.createFolder({libraryId,name:'Nested content',parentFolderId:parent.value.folderId});
      const assets=await api.searchAssets({libraryId,limit:100});
      if(!child.ok||!assets.ok||assets.value.items.length!==2)throw Error('Fixture child/assets failed');
      const a=assets.value.items.find(item=>item.displayName==='Asset A.txt')!;
      const b=assets.value.items.find(item=>item.displayName==='Asset B.txt')!;
      const movedA=await api.moveAssets({libraryId,assetIds:[a.assetId],targetFolderId:populated.value.folderId});
      const movedB=await api.moveAssets({libraryId,assetIds:[b.assetId],targetFolderId:child.value.folderId});
      if(!movedA.ok||!movedB.ok)throw Error('Fixture move failed');
      localStorage.setItem('superApi.browse-sort-prefs.v1',JSON.stringify({version:1,field:'modified_at',order:'desc'}));
      return {libraryId,populated:populated.value.folderId,parent:parent.value.folderId,empty:empty.value.folderId};
    });
    await page.reload();
    await expect(page.locator(`[data-nav-folder-id="${ids.populated}"]`)).toBeVisible();
    await expect(page.locator('.asset-card')).toHaveCount(2);
    await page.waitForFunction(()=>!document.querySelector('.workspace-canvas [aria-busy="true"]'));
    await app.evaluate(({ipcMain},targets)=>{
      const handlers=(ipcMain as unknown as {_invokeHandlers:Map<string,(...args:unknown[])=>unknown>})._invokeHandlers;
      const original=handlers.get('super:library:request');if(!original)throw Error('Real Main IPC handler missing');
      let releasePage!:()=>void,releaseFolders!:()=>void,releaseInspector!:()=>void;
      const pageGate=new Promise<void>(resolve=>{releasePage=resolve;});
      const folderGate=new Promise<void>(resolve=>{releaseFolders=resolve;});
      const inspectorGate=new Promise<void>(resolve=>{releaseInspector=resolve;});
      const probe:Probe={events:[],releasePage,releaseFolders,releaseInspector};
      (globalThis as Host).__canvasFirstProbe=probe;
      ipcMain.removeHandler('super:library:request');
      ipcMain.handle('super:library:request',async(event,input:unknown)=>{
        const command=input as {type?:string;libraryId?:string;folderId?:string;parentFolderId?:string;scope?:{folderId?:string};limit?:number;layoutOnly?:boolean;idsOnly?:boolean};
        const folderId=command.folderId??command.parentFolderId??command.scope?.folderId;
        const owned=command.libraryId===targets.libraryId&&[targets.populated,targets.parent,targets.empty].includes(folderId??'');
        const primary=owned&&command.type==='asset.search.request'&&command.limit===100&&!command.layoutOnly&&!command.idsOnly;
        const folders=owned&&command.type==='folder.browse-entries.request';
        const inspector=owned&&command.type==='folder.inspect.request';
        if(primary||folders||inspector)probe.events.push({kind:primary?'page-issued':folders?'folders-issued':'inspector-issued',folderId:folderId!,at:Date.now()});
        // Always retain real authorization, parsing and SQLite execution.
        const result=await original(event,input);
        if(primary&&folderId===targets.populated)await pageGate;
        if(folders&&folderId===targets.parent)await folderGate;
        if(inspector)await inspectorGate;
        if(primary||folders)probe.events.push({kind:primary?'page-delivered':'folders-delivered',folderId:folderId!,at:Date.now()});
        return result;
      });
    },ids);
    const events=()=>app.evaluate(()=>[...(globalThis as Host).__canvasFirstProbe!.events]);
    const canvas=page.locator('.workspace-canvas');
    const importEmpty=canvas.locator('.empty-library').filter({has:page.getByRole('button',{name:'导入文件',exact:true})});
    await page.locator(`[data-nav-folder-id="${ids.populated}"]`).click();
    await expect.poll(async()=>(await events()).filter(e=>e.kind==='page-issued'&&e.folderId===ids.populated).length).toBeGreaterThan(0);
    // Cross the existing 200ms debounce so the regression is deterministic.
    await page.waitForTimeout(400);
    await page.screenshot({path:test.info().outputPath('pending-first-page.png')});
    expect.soft(await importEmpty.isVisible(),'in-flight page must never show import empty state').toBe(false);
    expect.soft(await canvas.locator('[aria-busy="true"]').isVisible()).toBe(true);
    expect.soft((await events()).filter(e=>e.kind==='inspector-issued'&&e.folderId===ids.populated)).toHaveLength(0);
    expect.soft((await events()).filter(e=>e.kind==='page-issued'&&e.folderId===ids.populated)).toHaveLength(1);
    await app.evaluate(()=>(globalThis as Host).__canvasFirstProbe!.releasePage());
    await expect(canvas.locator('.asset-card').filter({hasText:'Asset A.txt'})).toBeVisible();
    await page.screenshot({path:test.info().outputPath('canvas-before-inspector.png')});
    await expect(page.locator('.folder-inspector').getByRole('status')).toBeVisible();
    await page.locator(`[data-nav-folder-id="${ids.parent}"]`).click();
    await expect.poll(async()=>(await events()).filter(e=>e.kind==='folders-issued'&&e.folderId===ids.parent).length).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect.soft(await importEmpty.isVisible(),'a pending child-folder read is not a confirmed empty folder').toBe(false);
    expect.soft(await canvas.locator('[aria-busy="true"]').isVisible()).toBe(true);
    expect.soft((await events()).filter(e=>e.kind==='inspector-issued'&&e.folderId===ids.parent)).toHaveLength(0);
    await page.screenshot({path:test.info().outputPath('pending-child-folders.png')});
    await app.evaluate(()=>(globalThis as Host).__canvasFirstProbe!.releaseFolders());
    await expect(canvas.locator('.folder-card').filter({hasText:'Nested content'})).toBeVisible();
    await app.evaluate(()=>(globalThis as Host).__canvasFirstProbe!.releaseInspector());
    await expect(page.locator('.folder-inspector strong')).toHaveText('Has folders');
    await page.locator(`[data-nav-folder-id="${ids.empty}"]`).click();
    await expect(importEmpty).toBeVisible();
    await expect(canvas.locator('.asset-card,.folder-card')).toHaveCount(0);
    console.log('CANVAS_FIRST_REQUEST_ORDER',JSON.stringify(await events()));
    await test.info().attach('real-ipc-order',{body:JSON.stringify(await events(),null,2),contentType:'application/json'});
  } finally {
    await app.evaluate(()=>{const p=(globalThis as Host).__canvasFirstProbe;p?.releasePage();p?.releaseFolders();p?.releaseInspector();}).catch(()=>undefined);
    await app.close();
  }
});
