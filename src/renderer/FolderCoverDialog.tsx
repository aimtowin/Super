import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AssetSummary } from '../shared/asset-types';
import type { SuperLibraryApi } from '../shared/library-api';
import { IMAGE_EXTENSIONS } from '../shared/media-formats';
import { useT } from './i18n';
import { DialogShell } from './ui/patterns';
import { useDialogFocusTrap } from './use-dialog-focus-trap';
import { coverSrc } from './asset-card-hover-preview';

export function FolderCoverDialog({ api, libraryId, folderId, name, onClose, onSaved }: {
  api: SuperLibraryApi; libraryId: string; folderId: string; name: string; onClose(): void; onSaved(): void;
}) {
  const t = useT();
  const [assets, setAssets] = useState<AssetSummary[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [total, setTotal] = useState(0);
  const [coverLoaded, setCoverLoaded] = useState(false);
  useDialogFocusTrap(true);
  useEffect(() => {
    let active = true;
    void api.folderCover({ libraryId, folderId }).then(result => {
      if (!active) return;
      if (result.ok) { setSelected(result.value.assetId); setCoverLoaded(true); } else setError(result.error.message);
    }).catch(() => { if (active) setError(t('viewerUpgrade.coverError')); });
    return () => { active = false; };
  }, [api, folderId, libraryId, t]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void api.searchAssets({ libraryId, limit: 100, offset: 0,
        query: query.trim() ? { clauses: [{ field: 'filename', values: [query.trim()], exclude: false }] } : null,
        filters: [{ field: 'format', values: IMAGE_EXTENSIONS.map(extension => extension.slice(1)), exclude: false },
          { field: 'availability', values: ['available'], exclude: false }],
      }).then(result => {
        if (!active) return;
        if (result.ok) { setAssets(result.value.items.filter(asset => asset.mediaType === 'image')); setTotal(result.value.total); }
        else setError(result.error.message);
      }).catch(() => { if (active) setError(t('viewerUpgrade.coverError')); }).finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [api, libraryId, query, t]);
  async function save() {
    setSaving(true); setError(null);
    try {
      const result = await api.folderCover({ libraryId, folderId, assetId: selected });
      if (!result.ok) { setError(result.error.message); return; }
      onSaved(); onClose();
    } catch { setError(t('viewerUpgrade.coverError')); }
    finally { setSaving(false); }
  }
  return createPortal(<div className="dialog-backdrop" onKeyDown={event => {
    if (event.key === 'Escape' && !saving) onClose();
    if (event.key !== 'Tab') event.stopPropagation();
  }}>
    <DialogShell dialogId="folder-cover" className="create-dialog folder-cover-dialog" title={`${t('viewerUpgrade.cover')} · ${name}`} onRequestClose={() => { if (!saving) onClose(); }}>
      <p className="field-help">{t('viewerUpgrade.coverHint')}</p>
      <input className="text-field" aria-label={t('viewerUpgrade.coverSearch')} placeholder={t('viewerUpgrade.coverSearch')} value={query} onChange={event => setQuery(event.target.value)} />
      <div className="folder-cover-options" role="group" aria-busy={loading} aria-label={t('viewerUpgrade.cover')}>
        <button className="secondary-button" type="button" disabled={saving || !coverLoaded} aria-pressed={selected === null} onClick={() => setSelected(null)}>{t('viewerUpgrade.coverAutomatic')}</button>
        {assets.map(asset => <button className="folder-cover-option" type="button" key={asset.assetId} disabled={saving || !coverLoaded} aria-pressed={selected === asset.assetId} onClick={() => setSelected(asset.assetId)}>
          {asset.thumbnailArtifactId && <img src={coverSrc(libraryId, asset.thumbnailArtifactId)} alt="" />}<span>{asset.displayName}</span>
        </button>)}
      </div>
      <p className="field-help">{t('viewerUpgrade.coverResults', { count: assets.length, total })}</p>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" type="button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button>
        <button className="primary-button" type="button" disabled={saving || loading || !coverLoaded} onClick={() => void save()}>{t('common.save')}</button></div>
    </DialogShell>
  </div>, document.body);
}
