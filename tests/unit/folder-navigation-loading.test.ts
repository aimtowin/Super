// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {FolderBrowseEntry} from '../../src/shared/asset-types';
import type {SuperLibraryApi} from '../../src/shared/library-api';
import {createPublicError} from '../../src/shared/protocol/errors';
import {createMetadataReadController} from '../../src/renderer/metadata-read-controller';
import {useFolderBrowseEntries,type FolderBrowseRequest} from '../../src/renderer/use-folder-browse-entries';
import {FolderInspector} from '../../src/renderer/FolderInspector';
import {LocaleProvider} from '../../src/renderer/i18n/LocaleProvider';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const roots:Array<{root:Root;container:HTMLDivElement}>=[];
const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function session(){return createMetadataReadController(async()=>{throw Error('Unused metadata port');}).activateSession({libraryId:'same-library',displayName:'Fixture',displayPath:'owned-fixture'});}
function folder(folderId:string):FolderBrowseEntry{return {folderId,parentFolderId:null,name:folderId,relativePath:folderId,locationKind:'managed',status:'available',directAssetCount:1,recursiveAssetCount:1,childFolderCount:0,coverAssetIds:[],coverArtifactIds:[],linkedFolderId:null};}
function createHost(){const container=document.createElement('div');document.body.append(container);const host={root:createRoot(container),container};roots.push(host);return host;}
type Input=Parameters<typeof useFolderBrowseEntries>[0];
async function fixture(){
  const requests:Array<ReturnType<typeof deferred<Awaited<ReturnType<SuperLibraryApi['listFolderBrowseEntries']>>>>>=[];
  const read=vi.fn((_input:unknown)=>{void _input;const pending=deferred<Awaited<ReturnType<SuperLibraryApi['listFolderBrowseEntries']>>>();requests.push(pending);return pending.promise;});
  const api={listFolderBrowseEntries:read,listCollectionSourceBrowseEntries:read} as unknown as SuperLibraryApi;
  const host=createHost();let snapshot!:ReturnType<typeof useFolderBrowseEntries>;
  let input:Input={api,owner:session(),request:{kind:'folder',libraryId:'same-library',parentFolderId:'A',showIgnored:false},firstPageReady:false,firstPageToken:0,scopeToken:0,contentLoading:true,refresh:0};
  function Host(props:Input){snapshot=useFolderBrowseEntries(props);return createElement('span');}
  const render=async(patch:Partial<Input>={})=>{input={...input,...patch};await act(async()=>host.root.render(createElement(Host,input)));};
  await render();return {get:()=>snapshot,read,requests,render,get input(){return input;}};
}
afterEach(async()=>{for(const host of roots.splice(0)){await act(async()=>host.root.unmount());host.container.remove();}vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('actual folder-card read ownership',()=>{
  it('keeps the no-folder array stable across unrelated renders',async()=>{
    const f=await fixture();await f.render({request:null});const first=f.get().entries;
    await f.render();expect(f.get().entries).toBe(first);
  });
  it('does not queue folder cards before foreground success, including a successful zero-asset page',async()=>{
    const f=await fixture();expect(f.read).not.toHaveBeenCalled();expect(f.get()).toMatchObject({loading:true,entries:[]});
    await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    expect(f.read).toHaveBeenCalledTimes(1);expect(f.read.mock.calls[0]?.[0]).not.toHaveProperty('kind');
    expect(f.get().loading).toBe(true);
    await act(async()=>f.requests[0]!.resolve({ok:true,value:[]}));expect(f.get()).toMatchObject({loading:false,error:null,entries:[]});
  });
  it('rejects stale directory cards during A to B to A navigation even when IDs match again',async()=>{
    const f=await fixture();await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    await f.render({request:{kind:'folder',libraryId:'same-library',parentFolderId:'B',showIgnored:false},firstPageToken:2,scopeToken:2});
    await f.render({request:{kind:'folder',libraryId:'same-library',parentFolderId:'A',showIgnored:false},firstPageToken:3,scopeToken:3});
    await act(async()=>{f.requests[0]!.resolve({ok:true,value:[folder('old-A')]});f.requests[1]!.resolve({ok:true,value:[folder('old-B')]});});
    expect(f.get()).toMatchObject({entries:[],loading:true});
    await act(async()=>f.requests[2]!.resolve({ok:true,value:[folder('fresh-A')]}));expect(f.get().entries[0]?.folderId).toBe('fresh-A');
  });
  it('isolates a reopened same-ID library session',async()=>{
    const f=await fixture();await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    await f.render({owner:session()});
    await act(async()=>f.requests[0]!.resolve({ok:true,value:[folder('old-session')]}));expect(f.get()).toMatchObject({loading:true,entries:[]});
    await act(async()=>f.requests[1]!.resolve({ok:true,value:[folder('new-session')]}));expect(f.get().entries[0]?.folderId).toBe('new-session');
  });
  it('keeps existing same-page folder cards during a thumbnail refresh, not during navigation',async()=>{
    const f=await fixture();await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    await act(async()=>f.requests[0]!.resolve({ok:true,value:[folder('ready')]}));
    await f.render({refresh:1});expect(f.get().entries[0]?.folderId).toBe('ready');expect(f.get().loading).toBe(true);
    await f.render({firstPageReady:false,contentLoading:true});expect(f.get().entries).toEqual([]);
    await act(async()=>f.requests[1]!.resolve({ok:true,value:[folder('stale-thumbnail')]}));expect(f.get().entries).toEqual([]);
  });
  it('retains usable cards while a same-scope foreground reconciliation replaces its page',async()=>{
    const f=await fixture();await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    await act(async()=>f.requests[0]!.resolve({ok:true,value:[folder('ready')]}));
    await f.render({contentLoading:true});expect(f.get().entries[0]?.folderId).toBe('ready');
    await f.render({contentLoading:false,firstPageToken:2});expect(f.get().entries[0]?.folderId).toBe('ready');expect(f.get().loading).toBe(true);
    await act(async()=>f.requests[1]!.resolve({ok:true,value:[folder('updated')]}));expect(f.get().entries[0]?.folderId).toBe('updated');
  });
  it.each(['typed','transport'] as const)('marks a %s failure as an error rather than a successful empty result',async(kind)=>{
    const f=await fixture();await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    await act(async()=>kind==='typed'?f.requests[0]!.resolve({ok:false,error:createPublicError('FOLDER_NOT_FOUND')}):f.requests[0]!.reject(Error('Owned transport failure')));
    expect(f.get().loading).toBe(false);expect(f.get().error).toBeTruthy();expect(f.get().entries).toEqual([]);
  });
  it('removes previous cards when leaving a folder and scopes collection-source cards correctly',async()=>{
    const f=await fixture();await f.render({firstPageReady:true,firstPageToken:1,contentLoading:false});
    await act(async()=>f.requests[0]!.resolve({ok:true,value:[folder('A')]}));
    await f.render({request:null});expect(f.get()).toMatchObject({entries:[],loading:false,error:null});
    const request:FolderBrowseRequest={kind:'collection',libraryId:'same-library',collectionId:'C',recursive:true,parentFolderId:null,showIgnored:true};
    await f.render({request,firstPageToken:2});expect(f.read.mock.calls[1]?.[0]).toEqual({libraryId:'same-library',collectionId:'C',recursive:true,parentFolderId:null,showIgnored:true});
  });
});

describe('actual secondary Inspector scheduling',()=>{
  it('ignores a late Inspector response after the same library ID is reopened', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    type InspectionResult = Awaited<ReturnType<SuperLibraryApi['inspectFolder']>>;
    const previous = deferred<InspectionResult>(), current = deferred<InspectionResult>();
    const inspect = vi.fn().mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
    const api = {inspectFolder: inspect} as unknown as SuperLibraryApi;
    const host = createHost();
    const render = async (sessionOwner: ReturnType<typeof session>) => act(async () => host.root.render(
      createElement(LocaleProvider, {initialPreference: 'zh-CN', children: createElement(FolderInspector, {
        api, libraryId: 'same-library', folderId: 'A', sessionOwner,
      })}),
    ));
    await render(session());
    await act(async () => vi.runAllTimers());
    await render(session());
    await act(async () => vi.runAllTimers());
    expect(inspect).toHaveBeenCalledTimes(2);
    const response = (name: string): InspectionResult => ({ok: true, value: {
      folderId: 'A', name, absolutePath: 'owned-fixture', locationKind: 'managed', status: 'available',
      assetCount: 1, childFolderCount: 0, byteSize: 1, covers: [],
    }});
    await act(async () => current.resolve(response('Current folder')));
    await act(async () => previous.resolve(response('Old folder')));
    expect(host.container.textContent).toContain('Current folder');
    expect(host.container.textContent).not.toContain('Old folder');
  });
  it('waits for the current canvas and a paint opportunity before dispatching',async()=>{
    vi.useFakeTimers();const frames=new Map<number,FrameRequestCallback>();let id=0;
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id;});
    vi.stubGlobal('cancelAnimationFrame',(frame:number)=>{frames.delete(frame);});
    const inspect=vi.fn(()=>new Promise<never>(()=>undefined)), api={inspectFolder:inspect} as unknown as SuperLibraryApi;
    const host=createHost();const render=async(canvasPending:boolean,folderId='A')=>act(async()=>host.root.render(createElement(LocaleProvider,{initialPreference:'zh-CN',children:createElement(FolderInspector,{api,libraryId:'same-library',folderId,canvasPending})})));
    await render(true);expect(inspect).not.toHaveBeenCalled();expect(frames.size).toBe(0);
    await render(false);expect(inspect).not.toHaveBeenCalled();expect(frames.size).toBe(1);
    await act(async()=>{for(const callback of frames.values())callback(0);frames.clear();});expect(inspect).not.toHaveBeenCalled();
    await act(async()=>vi.advanceTimersByTime(0));expect(inspect).toHaveBeenCalledExactlyOnceWith({libraryId:'same-library',folderId:'A'});
    await render(true,'B');expect(inspect).toHaveBeenCalledTimes(1);
  });
  it('cancels undispatched frames and timers on rapid scope switches',async()=>{
    vi.useFakeTimers();const frames=new Map<number,FrameRequestCallback>();let id=0;
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id;});
    vi.stubGlobal('cancelAnimationFrame',(frame:number)=>{frames.delete(frame);});
    const inspect=vi.fn(()=>new Promise<never>(()=>undefined)), api={inspectFolder:inspect} as unknown as SuperLibraryApi;
    const host=createHost();const render=async(folderId:string,canvasPending=false)=>act(async()=>host.root.render(createElement(LocaleProvider,{initialPreference:'zh-CN',children:createElement(FolderInspector,{api,libraryId:'same-library',folderId,canvasPending})})));
    await render('A');await render('B',true);expect(frames.size).toBe(0);
    await render('B');await act(async()=>{for(const callback of frames.values())callback(0);frames.clear();});
    await render('C',true);await act(async()=>vi.advanceTimersByTime(0));expect(inspect).not.toHaveBeenCalled();
  });
});
