import { describe, expect, it } from 'vitest';
import { colorFilterSql, parseColorFilterIds, parseCustomColor } from '../../src/shared/color-filter-presets';
import { matchingTreeIds, orderSidebarTree, parseTagNames } from '../../src/renderer/sidebar-discovery';
import { applyViewerDisplayTransformAction, IDENTITY_VIEWER_DISPLAY_TRANSFORM } from '../../src/renderer/viewer-display-transform';
import { VIDEO_PLAYBACK_RATES } from '../../src/renderer/video-player-controls';

describe('remaining local capabilities', () => {
  it('retains preset tokens and rejects injected or unbounded custom colors', () => {
    expect(parseColorFilterIds('red,#ff0000~20,gray,#fff~20,#ffffff~101')).toEqual(['red','#ff0000~20','gray']);
    expect(parseCustomColor('#ff0000~20')).toMatchObject({ hue: 0, saturation: 1, lightness: 0.5 });
    const match = colorFilterSql('p.h', ['#ff0000~20'], false, 'p.l', 'p.s')!;
    expect(match.sql).toContain('MIN(ABS');
    expect(match.sql).not.toContain('#ff0000');
    expect(match.params).toHaveLength(7);
    expect(colorFilterSql('p.h',['#808080~0'],false,'p.l','p.s')!.params).toHaveLength(4);
  });
  it('keeps matching ancestors and tree order including corrupt cycles', () => {
    const rows = [{ id:'a', parent:null, name:'Z' }, { id:'b', parent:'a', name:'Child' }, { id:'c', parent:null, name:'A' }];
    expect([...matchingTreeIds(rows,'child',row=>row.id,row=>row.parent,row=>row.name)]).toEqual(['b','a']);
    expect(orderSidebarTree(rows,'name-asc',row=>row.id,row=>row.parent,row=>row.name).map(row=>row.id)).toEqual(['c','a','b']);
    expect(orderSidebarTree([{id:'a',parent:'b',name:'A'},{id:'b',parent:'a',name:'B'}],'name-asc',row=>row.id,row=>row.parent,row=>row.name)).toHaveLength(2);
  });
  it('splits Chinese/ASCII comma tags without duplicate or empty writes', () => {
    expect(parseTagNames('设计，角色,设计,, 游戏 ')).toEqual(['设计','角色','游戏']);
    expect(parseTagNames(Array.from({length:40},(_,i)=>String(i)).join(','))).toHaveLength(32);
  });
  it('supports reverse rotation and bounded playback rates', () => {
    expect(applyViewerDisplayTransformAction(IDENTITY_VIEWER_DISPLAY_TRANSFORM,'rotate-counterclockwise').quarterTurns).toBe(-1);
    expect(VIDEO_PLAYBACK_RATES[0]).toBe(0.25);
    expect(VIDEO_PLAYBACK_RATES.at(-1)).toBe(4);
  });
});
