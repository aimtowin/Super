import { useRef, useState } from 'react';
import type { SuperLibraryApi } from '../shared/library-api';
import { parseLinkedVirtualFolderId } from '../shared/linked-folder-tree';
import { DialogShell } from './ui/patterns';
import { useLocale, useT } from './i18n';
import { messageForPublicError, toMessage } from './error-utils';
export function BatchFoldersDialog({api, libraryId, parentFolderId, linked, onClose, onDone}: {
  api: SuperLibraryApi; libraryId: string; parentFolderId: string | null; linked: boolean; onClose(): void; onDone(): Promise<void>;
}) {
  const t = useT(), [names,setNames] = useState(''), [busy,setBusy] = useState(false);
  const {locale} = useLocale();
  const [results,setResults] = useState<Array<{name: string; error?: string}>>([]);
  const running = useRef(false);
  const [succeeded] = useState(() => new Set<string>());
  async function create() {
    if (running.current) return;
    const list = [...new Set(names.split(/\r?\n/u).map(name => name.trim().normalize('NFC')).filter(Boolean))];
    if (!list.length || list.length > 32) return;
    running.current=true; setBusy(true); const next: Array<{name: string; error?: string}> = [];
    try {
      for (const name of list) {
        if (succeeded.has(name)) { next.push({name}); continue; }
        try {
          const scope = parentFolderId ? parseLinkedVirtualFolderId(parentFolderId) : null;
          const result = linked && parentFolderId
            ? await api.createLinkedFolderDirectory({libraryId,linkedFolderId:scope?.linkedFolderId ?? parentFolderId,relativePath:scope?.relativePath ?? '',name})
            : await api.createFolder({libraryId,parentFolderId:parentFolderId ?? undefined,name});
          if (result.ok) { succeeded.add(name); next.push({name}); }
          else next.push({name,error:messageForPublicError(result.error, locale)});
        } catch (error) { next.push({name,error:toMessage(error, t('toast.createFolderFailed'), locale)}); }
        setResults([...next]);
      }
      await onDone();
    } finally {running.current=false; setBusy(false);}
  }
  return <div className="dialog-backdrop" role="presentation">
    <DialogShell className="create-dialog batch-folders-dialog" title={t('localUpgrade.batchFolders')} dialogId="batch-folders">
      <p>{t('localUpgrade.batchFolderHint')} · {t('localUpgrade.batchLimit')}</p>
      <textarea className="text-field" aria-label={t('localUpgrade.batchFolderHint')} rows={8} maxLength={8192} disabled={busy} value={names} onChange={event => setNames(event.target.value)} />
      <ul className="batch-folder-results" aria-live="polite">{results.map(row => <li key={row.name}>{row.name}: {row.error ?? t('localUpgrade.batchDone')}</li>)}</ul>
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{t('common.close')}</button>
        <button className="primary-button" disabled={busy || !names.trim() || names.split(/\r?\n/u).filter(row => row.trim()).length > 32} type="button" onClick={() => void create()}>{busy ? t('common.loading') : t('common.create')}</button></div>
    </DialogShell>
  </div>;
}
