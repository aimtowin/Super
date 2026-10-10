import { useEffect, useState } from 'react';
import type { SuperLibraryApi } from '../shared/library-api';
import type { EmbeddedGenerationInfo } from '../shared/local-upgrade-results';
import { useT } from './i18n';
export function EmbeddedGenerationPanel({api,libraryId,assetId}: {api: SuperLibraryApi;libraryId:string;assetId:string}) {
  const t = useT(), owner = libraryId + ':' + assetId;
  const [result,setResult] = useState<{owner:string; value:EmbeddedGenerationInfo | null} | null>(null);
  const value = result?.owner === owner ? result.value : null;
  useEffect(() => {
    let cancelled = false;
    void api.getEmbeddedGeneration({libraryId,assetId}).then(result => {if (!cancelled && result.ok) setResult({owner,value:result.value});}, () => {});
    return () => {cancelled = true;};
  }, [api,libraryId,assetId,owner]);
  if (!value) return null;
  return <details className="embedded-generation-panel">
    <summary>{t('localUpgrade.embeddedInfo')} · {value.generator}</summary>
    <p>{t('localUpgrade.generationHint')}</p>
    {Object.entries(value.fields).map(([name,text]) => <div key={name}><strong>{name}</strong><pre>{text}</pre></div>)}
  </details>;
}
