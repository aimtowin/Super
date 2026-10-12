import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Execute only the current trusted App reset function, with explicit state ports.
function resetFixture(active=false) {
  const source=ts.createSourceFile('App.tsx',readFileSync(path.resolve('src/renderer/App.tsx'),'utf8'),ts.ScriptTarget.ES2023,true,ts.ScriptKind.TSX);
  let subject:ts.FunctionDeclaration|undefined;
  const find=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='clearDiscoveryControls')subject=node;ts.forEachChild(node,find);};find(source);
  if(!subject)throw Error('Actual App reset not found');
  const rangeNames=['setWidthRange','setHeightRange','setAspectRatioRange','setDurationRange','setLongEdgeRange'];
  const scalarNames=['setSearchValue','setFormatFilter','setExcludeFormatFilter','setColorFilter','setExcludeColorFilter','setTagFilter','setExcludeTagFilter','setRatingFilter','setExcludeRatingFilter','setFavoriteFilter','setSourceUrlFilter','setAvailabilityFilter','setExcludeAvailabilityFilter','setAnalysisStatusFilter'];
  const states=new Map<string,unknown>(rangeNames.map(name=>[name,{min:active?'10':'',max:'',exclude:active}]));
  states.set('setAspectRatioRanges',active?[{min:'2',max:'4',exclude:false}]:[]);
  const previous=new Map(states), ports:Record<string,unknown>={hadDiscoveryInput:{current:true}};
  for(const name of [...rangeNames,'setAspectRatioRanges',...scalarNames])ports[name]=(value:unknown)=>{
    states.set(name,typeof value==='function'?(value as (old:unknown)=>unknown)(states.get(name)):value);
  };
  const emitted=ts.transpileModule(subject.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
  const run=new Function(...Object.keys(ports),`"use strict";${emitted};return clearDiscoveryControls;`)(...Object.values(ports)) as ()=>void;
  return {run,states,previous};
}
describe('actual discovery reset identity',()=>{
  it('does not retrigger non-default-sort debounce by reallocating already empty controls',()=>{
    const f=resetFixture();f.run();
    for(const [name,value]of f.previous)expect(f.states.get(name),name).toBe(value);
  });
  it('still clears real range filters and excluded/multiple ratios',()=>{
    const f=resetFixture(true);f.run();
    for(const [name]of f.previous)expect(f.states.get(name)).toEqual(name==='setAspectRatioRanges'?[]:{min:'',max:'',exclude:false});
  });
});
