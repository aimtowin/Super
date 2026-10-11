import type { SuperLibraryApi } from '../shared/library-api';

/** Inject the display preference into every search, including paging, layout,
 * selection and sidebar totals. Never store it in a smart collection definition. */
export function withLinkedVisibility(api: SuperLibraryApi | undefined, hide: boolean): SuperLibraryApi | undefined {
  if (!api || !hide) return api;
  return {
    ...api,
    searchAssets: input => api.searchAssets(input.scope?.kind === 'trash' ? input : {
      ...input, filters: [...(input.filters ?? []).filter(filter => filter.field !== 'linked_visibility'), { field: 'linked_visibility', values: ['available'], exclude: false }],
    }),
    listLinkedFolders: async input => {
      const result = await api.listLinkedFolders({ ...input, hideMissing: true });
      return result;
    },
    listFolderBrowseEntries: input => api.listFolderBrowseEntries({ ...input, hideMissing: true }),
  };
}
