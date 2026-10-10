import { useEffect, useState } from 'react';
import type { SuperLibraryApi } from '../shared/library-api';
import type { FolderInspection } from '../shared/local-upgrade-results';
import { useT } from './i18n';
import { formatBytes } from './format-file-meta';
import { Icon } from './Icons';

export function FolderInspector({api, libraryId, folderId}: {api: SuperLibraryApi; libraryId: string; folderId: string}) {
  const t = useT();
  const owner = libraryId + ':' + folderId;
  const [result, setResult] = useState<{owner:string; value:FolderInspection | null; error:string} | null>(null);
  const value = result?.owner === owner ? result.value : null;
  const error = result?.owner === owner ? result.error : '';
  useEffect(() => {
    let cancelled = false;
    void api.inspectFolder({libraryId, folderId}).then(result => {
      if (cancelled) return;
      setResult({owner, value: result.ok ? result.value : null, error: result.ok ? '' : result.error.message});
    }, reason => { if (!cancelled) setResult({owner,value:null,error:String(reason)}); });
    return () => { cancelled = true; };
  }, [api, libraryId, folderId, owner]);
  return <div className="inspector-content folder-inspector" aria-label={t('localUpgrade.folderInfo')}>
    <strong>{value?.name ?? t('localUpgrade.folderInfo')}</strong>
    {error ? <p role="alert">{error}</p> : !value ? <p role="status">{t('common.loading')}</p> : <>
      <div className="folder-inspector-covers">{value.covers.map(asset => asset.thumbnailArtifactId
        ? <img key={asset.assetId} alt={asset.displayName} src={`super://preview/${libraryId}/${asset.thumbnailArtifactId}`} />
        : <span key={asset.assetId} title={asset.displayName} aria-label={asset.displayName}><Icon name="file" size={22} /></span>)}</div>
      <dl className="metadata-list">
        <div><dt>{t('settings.libraryLocation')}</dt><dd className="folder-inspector-path">{value.absolutePath}</dd></div>
        <div><dt>{t('inspector.status')}</dt><dd>{value.status === 'offline' ? t('localUpgrade.offlineIndex') : t('inspector.statusOpen')}</dd></div>
        <div><dt>{t('inspector.assets')}</dt><dd>{value.assetCount}</dd></div>
        <div><dt>{t('inspector.folders')}</dt><dd>{value.childFolderCount}</dd></div>
        <div><dt>{t('localUpgrade.indexedBytes')}</dt><dd>{formatBytes(value.byteSize)}</dd></div>
      </dl>
      <p className="muted">{t('localUpgrade.folderIndexHint')}</p>
    </>}
  </div>;
}
