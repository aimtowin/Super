import { describe, expect, it } from 'vitest';
import { closeWorkspace, initialWorkspaces, updateWorkspaceValue, type WorkspaceRegistry } from '../../src/renderer/use-workspaces';
import { createWorkspaceNavHistory } from '../../src/renderer/workspace-nav-history';
describe('independent bounded workspaces', () => {
  it('isolates values, functional updates, navigation, and closes the active tab predictably', () => {
    let state: WorkspaceRegistry = initialWorkspaces();
    state = updateWorkspaceValue(state,'search','first','');
    const firstHistory = createWorkspaceNavHistory(); firstHistory.push({kind:'folder',folderId:'first'});
    state = updateWorkspaceValue(state,'history',firstHistory,firstHistory);
    state = {...state, activeId:'other',items:[...state.items,{id:'other',name:'2',values:{},scroll:{left:0,top:100}}]};
    state = updateWorkspaceValue<string>(state,'search', value => value + 'second','');
    const secondHistory = createWorkspaceNavHistory();
    state = updateWorkspaceValue(state,'history',secondHistory,secondHistory);
    expect(state.items[0]!.values.search).toBe('first');
    expect(state.items[1]!.values.search).toBe('second');
    secondHistory.push({kind:'trash',tombstoneId:null});
    expect(firstHistory.current).toEqual({kind:'folder',folderId:'first'});
    state = closeWorkspace(state,'other');
    expect(state.activeId).toBe('main');
    expect(closeWorkspace(state,'main')).toBe(state);
  });
});
