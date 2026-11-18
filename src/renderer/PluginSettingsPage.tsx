import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  PluginManagerPackageSummary,
  PluginManagerRequest,
  PluginManagerResolutionCandidate,
  PluginManagerResolutionSummary,
  SuperPluginManagerApi,
} from '../shared/plugin-manager-api';
import type { PluginInstallProgress } from '../shared/plugin-install-progress';
import type { ExtensionCatalogEntry } from '../shared/extension-catalog';
import { parseGitHubRepositoryUrl } from '../shared/plugin-github-url';
import { Icon } from './Icons';
import { iconActionAttrs } from './icon-action-attrs';
import { useT } from './i18n';
import { pluginRequiresTrustedCssDisclosure } from '../plugins/plugin-themes';
import { DialogShell } from './ui/patterns';

type PluginSettingsPageProps = {
  readonly api: SuperPluginManagerApi | undefined;
  readonly libraryId: string | undefined;
  readonly onOpenPluginSettings?: (pluginId: string) => void;
  readonly refreshKey: string | null;
};

type PluginSnapshot = Extract<
  Awaited<ReturnType<SuperPluginManagerApi['request']>>,
  { ok: true; packages: unknown }
>;

type InstallScope = 'user' | 'library';

type RendererShellApi = {
  openExternalUrl(url: string): Promise<{ ok: boolean }>;
};

function compareExtensionVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value
    .split('-')[0]!
    .split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! - b[index]!;
  }
  return 0;
}

function formatPluginManagerFailure(
  response: Extract<Awaited<ReturnType<SuperPluginManagerApi['request']>>, { ok: false }>,
  t: ReturnType<typeof useT>,
): string {
  if (response.message !== undefined && response.message.trim() !== '') {
    return t('settings.pluginOperationFailedDetail', {
      code: response.failureCode ?? response.code,
      message: response.message,
    });
  }
  return t('settings.pluginOperationFailed', { code: response.failureCode ?? response.code });
}

function candidateLabel(candidate: PluginManagerResolutionCandidate, t: ReturnType<typeof useT>): string {
  return candidate.scope === 'user'
    ? t('settings.pluginUseUserVersion', { version: candidate.version })
    : t('settings.pluginUseLibraryVersion', { version: candidate.version });
}

function isPluginEnabledForScope(
  resolution: PluginManagerResolutionSummary | undefined,
  scope: InstallScope,
): boolean {
  if (resolution?.status !== 'resolved') return false;
  if (resolution.selection === 'use-global') return scope === 'user';
  if (resolution.selection === 'use-library') return scope === 'library';
  return false;
}

function canTogglePluginEnabled(
  resolution: PluginManagerResolutionSummary | undefined,
  libraryId: string | undefined,
): boolean {
  if (libraryId === undefined) return false;
  if (resolution === undefined) return false;
  if (resolution.status === 'resolved') return true;
  if (resolution.status === 'disabled' && resolution.reason === 'user-disabled') return true;
  if (resolution.status === 'awaiting-trust') return true;
  if (resolution.status === 'requires-confirmation') return true;
  return false;
}

function pluginEnableRiskMessage(
  pluginPackage: PluginManagerPackageSummary,
  t: ReturnType<typeof useT>,
): string {
  const permissions = pluginPackage.permissions.length > 0
    ? pluginPackage.permissions.join(', ')
    : t('settings.pluginNoPermissions');
  const runtime = pluginPackage.runtimeMode === 'unrestricted'
    ? t('settings.pluginRuntimeTrusted')
    : t('settings.pluginRuntimeStandard');
  return t('settings.pluginEnableRisk', {
    plugin: pluginPackage.name,
    runtime,
    permissions,
  });
}

function confirmationPackage(
  resolution: Extract<PluginManagerResolutionSummary, { status: 'requires-confirmation' }>,
): PluginManagerResolutionCandidate {
  return resolution.candidate ?? resolution.current;
}

function confirmationHintKey(
  reason: Extract<PluginManagerResolutionSummary, { status: 'requires-confirmation' }>['reason'],
): 'settings.pluginUpdateNeedsConfirmation'
  | 'settings.pluginConfirmPermissionsIncreased'
  | 'settings.pluginConfirmRuntimeChanged'
  | 'settings.pluginConfirmSourceChanged' {
  switch (reason) {
    case 'permissions-increased':
      return 'settings.pluginConfirmPermissionsIncreased';
    case 'runtime-mode-changed':
      return 'settings.pluginConfirmRuntimeChanged';
    case 'source-changed':
      return 'settings.pluginConfirmSourceChanged';
    case 'selected-package-unavailable':
      return 'settings.pluginUpdateNeedsConfirmation';
  }
}

function shellApi(): RendererShellApi | undefined {
  return (window as unknown as { super?: { shell?: RendererShellApi } }).super?.shell;
}

function formatInstallBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function PluginSettingsPage({
  api,
  libraryId,
  onOpenPluginSettings,
  refreshKey,
}: PluginSettingsPageProps): ReactNode {
  const t = useT();
  const [snapshot, setSnapshot] = useState<PluginSnapshot | undefined>();
  const [installOpen, setInstallOpen] = useState(false);
  const [installScope, setInstallScope] = useState<InstallScope>('user');
  const [githubRepository, setGithubRepository] = useState('');
  const [githubInstallOpen, setGithubInstallOpen] = useState(false);
  const [githubOperationId, setGithubOperationId] = useState<string | undefined>();
  const [githubProgress, setGithubProgress] = useState<PluginInstallProgress | undefined>();
  const [serverCatalogOpen, setServerCatalogOpen] = useState(false);
  const [serverCatalog, setServerCatalog] = useState<ExtensionCatalogEntry[] | undefined>();
  const [serverCatalogLoading, setServerCatalogLoading] = useState(false);
  const [pendingEnable, setPendingEnable] = useState<PluginManagerPackageSummary | undefined>();
  const [extensionTutorialOpen, setExtensionTutorialOpen] = useState(false);
  const [extensionTutorialStep, setExtensionTutorialStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [installError, setInstallError] = useState<string | undefined>();
  const [autoUpdateExtensions, setAutoUpdateExtensions] = useState<boolean>(() => {
    try {
      return globalThis.localStorage.getItem('super.extensions.auto-update.v1') !== '0';
    } catch {
      return true;
    }
  });
  const [availableUpdates, setAvailableUpdates] = useState<Array<{
    entry: ExtensionCatalogEntry;
    package: PluginManagerPackageSummary;
  }>>([]);
  const [extensionUpdateMessage, setExtensionUpdateMessage] = useState<string | undefined>();
  const updateCheckStarted = useRef(false);

  useEffect(() => {
    if (api?.onInstallProgress === undefined) return undefined;
    return api.onInstallProgress((event) => {
      if (event.operationId === githubOperationId) setGithubProgress(event);
    });
  }, [api, githubOperationId]);

  const load = useCallback(async () => {
    if (api === undefined) {
      setError(t('settings.pluginUnavailable'));
      return;
    }
    setLoading(true);
    try {
      const response = await api.request({
        type: 'plugin-manager.list',
        ...(libraryId === undefined ? {} : { libraryId }),
      });
      if (!response.ok) {
        setError(formatPluginManagerFailure(response, t));
        return;
      }
      if (!('packages' in response)) {
        setError(t('settings.pluginOperationFailed', { code: 'unexpected-response' }));
        return;
      }
      setSnapshot(response);
      setError(undefined);
    } catch {
      setError(t('settings.pluginOperationFailed', { code: 'bridge-unavailable' }));
    } finally {
      setLoading(false);
    }
  }, [api, libraryId, t]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load, refreshKey]);

  const checkServerUpdates = useCallback(async (autoInstall: boolean): Promise<void> => {
    if (api === undefined || snapshot === undefined) return;
    const installed = snapshot.packages.filter((item) =>
      item.status === 'valid' && item.sourceFingerprint.startsWith('server:'));
    if (installed.length === 0) {
      setAvailableUpdates([]);
      return;
    }
    try {
      const response = await api.request({ type: 'plugin-manager.list-server-extensions' });
      if (!response.ok || !('extensions' in response)) {
        if (!autoInstall) setExtensionUpdateMessage(t('settings.pluginExtensionsUpdateFailed'));
        return;
      }
      const updates = installed.flatMap((item) => {
        const entry = response.extensions.find((candidate) => candidate.id === item.pluginId);
        return entry !== undefined && compareExtensionVersions(entry.version, item.version) > 0
          ? [{ entry, package: item }]
          : [];
      });
      setAvailableUpdates(updates);
      if (updates.length === 0) {
        setExtensionUpdateMessage(t('settings.pluginExtensionsUpToDate'));
        return;
      }
      if (!autoInstall) {
        setExtensionUpdateMessage(t('settings.pluginUpdatesAvailable', { count: updates.length }));
        return;
      }
      setBusy(true);
      let installedCount = 0;
      const previousResolutions = new Map(
        snapshot.resolutions.map((resolution) => [resolution.pluginId, resolution]),
      );
      for (const update of updates) {
        const result = await api.request({
          type: 'plugin-manager.install-server-extension',
          pluginId: update.entry.id,
          scope: update.package.scope,
          ...(update.package.scope === 'library' && libraryId !== undefined ? { libraryId } : {}),
        });
        if (result.ok) installedCount += 1;
      }
      if (installedCount > 0) {
        // Keep the previous enablement decision across a server update. The
        // package hash changes with every release, so without resolving the
        // new hash the extension would appear installed but disabled.
        const refreshed = await api.request({
          type: 'plugin-manager.list',
          ...(libraryId === undefined ? {} : { libraryId }),
        });
        if (refreshed.ok && 'packages' in refreshed) {
          for (const update of updates) {
            const previous = previousResolutions.get(update.entry.id);
            if (previous?.status !== 'resolved' || libraryId === undefined) continue;
            const nextPackage = refreshed.packages.find((item) =>
              item.pluginId === update.entry.id
              && item.version === update.entry.version
              && item.status === 'valid');
            if (nextPackage === undefined) continue;
            if (nextPackage.trust !== 'trusted') {
              const trusted = await api.request({
                type: 'plugin-manager.trust',
                scope: nextPackage.scope,
                ...(nextPackage.scope === 'library' ? { libraryId } : {}),
                pluginId: nextPackage.pluginId,
                packageHash: nextPackage.packageHash,
                decision: 'trusted',
              });
              if (!trusted.ok) continue;
            }
            await api.request({
              type: 'plugin-manager.resolve',
              libraryId,
              pluginId: nextPackage.pluginId,
              selection: nextPackage.scope === 'user' ? 'use-global' : 'use-library',
              packageHash: nextPackage.packageHash,
              ...(nextPackage.scope === 'user' ? { propagateUserScoped: true } : {}),
            });
          }
        }
        setExtensionUpdateMessage(t('settings.pluginExtensionsUpdated', { count: installedCount }));
        setAvailableUpdates([]);
        await load();
      } else {
        setExtensionUpdateMessage(t('settings.pluginExtensionsUpdateFailed'));
      }
    } catch {
      setExtensionUpdateMessage(t('settings.pluginExtensionsUpdateFailed'));
    } finally {
      setBusy(false);
    }
  }, [api, libraryId, load, snapshot, t]);

  useEffect(() => {
    if (snapshot === undefined || updateCheckStarted.current) return;
    updateCheckStarted.current = true;
    void checkServerUpdates(autoUpdateExtensions);
  }, [autoUpdateExtensions, checkServerUpdates, snapshot]);

  const installAvailableUpdates = useCallback(async (): Promise<void> => {
    await checkServerUpdates(true);
  }, [checkServerUpdates]);

  const execute = useCallback(async (request: PluginManagerRequest): Promise<boolean> => {
    if (api === undefined) {
      setError(t('settings.pluginUnavailable'));
      return false;
    }
    setBusy(true);
    try {
      const response = await api.request(request);
      if (!response.ok) {
        if (response.code !== 'selection-cancelled') {
          setError(formatPluginManagerFailure(response, t));
        }
        return false;
      }
      setError(undefined);
      await load();
      return true;
    } catch {
      setError(t('settings.pluginOperationFailed', { code: 'bridge-unavailable' }));
      return false;
    } finally {
      setBusy(false);
    }
  }, [api, load, t]);

  const resolutionByPluginId = useMemo(
    () => new Map(snapshot?.resolutions.map((resolution) => [resolution.pluginId, resolution]) ?? []),
    [snapshot],
  );

  const packagesByScope = useMemo(() => {
    const user: PluginManagerPackageSummary[] = [];
    const library: PluginManagerPackageSummary[] = [];
    for (const item of snapshot?.packages ?? []) {
      if (item.scope === 'user') user.push(item);
      else library.push(item);
    }
    const sortPackages = (items: PluginManagerPackageSummary[]) => [...items].sort((left, right) => {
      const byId = left.pluginId.localeCompare(right.pluginId);
      if (byId !== 0) return byId;
      return right.version.localeCompare(left.version);
    });
    return {
      user: sortPackages(user),
      library: sortPackages(library),
    };
  }, [snapshot]);

  const canUseLibraryScope = libraryId !== undefined;

  const setEnabledForPackage = useCallback(async (
    pluginPackage: PluginManagerPackageSummary,
    enabled: boolean,
  ): Promise<void> => {
    if (libraryId === undefined) return;
    if (!enabled) {
      await execute({
        type: 'plugin-manager.resolve',
        libraryId,
        pluginId: pluginPackage.pluginId,
        selection: 'disabled',
        ...(pluginPackage.scope === 'user' ? { propagateUserScoped: true } : {}),
      });
      return;
    }
    if (pluginPackage.scope === 'library' && pluginPackage.trust !== 'trusted') {
      setPendingEnable(pluginPackage);
      return;
    }
    await execute({
      type: 'plugin-manager.resolve',
      libraryId,
      pluginId: pluginPackage.pluginId,
      selection: pluginPackage.scope === 'user' ? 'use-global' : 'use-library',
      packageHash: pluginPackage.packageHash,
      ...(pluginPackage.scope === 'user' ? { propagateUserScoped: true } : {}),
    });
  }, [execute, libraryId]);

  const confirmEnablePackage = useCallback(async (): Promise<void> => {
    const pluginPackage = pendingEnable;
    setPendingEnable(undefined);
    if (pluginPackage === undefined || libraryId === undefined) return;
    const trustSaved = await execute({
      type: 'plugin-manager.trust',
      scope: 'library',
      libraryId,
      pluginId: pluginPackage.pluginId,
      packageHash: pluginPackage.packageHash,
      decision: 'trusted',
    });
    if (!trustSaved) return;
    await execute({
      type: 'plugin-manager.resolve',
      libraryId,
      pluginId: pluginPackage.pluginId,
      selection: pluginPackage.scope === 'user' ? 'use-global' : 'use-library',
      packageHash: pluginPackage.packageHash,
      ...(pluginPackage.scope === 'user' ? { propagateUserScoped: true } : {}),
    });
  }, [execute, libraryId, pendingEnable]);

  const finishExtensionTutorial = useCallback((): void => {
    try {
      globalThis.localStorage.setItem('superApi.infinite-canvas.tutorial.v1', 'done');
    } catch {
      // Storage failures only make the tutorial repeat; never block the user.
    }
    setExtensionTutorialOpen(false);
    setExtensionTutorialStep(0);
  }, []);

  const openInstallDialog = useCallback(() => {
    setGithubRepository('');
    setInstallError(undefined);
    setGithubInstallOpen(false);
    setGithubOperationId(undefined);
    setGithubProgress(undefined);
    setInstallScope(libraryId === undefined ? 'user' : 'library');
    setInstallOpen(true);
  }, [libraryId]);

  const closeInstallDialog = useCallback(() => {
    const progress = githubProgress;
    const operationId = githubOperationId;
    if (api !== undefined
      && operationId !== undefined
      && progress !== undefined
      && (progress.state === 'running' || progress.state === 'paused')) {
      void api.request({ type: 'plugin-manager.install-control', operationId, action: 'stop' });
    }
    setInstallOpen(false);
    setGithubInstallOpen(false);
    setGithubRepository('');
    setServerCatalogOpen(false);
    setServerCatalog(undefined);
    setServerCatalogLoading(false);
    setInstallError(undefined);
    setGithubOperationId(undefined);
    setGithubProgress(undefined);
  }, [api, githubOperationId, githubProgress]);

  const openServerCatalog = useCallback(async (): Promise<void> => {
    if (api === undefined) {
      setInstallError(t('settings.pluginUnavailable'));
      return;
    }
    setServerCatalogOpen(true);
    setServerCatalog(undefined);
    setServerCatalogLoading(true);
    setInstallError(undefined);
    try {
      const response = await api.request({ type: 'plugin-manager.list-server-extensions' });
      if (!response.ok) {
        setInstallError(formatPluginManagerFailure(response, t));
        return;
      }
      if (!('extensions' in response)) {
        setInstallError(t('settings.pluginServerCatalogFailed', { code: 'unexpected-response' }));
        return;
      }
      setServerCatalog(response.extensions);
    } catch {
      setInstallError(t('settings.pluginServerCatalogFailed', { code: 'bridge-unavailable' }));
    } finally {
      setServerCatalogLoading(false);
    }
  }, [api, t]);

  const installServerExtension = useCallback(async (pluginId: string): Promise<void> => {
    if (api === undefined) {
      setInstallError(t('settings.pluginUnavailable'));
      return;
    }
    setBusy(true);
    setInstallError(undefined);
    try {
      const response = await api.request({
        type: 'plugin-manager.install-server-extension',
        pluginId,
        scope: installScope,
        ...(installScope === 'library' && libraryId !== undefined ? { libraryId } : {}),
      });
      if (!response.ok) {
        setInstallError(formatPluginManagerFailure(response, t));
        return;
      }
      await load();
      setServerCatalogOpen(false);
      setServerCatalog(undefined);
      setInstallOpen(false);
      if (pluginId === 'com.super.infinite-canvas') {
        setExtensionTutorialStep(0);
        setExtensionTutorialOpen(true);
      }
    } catch {
      setInstallError(t('settings.pluginOperationFailed', { code: 'bridge-unavailable' }));
    } finally {
      setBusy(false);
    }
  }, [api, installScope, libraryId, load, t]);

  const startGithubInstall = useCallback(async (): Promise<void> => {
    if (api === undefined) {
      setInstallError(t('settings.pluginUnavailable'));
      return;
    }
    let repository: string;
    try {
      repository = parseGitHubRepositoryUrl(githubRepository.trim()).repository;
    } catch {
      setInstallError(t('settings.pluginGitHubInvalidRepository'));
      return;
    }
    const operationId = globalThis.crypto.randomUUID();
    setGithubOperationId(operationId);
    setGithubProgress({
      operationId,
      phase: 'resolving',
      state: 'running',
      bytesDownloaded: 0,
    });
    setInstallError(undefined);
    setBusy(true);
    try {
      const response = await api.request({
        type: 'plugin-manager.install-github',
        scope: installScope,
        ...(installScope === 'library' && libraryId !== undefined ? { libraryId } : {}),
        repository,
        operationId,
      });
      if (!response.ok) {
        if (response.code !== 'selection-cancelled') {
          setInstallError(formatPluginManagerFailure(response, t));
        }
        return;
      }
      setError(undefined);
      await load();
      setInstallOpen(false);
      setGithubInstallOpen(false);
      setGithubRepository('');
      setGithubOperationId(undefined);
      setGithubProgress(undefined);
    } catch {
      setInstallError(t('settings.pluginOperationFailed', { code: 'bridge-unavailable' }));
    } finally {
      setBusy(false);
    }
  }, [api, githubRepository, installScope, libraryId, load, t]);

  const githubProgressActive = githubProgress?.state === 'running' || githubProgress?.state === 'paused';
  const controlGithubInstall = useCallback((action: 'pause' | 'resume' | 'stop') => {
    if (api === undefined || githubOperationId === undefined) return;
    if (action === 'stop') {
      closeInstallDialog();
      return;
    }
    void api.request({
      type: 'plugin-manager.install-control',
      operationId: githubOperationId,
      action,
    });
  }, [api, closeInstallDialog, githubOperationId]);

  const scopeHoverTip = (scope: InstallScope): string => (
    scope === 'library'
      ? t('settings.pluginScopeLibraryHint')
      : t('settings.pluginScopeUserTip')
  );

  const renderInstallCard = (scope: InstallScope): ReactNode => {
    const packages = packagesByScope[scope];
    const scopeDisabled = scope === 'library' && !canUseLibraryScope;
    const pluginGroups = new Map<string, PluginManagerPackageSummary[]>();
    for (const item of packages) {
      const group = pluginGroups.get(item.pluginId) ?? [];
      group.push(item);
      pluginGroups.set(item.pluginId, group);
    }
    const grouped = [...pluginGroups.entries()];

    return (
      <section className="app-settings-card plugin-settings-scope-card" key={scope}>
        <div className="app-settings-row-copy">
          <strong>{scope === 'user' ? t('settings.pluginScopeUser') : t('settings.pluginScopeLibrary')}</strong>
          {scope === 'library' && grouped.length > 0 ? (
            <span>{t('settings.pluginScopeLibraryHint')}</span>
          ) : null}
        </div>
        {scopeDisabled ? <p className="app-settings-hint">{t('settings.pluginLibraryClosedHint')}</p> : null}

        {grouped.length === 0 && !scopeDisabled ? (
          <p className="app-settings-hint">{t('settings.pluginEmpty')}</p>
        ) : null}

        {grouped.map(([pluginId, pluginPackages], groupIndex) => {
          const resolution = resolutionByPluginId.get(pluginId);
          const newest = pluginPackages[0];
          if (newest === undefined) return null;
          const enabled = isPluginEnabledForScope(resolution, scope);
          const toggleEnabled = canTogglePluginEnabled(resolution, libraryId)
            && newest.status === 'valid';
          const canRollback = enabled
            && libraryId !== undefined
            && pluginPackages.length > 1;
          const showSettingsAction = newest.status === 'valid'
            && newest.hasSettingsUi
            && onOpenPluginSettings !== undefined;
          const githubRepository = newest.source.kind === 'github' ? newest.source.repository : undefined;
          const permissionsTip = newest.permissions.length > 0
            ? t('settings.pluginPermissionsTip', {
              permissions: newest.permissions.join(', '),
            })
            : undefined;

          return (
            <div
              className={`plugin-settings-package${groupIndex > 0 ? ' has-divider' : ''}`}
              key={`${scope}:${pluginId}`}
            >
              <div className="plugin-settings-package-header">
                <div className="plugin-settings-package-title-row">
                  <div className="plugin-settings-package-title">
                    <span className="plugin-settings-package-name">
                      {newest.name}
                      <span className="plugin-settings-package-version-inline">{` - v${newest.version}`}</span>
                    </span>
                    <div className="plugin-settings-package-source-actions">
                      {githubRepository !== undefined ? (
                        <button
                          className="plugin-settings-icon-action"
                          disabled={busy}
                          onClick={() => { void shellApi()?.openExternalUrl(githubRepository); }}
                          type="button"
                          {...iconActionAttrs(t('settings.pluginOpenGitHubSource'))}
                        >
                          <Icon name="github" size={14} />
                        </button>
                      ) : (
                        <button
                          className="plugin-settings-icon-action"
                          disabled={busy || (newest.scope === 'library' && libraryId === undefined)}
                          onClick={() => void execute({
                            type: 'plugin-manager.reveal-package',
                            scope: newest.scope,
                            ...(newest.scope === 'library' && libraryId !== undefined ? { libraryId } : {}),
                            pluginId,
                            version: newest.version,
                          })}
                          type="button"
                          {...iconActionAttrs(t('settings.pluginRevealPackage'))}
                        >
                          <Icon name="folder" size={14} />
                        </button>
                      )}
                      {permissionsTip !== undefined ? (
                        <span
                          aria-label={permissionsTip}
                          className="plugin-settings-permissions-info"
                          data-hover-tip={permissionsTip}
                          role="img"
                        >
                          <Icon name="alert-circle" size={14} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="plugin-settings-package-controls">
                    <button
                      className="plugin-settings-icon-action"
                      disabled={busy || api === undefined}
                      onClick={() => void execute({
                        type: 'plugin-manager.reload',
                        ...(libraryId === undefined ? {} : { libraryId }),
                      })}
                      type="button"
                      {...iconActionAttrs(t('settings.pluginReload'))}
                    >
                      <Icon name="refresh" size={14} />
                    </button>
                    {showSettingsAction ? (
                      <button
                        className="plugin-settings-icon-action"
                        disabled={busy}
                        onClick={() => onOpenPluginSettings(pluginId)}
                        type="button"
                        {...iconActionAttrs(t('settings.pluginOpenSettings'))}
                      >
                        <Icon name="settings" size={14} />
                      </button>
                    ) : null}
                    <button
                      className="plugin-settings-icon-action"
                      disabled={busy || (newest.scope === 'library' && libraryId === undefined)}
                      onClick={() => void execute({
                        type: 'plugin-manager.uninstall',
                        scope: newest.scope,
                        ...(libraryId === undefined ? {} : { libraryId }),
                        pluginId,
                        version: newest.version,
                      })}
                      type="button"
                      {...iconActionAttrs(t('settings.pluginUninstall'))}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                    <label
                      className="app-settings-toggle-row plugin-settings-enable-toggle"
                    >
                      <span className="visually-hidden">{t('settings.pluginEnable')}</span>
                      <span className="app-settings-toggle-control">
                        <input
                          aria-label={t('settings.pluginEnable')}
                          checked={enabled}
                          disabled={busy || !toggleEnabled}
                          onChange={(event) => void setEnabledForPackage(newest, event.target.checked)}
                          type="checkbox"
                        />
                        <span aria-hidden="true" className="app-settings-toggle-track" />
                      </span>
                    </label>
                  </div>
                </div>
                <p className="plugin-settings-package-description">{newest.description ?? pluginId}</p>
                {newest.status === 'valid'
                  && pluginRequiresTrustedCssDisclosure(newest.permissions)
                  ? <p className="app-settings-hint">{t('settings.pluginThemeTrustedCssHint')}</p>
                  : null}
                {newest.runtimeMode === 'unrestricted' && newest.trust === 'trusted' && enabled ? (
                  <p className="plugin-settings-unrestricted-warning">
                    <Icon name="warning" size={14} />
                    <span>{t('settings.pluginRuntimeTrustedHint')}</span>
                  </p>
                ) : null}
                {newest.status === 'invalid'
                  ? <p className="plugin-settings-error">{t('settings.pluginInvalid', { code: newest.errorCode ?? 'unknown' })}</p>
                  : null}
              </div>

              {canRollback ? (
                <div className="plugin-settings-resolution">
                  <span>{t('settings.pluginRollbackHint')}</span>
                  <button
                    className="secondary-button"
                    disabled={busy || libraryId === undefined}
                    onClick={() => void execute({
                      type: 'plugin-manager.rollback',
                      libraryId: libraryId!,
                      pluginId,
                    })}
                    type="button"
                  >
                    {t('settings.pluginRollback')}
                  </button>
                </div>
              ) : null}

              {resolution?.status === 'disabled' && resolution.reason === 'quarantined' ? (
                <div className="plugin-settings-resolution">
                  <span>{t('settings.pluginQuarantineHint')}</span>
                  <button
                    className="secondary-button"
                    disabled={busy || libraryId === undefined}
                    onClick={() => void execute({
                      type: 'plugin-manager.clear-quarantine',
                      libraryId: libraryId!,
                      pluginId,
                      packageHash: resolution.packageHash,
                    })}
                    type="button"
                  >
                    {t('settings.pluginReenable')}
                  </button>
                </div>
              ) : null}

              {resolution?.status === 'conflict' ? (
                <div className="plugin-settings-resolution">
                  <span>{t('settings.pluginConflictHint')}</span>
                  {resolution.candidates.map((candidate) => (
                    <button
                      className="secondary-button"
                      disabled={busy || libraryId === undefined}
                      key={`${candidate.scope}:${candidate.packageHash}`}
                      onClick={() => void execute({
                        type: 'plugin-manager.resolve',
                        libraryId: libraryId!,
                        pluginId,
                        selection: candidate.scope === 'user' ? 'use-global' : 'use-library',
                        packageHash: candidate.packageHash,
                        ...(candidate.scope === 'user' ? { propagateUserScoped: true } : {}),
                      })}
                      type="button"
                    >
                      {candidateLabel(candidate, t)}
                    </button>
                  ))}
                  <button
                    className="secondary-button"
                    disabled={busy || libraryId === undefined}
                    onClick={() => void execute({
                      type: 'plugin-manager.resolve',
                      libraryId: libraryId!,
                      pluginId,
                      selection: 'disabled',
                      propagateUserScoped: true,
                    })}
                    type="button"
                  >
                    {t('settings.pluginDisable')}
                  </button>
                </div>
              ) : null}

              {resolution?.status === 'requires-confirmation' ? (
                <div className="plugin-settings-resolution">
                  <span>{t(confirmationHintKey(resolution.reason))}</span>
                  <button
                    className="secondary-button"
                    disabled={busy || libraryId === undefined}
                    onClick={() => {
                      const target = confirmationPackage(resolution);
                      void execute({
                        type: 'plugin-manager.resolve',
                        libraryId: libraryId!,
                        pluginId,
                        selection: target.scope === 'user' ? 'use-global' : 'use-library',
                        packageHash: target.packageHash,
                        ...(target.scope === 'user' ? { propagateUserScoped: true } : {}),
                      });
                    }}
                    type="button"
                  >
                    {candidateLabel(confirmationPackage(resolution), t)}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy || libraryId === undefined}
                    onClick={() => void execute({
                      type: 'plugin-manager.resolve',
                      libraryId: libraryId!,
                      pluginId,
                      selection: 'disabled',
                      propagateUserScoped: true,
                    })}
                    type="button"
                  >
                    {t('settings.pluginDisable')}
                  </button>
                </div>
              ) : null}

              {resolution?.status === 'disabled' && resolution.reason === 'safe-mode' ? (
                <p className="app-settings-hint">{t('settings.pluginStatusSafeMode')}</p>
              ) : null}
            </div>
          );
        })}
      </section>
    );
  };

  const libraryInstallDisabled = installScope === 'library' && !canUseLibraryScope;

  return (
    <div className="plugin-settings-page">
      <section className="app-settings-card plugin-settings-overview">
        <div className="app-settings-action-row plugin-settings-overview-header">
          <div className="app-settings-row-copy">
            <strong>{t('settings.pluginsTitle')}</strong>
            <span>{t('settings.pluginsHint')}</span>
          </div>
          <button
            className="secondary-button plugin-settings-install-button"
            disabled={busy || api === undefined}
            onClick={openInstallDialog}
            type="button"
          >
            {t('settings.pluginInstall')}
          </button>
        </div>
        <label className="app-settings-toggle-row plugin-settings-safe-mode">
          <span className="app-settings-row-copy">
            <strong>{t('settings.pluginSafeMode')}</strong>
            <span>{t('settings.pluginSafeModeHint')}</span>
          </span>
          <span className="app-settings-toggle-control">
            <input
              checked={snapshot?.safeMode ?? false}
              disabled={busy || api === undefined}
              onChange={(event) => void execute({
                type: 'plugin-manager.safe-mode',
                enabled: event.target.checked,
              })}
              type="checkbox"
            />
            <span aria-hidden="true" className="app-settings-toggle-track" />
          </span>
        </label>
        <label className="app-settings-toggle-row plugin-settings-auto-update">
          <span className="app-settings-row-copy">
            <strong>{t('settings.pluginAutoUpdateExtensions')}</strong>
            <span>{t('settings.pluginAutoUpdateExtensionsHint')}</span>
          </span>
          <span className="app-settings-toggle-control">
            <input
              aria-label={t('settings.pluginAutoUpdateExtensions')}
              checked={autoUpdateExtensions}
              disabled={busy || api === undefined}
              onChange={(event) => {
                const next = event.target.checked;
                setAutoUpdateExtensions(next);
                updateCheckStarted.current = false;
                try {
                  globalThis.localStorage.setItem('super.extensions.auto-update.v1', next ? '1' : '0');
                } catch {
                  // The preference still applies for this page session.
                }
              }}
              type="checkbox"
            />
            <span aria-hidden="true" className="app-settings-toggle-track" />
          </span>
        </label>
        <div className="app-settings-action-row plugin-settings-update-actions">
          <span className="app-settings-row-copy">
            <strong>{t('settings.pluginCheckUpdates')}</strong>
            <span>{extensionUpdateMessage ?? t('settings.pluginAutoUpdateExtensionsHint')}</span>
          </span>
          <div className="plugin-settings-update-buttons">
            <button
              className="secondary-button"
              disabled={busy || api === undefined}
              onClick={() => {
                updateCheckStarted.current = true;
                void checkServerUpdates(false);
              }}
              type="button"
            >
              {t('settings.pluginCheckUpdates')}
            </button>
            {availableUpdates.length > 0 ? (
              <button
                className="primary-button"
                disabled={busy || api === undefined}
                onClick={() => void installAvailableUpdates()}
                type="button"
              >
                {t('settings.pluginUpdateAll')}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error === undefined ? null : <p className="plugin-settings-error" role="status">{error}</p>}
      {loading ? <p className="app-settings-hint">{t('settings.pluginLoading')}</p> : null}

      {renderInstallCard('user')}
      {renderInstallCard('library')}

      {installOpen ? (
        <div
          className="dialog-backdrop plugin-install-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) closeInstallDialog();
          }}
          role="presentation"
        >
          <DialogShell
            className="create-dialog plugin-install-dialog"
            dialogId="plugin-install-dialog"
            headerActions={(
              <button
                className="dialog-close"
                onClick={closeInstallDialog}
                type="button"
              >
                <Icon name="close" size={16} />
                <span className="visually-hidden">{t('common.cancel')}</span>
              </button>
            )}
            style={{ padding: 0 }}
            title={serverCatalogOpen
              ? t('settings.pluginServerCatalogTitle')
              : githubInstallOpen ? t('settings.pluginGitHubInstallTitle') : t('settings.pluginInstall')}
          >
            <label className="plugin-install-scope-field">
              <span className="micro-label">{t('settings.pluginInstallScope')}</span>
              <select
                className="text-field"
                disabled={busy}
                onChange={(event) => setInstallScope(event.target.value as InstallScope)}
                title={scopeHoverTip(installScope)}
                value={installScope}
              >
                <option title={scopeHoverTip('user')} value="user">
                  {t('settings.pluginScopeUser')}
                </option>
                <option
                  disabled={!canUseLibraryScope}
                  title={canUseLibraryScope ? scopeHoverTip('library') : t('settings.pluginLibraryClosedHint')}
                  value="library"
                >
                  {t('settings.pluginScopeLibrary')}
                </option>
              </select>
            </label>
            {scopeHoverTip(installScope) ? <p className="app-settings-hint">{scopeHoverTip(installScope)}</p> : null}
            {libraryInstallDisabled ? <p className="app-settings-hint">{t('settings.pluginLibraryClosedHint')}</p> : null}

            {serverCatalogOpen ? (
              <div className="plugin-install-github-view">
                <button
                  className="plugin-install-back"
                  disabled={busy}
                  onClick={() => setServerCatalogOpen(false)}
                  type="button"
                >
                  <Icon name="chevron-left" size={14} />
                  {t('settings.pluginInstallBack')}
                </button>
                <div className="plugin-install-github-intro">
                  <span className="plugin-install-choice-icon"><Icon name="download" size={22} /></span>
                  <div>
                    <strong>{t('settings.pluginServerCatalogTitle')}</strong>
                    <p>{t('settings.pluginServerCatalogHint')}</p>
                  </div>
                </div>
                {installError === undefined ? null : <p className="plugin-settings-error" role="status">{installError}</p>}
                {serverCatalogLoading ? (
                  <p className="app-settings-hint">{t('settings.pluginServerCatalogLoading')}</p>
                ) : serverCatalog === undefined ? null : serverCatalog.length === 0 ? (
                  <p className="app-settings-hint">{t('settings.pluginServerCatalogEmpty')}</p>
                ) : (
                  <div className="plugin-install-choice-grid">
                    {serverCatalog.map((entry) => {
                      const installed = (snapshot?.packages ?? []).some((item) =>
                        item.pluginId === entry.id
                        && item.version === entry.version
                        && item.status === 'valid');
                      return (
                        <div className="plugin-install-choice plugin-server-choice" key={entry.id}>
                          <span className="plugin-install-choice-icon"><Icon name="download" size={22} /></span>
                          <span className="plugin-install-choice-copy">
                            <strong>{entry.name}</strong>
                            <span>{entry.description}</span>
                            <span className="app-settings-hint">
                              {t('settings.pluginServerCatalogPlatform', { platform: entry.platform })}
                              {entry.minAppVersion === undefined
                                ? ''
                                : ` · ${t('settings.pluginServerCatalogRequires', { version: entry.minAppVersion })}`}
                            </span>
                          </span>
                          <button
                            className="primary-button"
                            disabled={busy || installed || api === undefined || libraryInstallDisabled}
                            onClick={() => void installServerExtension(entry.id)}
                            type="button"
                          >
                            {installed
                              ? t('settings.pluginServerCatalogInstalled')
                              : t('settings.pluginServerCatalogInstall')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : githubInstallOpen ? (
              <div className="plugin-install-github-view">
                <button
                  className="plugin-install-back"
                  disabled={githubProgressActive}
                  onClick={() => setGithubInstallOpen(false)}
                  type="button"
                >
                  <Icon name="chevron-left" size={14} />
                  {t('settings.pluginInstallBack')}
                </button>
                <div className="plugin-install-github-intro">
                  <span className="plugin-install-choice-icon github"><Icon name="github" size={22} /></span>
                  <div>
                    <strong>{t('settings.pluginGitHubInstallTitle')}</strong>
                    <p>{t('settings.pluginInstallGitHubHint')}</p>
                  </div>
                </div>
                <label className="plugin-install-repository-field">
                  <span className="micro-label">{t('settings.pluginGitHubRepository')}</span>
                  <input
                    aria-label={t('settings.pluginGitHubRepository')}
                    className="text-field"
                    disabled={busy || api === undefined || libraryInstallDisabled || githubProgressActive}
                    onChange={(event) => setGithubRepository(event.target.value)}
                    placeholder={t('settings.pluginGitHubPlaceholder')}
                    type="text"
                    value={githubRepository}
                  />
                </label>
                {githubProgress === undefined ? null : (
                  <div className="plugin-install-progress" role="status">
                    <div className="plugin-install-progress-label">
                      <span>
                        {githubProgress.phase === 'resolving'
                          ? t('settings.pluginInstallResolving')
                          : githubProgress.phase === 'installing'
                            ? t('settings.pluginInstallInstalling')
                            : t('settings.pluginInstallDownloading')}
                      </span>
                      {githubProgress.totalBytes === undefined ? null : (
                        <span>{Math.round((githubProgress.bytesDownloaded / Math.max(1, githubProgress.totalBytes)) * 100)}%</span>
                      )}
                    </div>
                    <progress
                      aria-label={t('settings.pluginInstallDownloading')}
                      className="plugin-install-progress-bar"
                      max={githubProgress.totalBytes ?? 1}
                      value={githubProgress.totalBytes === undefined ? undefined : githubProgress.bytesDownloaded}
                    />
                    {githubProgress.phase === 'downloading' ? (
                      <span className="app-settings-hint">
                        {t('settings.pluginInstallDownloaded', {
                          downloaded: formatInstallBytes(githubProgress.bytesDownloaded),
                          total: githubProgress.totalBytes === undefined ? '' : ` / ${formatInstallBytes(githubProgress.totalBytes)}`,
                        })}
                      </span>
                    ) : null}
                    {githubProgress.message !== undefined ? <p className="plugin-settings-error">{githubProgress.message}</p> : null}
                  </div>
                )}
                {installError === undefined ? null : <p className="plugin-settings-error" role="status">{installError}</p>}
                <div className="plugin-install-github-actions">
                  {githubProgressActive ? (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => controlGithubInstall(githubProgress?.state === 'paused' ? 'resume' : 'pause')}
                        type="button"
                      >
                        {githubProgress?.state === 'paused' ? t('settings.pluginInstallResume') : t('settings.pluginInstallPause')}
                      </button>
                      <button className="secondary-button plugin-install-stop-button" onClick={() => controlGithubInstall('stop')} type="button">
                        {t('settings.pluginInstallStop')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={busy || githubRepository.trim() === '' || api === undefined || libraryInstallDisabled}
                      onClick={() => void startGithubInstall()}
                      type="button"
                    >
                      {t('settings.pluginGitHubInstallStart')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="plugin-install-choice-grid">
                <button
                  className="plugin-install-choice"
                  disabled={busy || api === undefined || libraryInstallDisabled}
                  onClick={() => void openServerCatalog()}
                  type="button"
                >
                  <span className="plugin-install-choice-icon"><Icon name="download" size={22} /></span>
                  <span className="plugin-install-choice-copy">
                    <strong>{t('settings.pluginInstallServerAction')}</strong>
                    <span>{t('settings.pluginInstallServerHint')}</span>
                  </span>
                  <Icon name="chevron-right" size={16} />
                </button>
                {installError === undefined ? null : (
                  <p className="app-settings-error" role="alert">{installError}</p>
                )}
              </div>
            )}
          </DialogShell>
        </div>
      ) : null}
      {extensionTutorialOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <DialogShell
            className="create-dialog"
            dialogId="infinite-canvas-install-tutorial"
            footer={(
              <>
                {extensionTutorialStep > 0 ? (
                  <button
                    className="secondary-button"
                    onClick={() => setExtensionTutorialStep((step) => Math.max(0, step - 1))}
                    type="button"
                  >
                    {t('common.back')}
                  </button>
                ) : null}
                {extensionTutorialStep < 2 ? (
                  <button
                    className="primary-button"
                    onClick={() => setExtensionTutorialStep((step) => Math.min(2, step + 1))}
                    type="button"
                  >
                    {t('common.next')}
                  </button>
                ) : (
                  <button className="primary-button" onClick={finishExtensionTutorial} type="button">
                    {t('preview.infiniteCanvasTutorialStart')}
                  </button>
                )}
              </>
            )}
            title={t('preview.infiniteCanvasTutorialTitle')}
          >
            <p className="app-settings-hint">{t('preview.infiniteCanvasTutorialIntro')}</p>
            <p className="app-settings-hint">
              {t('preview.infiniteCanvasTutorialProgress', {
                current: extensionTutorialStep + 1,
                total: 3,
              })}
            </p>
            <p className="infinite-canvas-tutorial-step">
              {t([
                'preview.infiniteCanvasTutorialStep1',
                'preview.infiniteCanvasTutorialStep2',
                'preview.infiniteCanvasTutorialStep3',
              ][extensionTutorialStep] as 'preview.infiniteCanvasTutorialStep1')}
            </p>
          </DialogShell>
        </div>
      ) : null}
      {pendingEnable === undefined ? null : (
        <div className="dialog-backdrop" role="presentation">
          <DialogShell
            className="create-dialog"
            dialogId="plugin-enable-confirm"
            footer={(
              <>
                <button className="secondary-button" onClick={() => setPendingEnable(undefined)} type="button">
                  {t('settings.pluginEnableDialogCancel')}
                </button>
                <button className="primary-button" onClick={() => void confirmEnablePackage()} type="button">
                  {t('settings.pluginEnableDialogConfirm')}
                </button>
              </>
            )}
            title={t('settings.pluginEnableDialogTitle')}
          >
            <p className="app-settings-hint">{pluginEnableRiskMessage(pendingEnable, t)}</p>
          </DialogShell>
        </div>
      )}
    </div>
  );
}
