import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SuperLibraryApi } from '../shared/library-api';
import type { ZipPreview } from '../shared/zip-preview';
import { MarkdownPreview } from './MarkdownPreview';
import { useT } from './i18n';

export function ZipViewerSurface({ api, libraryId, assetId }: { api: SuperLibraryApi; libraryId: string; assetId: string }) {
  const t = useT();
  const [preview, setPreview] = useState<ZipPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const invalidateRequests = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    const run = ++sequence.current;
    void api.previewZipAsset({ libraryId, assetId }).then(result => {
      if (sequence.current !== run) return;
      if (result.ok) setPreview(result.value); else setError(t('viewerUpgrade.zipError'));
    }).catch(() => { if (sequence.current === run) setError(t('viewerUpgrade.zipError')); });
    return invalidateRequests;
  }, [api, assetId, libraryId, t, invalidateRequests]);
  async function select(name: string) {
    if (!preview) return;
    const run = ++sequence.current; setBusy(true); setError(null);
    try {
      const result = await api.previewZipAsset({ libraryId, assetId, memberPath: name, expectedRevisionId: preview.revisionId });
      if (sequence.current !== run) return;
      if (result.ok) setPreview(result.value); else setError(t('viewerUpgrade.zipMemberError'));
    } catch { if (sequence.current === run) setError(t('viewerUpgrade.zipMemberError')); }
    finally { if (sequence.current === run) setBusy(false); }
  }
  const member = preview?.member;
  const content = useMemo(() => member?.mime.startsWith('text/') ? new TextDecoder('utf-8').decode(Uint8Array.from(atob(member.base64), c => c.charCodeAt(0))) : '', [member]);
  return <div className="zip-viewer-stage">
    <aside className="zip-viewer-members">
      <strong>{t('viewerUpgrade.zipReadonly')}</strong>
      <input className="text-field" aria-label={t('viewerUpgrade.zipSearch')} placeholder={t('viewerUpgrade.zipSearch')} value={filter} onChange={event => setFilter(event.target.value)} />
      <div className="zip-viewer-list" role="group" aria-label={t('viewerUpgrade.zipReadonly')} aria-busy={!preview}>
        {preview?.entries.filter(entry => entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(entry =>
          <button key={entry.name} type="button" disabled={entry.directory || busy}
            aria-current={member?.name === entry.name ? 'true' : undefined} onClick={() => void select(entry.name)} title={entry.name}>
            <span>{entry.directory ? '▸ ' : ''}{entry.name}</span><small>{entry.directory ? '' : `${Math.ceil(entry.size / 1024)} KB`}</small>
          </button>)}
      </div>
    </aside>
    <div className="zip-viewer-preview" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      {member?.mime.startsWith('image/') ? <img alt={member.name} src={`data:${member.mime};base64,${member.base64}`} /> :
        member?.mime === 'text/markdown' ? <MarkdownPreview content={content} /> :
        member ? <pre>{content}</pre> : <p>{t(preview ? 'viewerUpgrade.zipSelect' : 'preview.textLoading')}</p>}
    </div>
  </div>;
}
