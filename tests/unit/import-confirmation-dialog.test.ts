// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ImportConflictDialogShell } from '../../src/renderer/ImportConflictDialogShell';
import { LocaleProvider } from '../../src/renderer/i18n';

it('locks confirmation, cancellation and decisions with visible import progress', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const confirm = vi.fn();
  const cancel = vi.fn();
  try {
    await act(async () => root.render(createElement(LocaleProvider, { initialPreference: 'zh-CN', children: null },
      createElement(ImportConflictDialogShell, {
        titleId: 'duplicate-title', title: '重复内容', summary: '324 个重复文件',
        decisionLabel: '重复处理', decisionControlId: 'decision',
        decision: createElement('select', { id: 'decision' }, createElement('option', null, '跳过')),
        rememberId: 'remember', remember: false, rememberLabel: '记住', onRememberChange: vi.fn(),
        examples: [], confirmLabel: '继续', onConfirm: confirm, onCancel: cancel, submitting: true,
      }))));
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    expect(host.textContent).toContain('正在导入');
    await act(async () => { buttons.forEach((button) => button.click()); });
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
