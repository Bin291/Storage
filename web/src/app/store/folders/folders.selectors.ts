import { createFeatureSelector, createSelector } from '@ngrx/store';
import { FoldersState, folderParentKey } from './folders.reducer';

export const selectFoldersState = createFeatureSelector<FoldersState>('folders');

export const selectFolderChildren = (parentId: string | null) =>
  createSelector(
    selectFoldersState,
    (state) => state.childrenByParent[folderParentKey(parentId)] ?? [],
  );

export const selectFolderChildrenLoading = (parentId: string | null) =>
  createSelector(
    selectFoldersState,
    (state) => state.loadingByParent[folderParentKey(parentId)] ?? false,
  );

export const selectFolderChildrenError = (parentId: string | null) =>
  createSelector(
    selectFoldersState,
    (state) => state.errorByParent[folderParentKey(parentId)] ?? null,
  );
