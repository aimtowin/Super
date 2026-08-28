import type {
  AutomationScriptCommandId,
} from '../shared/automation-script-api';
import { pluginTargetLibraryIdSchema } from '../plugins/plugin-commands';

export type SuperGuestCommandDefinition = {
  readonly path: `${string}.${string}`;
  readonly commandId: AutomationScriptCommandId;
  readonly buildInput: (...args: unknown[]) => unknown;
  readonly projectResult?: (value: unknown) => unknown;
};

export type SuperGuestApiAdapters = {
  executeCommand: (
    commandId: AutomationScriptCommandId,
    input: unknown,
    options?: {
      causeChain?: readonly string[];
      /** Scope hint consumed by the Host adapter; not part of command input. */
      targetLibraryId?: string;
    },
  ) => Promise<unknown>;
};

export type SuperGuestCommandNamespace = Record<string, (...args: unknown[]) => Promise<unknown>>;
export type SuperGuestCommandApi = Record<string, SuperGuestCommandNamespace>;
export type SuperGuestApi = SuperGuestCommandApi & {
  /** Create an immutable command API scoped to one already-open library. */
  forLibrary(libraryId: string): SuperGuestCommandApi;
};

export function projectSuperGuestAssetPageResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    return value;
  }
  const page = value as {
    items: unknown[];
    total?: unknown;
    offset?: unknown;
    limit?: unknown;
    hasMore?: unknown;
  };
  return {
    items: page.items.map((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { assetId?: unknown }).assetId !== 'string') {
        return item;
      }
      const asset = item as Record<string, unknown> & { assetId: string };
      return {
        id: asset.assetId,
        name: typeof asset.displayName === 'string' ? asset.displayName : asset.assetId,
        rating: typeof asset.rating === 'number' ? asset.rating : 0,
        favorite: asset.favorite === true,
        locationKind: asset.locationKind === 'linked' ? 'linked' : 'managed',
        folderId: typeof asset.managedFolderId === 'string' ? asset.managedFolderId : null,
      };
    }),
    total: typeof page.total === 'number' ? page.total : page.items.length,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    limit: typeof page.limit === 'number' ? page.limit : page.items.length,
    hasMore: page.hasMore === true,
  };
}

export function projectSuperGuestLibraryInspectResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const library = value as Record<string, unknown>;
  if (typeof library.libraryId !== 'string') return value;
  return {
    id: library.libraryId,
    displayName: typeof library.displayName === 'string' ? library.displayName : library.libraryId,
  };
}

/** Folder paths are intentionally reduced to id/name relationships for guests. */
export function projectSuperGuestFolderPageResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    return value;
  }
  const page = value as {
    items: unknown[];
    total?: unknown;
    offset?: unknown;
    limit?: unknown;
    hasMore?: unknown;
  };
  return {
    items: page.items.map((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { folderId?: unknown }).folderId !== 'string') {
        return item;
      }
      const folder = item as Record<string, unknown> & { folderId: string };
      return {
        id: folder.folderId,
        parentId: typeof folder.parentFolderId === 'string' ? folder.parentFolderId : null,
        name: typeof folder.name === 'string' ? folder.name : folder.folderId,
      };
    }),
    total: typeof page.total === 'number' ? page.total : page.items.length,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    limit: typeof page.limit === 'number' ? page.limit : page.items.length,
    hasMore: page.hasMore === true,
  };
}

export function projectSuperGuestFolderSummary(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const folder = value as Record<string, unknown>;
  if (typeof folder.id === 'string') {
    return {
      id: folder.id,
      parentId: typeof folder.parentId === 'string' ? folder.parentId : null,
      name: typeof folder.name === 'string' ? folder.name : folder.id,
    };
  }
  if (typeof folder.folderId !== 'string') return value;
  return {
    id: folder.folderId,
    parentId: typeof folder.parentFolderId === 'string' ? folder.parentFolderId : null,
    name: typeof folder.name === 'string' ? folder.name : folder.folderId,
  };
}

export function projectSuperGuestTagPageResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    return value;
  }
  const page = value as {
    items: unknown[];
    total?: unknown;
    offset?: unknown;
    limit?: unknown;
    hasMore?: unknown;
  };
  return {
    items: page.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const tag = item as Record<string, unknown>;
      if (typeof tag.id === 'string') {
        return {
          id: tag.id,
          name: typeof tag.name === 'string' ? tag.name : tag.id,
          assetCount: typeof tag.assetCount === 'number' ? tag.assetCount : 0,
        };
      }
      if (typeof tag.tagId !== 'string') return item;
      return {
        id: tag.tagId,
        name: typeof tag.name === 'string' ? tag.name : tag.tagId,
        assetCount: typeof tag.assetCount === 'number' ? tag.assetCount : 0,
      };
    }),
    total: typeof page.total === 'number' ? page.total : page.items.length,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    limit: typeof page.limit === 'number' ? page.limit : page.items.length,
    hasMore: page.hasMore === true,
  };
}

export function projectSuperGuestCollectionPageResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    return value;
  }
  const page = value as {
    items: unknown[];
    total?: unknown;
    offset?: unknown;
    limit?: unknown;
    hasMore?: unknown;
  };
  return {
    items: page.items.map((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { collectionId?: unknown }).collectionId !== 'string') {
        return item;
      }
      const collection = item as Record<string, unknown> & { collectionId: string };
      return {
        id: collection.collectionId,
        parentId: typeof collection.parentId === 'string' ? collection.parentId : null,
        name: typeof collection.name === 'string' ? collection.name : collection.collectionId,
        description: typeof collection.description === 'string' ? collection.description : null,
        assetCount: typeof collection.assetCount === 'number' ? collection.assetCount : 0,
        childCollectionCount: typeof collection.childCollectionCount === 'number'
          ? collection.childCollectionCount
          : 0,
      };
    }),
    total: typeof page.total === 'number' ? page.total : page.items.length,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    limit: typeof page.limit === 'number' ? page.limit : page.items.length,
    hasMore: page.hasMore === true,
  };
}

export function projectSuperGuestSmartCollectionPageResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    return value;
  }
  const page = value as {
    items: unknown[];
    total?: unknown;
    offset?: unknown;
    limit?: unknown;
    hasMore?: unknown;
  };
  return {
    items: page.items.map((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { collectionId?: unknown }).collectionId !== 'string') {
        return item;
      }
      const collection = item as Record<string, unknown> & { collectionId: string };
      return {
        id: collection.collectionId,
        name: typeof collection.name === 'string' ? collection.name : collection.collectionId,
        queryDefinition: typeof collection.queryDefinition === 'string' ? collection.queryDefinition : '',
        assetCount: typeof collection.assetCount === 'number' ? collection.assetCount : 0,
      };
    }),
    total: typeof page.total === 'number' ? page.total : page.items.length,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    limit: typeof page.limit === 'number' ? page.limit : page.items.length,
    hasMore: page.hasMore === true,
  };
}

/** Linked folder absoluteRootPath must never reach the guest. */
export function projectSuperGuestLinkedFolderPageResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    return value;
  }
  const page = value as {
    items: unknown[];
    total?: unknown;
    offset?: unknown;
    limit?: unknown;
    hasMore?: unknown;
  };
  return {
    items: page.items.map((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { folderId?: unknown }).folderId !== 'string') {
        return item;
      }
      const folder = item as Record<string, unknown> & { folderId: string };
      return {
        id: folder.folderId,
        name: typeof folder.displayName === 'string' ? folder.displayName : folder.folderId,
        status: folder.status === 'offline' ? 'offline' : 'available',
        assetCount: typeof folder.assetCount === 'number' ? folder.assetCount : 0,
      };
    }),
    total: typeof page.total === 'number' ? page.total : page.items.length,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    limit: typeof page.limit === 'number' ? page.limit : page.items.length,
    hasMore: page.hasMore === true,
  };
}

const guestCommandDefinitions: readonly SuperGuestCommandDefinition[] = [
  {
    path: 'assets.search',
    commandId: 'asset.search',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestAssetPageResult,
  },
  {
    path: 'assets.list',
    commandId: 'asset.list',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestAssetPageResult,
  },
  {
    path: 'assets.getMetadata',
    commandId: 'asset.metadata.get',
    buildInput: (assetId) => ({ assetId }),
  },
  {
    path: 'assets.getAiContent',
    commandId: 'asset.ai-content.get',
    buildInput: (assetId) => ({ assetId }),
  },
  {
    path: 'assets.setMetadata',
    commandId: 'asset.metadata.set',
    buildInput: (input) => input,
  },
  {
    path: 'assets.getExtractedMetadata',
    commandId: 'asset.extracted-metadata.get',
    buildInput: (assetId) => ({ assetId }),
  },
  {
    path: 'assets.setRating',
    commandId: 'asset.rating.set',
    buildInput: (assetIds, rating) => ({ assetIds, rating }),
  },
  {
    path: 'assets.copyFilePaths',
    commandId: 'asset.paths.copy',
    buildInput: (assetIds) => ({ assetIds }),
  },
  {
    path: 'assets.moveToTrash',
    commandId: 'asset.trash',
    buildInput: (assetIds) => ({ assetIds }),
  },
  {
    path: 'assets.replaceContent',
    commandId: 'asset.content.replace',
    buildInput: (assetId, dataBase64, options = {}) => ({
      assetId,
      dataBase64,
      ...((options && typeof options === 'object') ? options : {}),
    }),
  },
  {
    path: 'assets.stageContent',
    commandId: 'asset.content.stage',
    buildInput: (assetId, dataBase64, options = {}) => ({
      assetId,
      dataBase64,
      ...((options && typeof options === 'object') ? options : {}),
    }),
  },
  {
    path: 'assets.replaceContentBatch',
    commandId: 'asset.content.replace-batch',
    buildInput: (items) => ({ items }),
  },
  {
    path: 'assets.readContent',
    commandId: 'asset.content.read',
    buildInput: (assetId, options = {}) => ({
      assetId,
      ...((options && typeof options === 'object') ? options : {}),
    }),
  },
  {
    path: 'assets.moveToFolder',
    commandId: 'asset.move',
    buildInput: (assetIds, targetFolderId, options = {}) => ({
      assetIds,
      targetFolderId,
      ...((options && typeof options === 'object') ? options : {}),
    }),
  },
  {
    path: 'assets.renameFile',
    commandId: 'asset.rename-file',
    buildInput: (assetId, newBaseName) => ({ assetId, newBaseName }),
  },
  {
    path: 'assets.renameFiles',
    commandId: 'asset.rename-files',
    buildInput: (items) => ({ items }),
  },
  {
    path: 'library.inspect',
    commandId: 'library.inspect',
    buildInput: () => ({}),
    projectResult: projectSuperGuestLibraryInspectResult,
  },
  {
    path: 'library.changeSequence',
    commandId: 'library.change-sequence',
    buildInput: () => ({}),
  },
  {
    path: 'library.create',
    commandId: 'library.create',
    buildInput: (input) => input,
  },
  {
    path: 'folders.list',
    commandId: 'folder.list',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestFolderPageResult,
  },
  {
    path: 'folders.create',
    commandId: 'folder.create',
    buildInput: (name, parentFolderId) => ({
      name,
      ...(parentFolderId === undefined ? {} : { parentFolderId }),
    }),
    projectResult: projectSuperGuestFolderSummary,
  },
  {
    path: 'tags.list',
    commandId: 'tag.list',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestTagPageResult,
  },
  {
    path: 'tags.create',
    commandId: 'tag.create',
    buildInput: (name) => ({ name }),
  },
  {
    path: 'tags.assign',
    commandId: 'tag.assign',
    buildInput: (assetIds, tagIds) => ({ assetIds, tagIds }),
  },
  {
    path: 'tags.remove',
    commandId: 'tag.remove',
    buildInput: (assetIds, tagIds) => ({ assetIds, tagIds }),
  },
  {
    path: 'collections.list',
    commandId: 'collection.list',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestCollectionPageResult,
  },
  {
    path: 'collections.create',
    commandId: 'collection.create',
    buildInput: (name, parentId) => ({
      name,
      ...(parentId === undefined ? {} : { parentId }),
    }),
  },
  {
    path: 'collections.getMemberships',
    commandId: 'collection.assets.memberships',
    buildInput: (assetIds, pagination = {}) => ({
      assetIds,
      ...((pagination && typeof pagination === 'object') ? pagination as Record<string, unknown> : {}),
    }),
  },
  {
    path: 'collections.addAssets',
    commandId: 'collection.assets.add',
    buildInput: (collectionId, assetIds) => ({ collectionId, assetIds }),
  },
  {
    path: 'collections.removeAssets',
    commandId: 'collection.assets.remove',
    buildInput: (collectionId, assetIds) => ({ collectionId, assetIds }),
  },
  {
    path: 'smartCollections.list',
    commandId: 'smart-collection.list',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestSmartCollectionPageResult,
  },
  {
    path: 'linkedFolders.list',
    commandId: 'linked-folder.list',
    buildInput: (input = {}) => input,
    projectResult: projectSuperGuestLinkedFolderPageResult,
  },
  {
    path: 'files.import',
    commandId: 'file.import',
    buildInput: (input) => input,
  },
  {
    path: 'trash.list',
    commandId: 'asset.list-trash',
    buildInput: () => ({}),
    projectResult: projectSuperGuestAssetPageResult,
  },
  {
    path: 'trash.restoreIfOriginalVacant',
    commandId: 'asset.restore-if-original-vacant',
    buildInput: (assetIds) => ({ assetIds }),
  },
  {
    path: 'palettes.mostFrequent',
    commandId: 'asset.palette.aggregate-recent',
    buildInput: (input = {}) => input,
  },
  {
    path: 'ui.notify',
    commandId: 'ui.notify',
    buildInput: (input = {}) => input,
  },
];

export const SUPER_GUEST_COMMANDS = guestCommandDefinitions;

function guestMethodsForPrefix(prefix: string): string[] {
  return guestCommandDefinitions
    .filter(({ path }) => path.startsWith(`${prefix}.`))
    .map(({ path }) => path.slice(prefix.length + 1));
}

export const SUPER_GUEST_ASSET_METHODS = guestMethodsForPrefix('assets');
export const SUPER_GUEST_LIBRARY_METHODS = guestMethodsForPrefix('library');
export const SUPER_GUEST_FOLDER_METHODS = guestMethodsForPrefix('folders');
export const SUPER_GUEST_TAG_METHODS = guestMethodsForPrefix('tags');
export const SUPER_GUEST_COLLECTION_METHODS = guestMethodsForPrefix('collections');
export const SUPER_GUEST_SMART_COLLECTION_METHODS = guestMethodsForPrefix('smartCollections');
export const SUPER_GUEST_LINKED_FOLDER_METHODS = guestMethodsForPrefix('linkedFolders');
export const SUPER_GUEST_FILE_METHODS = guestMethodsForPrefix('files');
export const SUPER_GUEST_TRASH_METHODS = guestMethodsForPrefix('trash');
export const SUPER_GUEST_PALETTE_METHODS = guestMethodsForPrefix('palettes');

export const SUPER_GUEST_NAMESPACES = [
  'assets',
  'library',
  'folders',
  'tags',
  'collections',
  'smartCollections',
  'linkedFolders',
  'files',
  'trash',
  'palettes',
  'ui',
] as const;

function setNestedMethod(
  root: SuperGuestCommandApi,
  namespace: string,
  method: string,
  value: (...args: unknown[]) => Promise<unknown>,
): void {
  const target = root[namespace] ?? {};
  target[method] = value;
  root[namespace] = target;
}

export function createSuperGuestApi(adapters: SuperGuestApiAdapters): SuperGuestApi;
export function createSuperGuestApi(
  adapters: SuperGuestApiAdapters,
  targetLibraryId: string,
): SuperGuestCommandApi;
export function createSuperGuestApi(
  adapters: SuperGuestApiAdapters,
  targetLibraryId?: string,
): SuperGuestApi | SuperGuestCommandApi {
  const api: SuperGuestCommandApi = {};
  for (const definition of guestCommandDefinitions) {
    const [namespace, method] = definition.path.split('.');
    if (namespace === undefined || method === undefined) {
      throw new Error(`Invalid Guest API command path: ${definition.path}`);
    }
    setNestedMethod(api, namespace, method, async (...args) => {
      const result = await adapters.executeCommand(
        definition.commandId,
        definition.buildInput(...args),
        targetLibraryId === undefined ? undefined : { targetLibraryId },
      );
      return definition.projectResult?.(result) ?? result;
    });
  }
  if (targetLibraryId !== undefined) return api;
  return Object.assign(api, {
    forLibrary(libraryId: string): SuperGuestCommandApi {
      const parsed = pluginTargetLibraryIdSchema.safeParse(libraryId);
      if (!parsed.success) throw new Error('Invalid target library id.');
      // A fresh API closes over the target; no ambient API object is mutated.
      return createSuperGuestApi(adapters, parsed.data);
    },
  });
}
