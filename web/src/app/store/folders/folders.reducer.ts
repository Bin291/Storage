import { createReducer, on } from '@ngrx/store';
import { FolderItem } from '../../core/folders/folder.model';
import { foldersActions } from './folders.actions';

export interface FoldersState {
  childrenByParent: Record<string, FolderItem[]>;
  loadingByParent: Record<string, boolean>;
  errorByParent: Record<string, string | null>;
}

export const initialFoldersState: FoldersState = {
  childrenByParent: {},
  loadingByParent: {},
  errorByParent: {},
};

/** Key cho gốc (parentId = null) khác với mọi folder con — dùng chung cho reducer + selector. */
export function folderParentKey(parentId: string | null): string {
  return parentId ?? '__root__';
}

export const foldersReducer = createReducer(
  initialFoldersState,
  on(foldersActions.loadChildren, (state, { parentId }) => {
    const key = folderParentKey(parentId);
    return {
      ...state,
      loadingByParent: { ...state.loadingByParent, [key]: true },
      errorByParent: { ...state.errorByParent, [key]: null },
    };
  }),
  on(foldersActions.loadChildrenSuccess, (state, { parentId, children }) => {
    const key = folderParentKey(parentId);
    return {
      ...state,
      childrenByParent: { ...state.childrenByParent, [key]: children },
      loadingByParent: { ...state.loadingByParent, [key]: false },
    };
  }),
  on(foldersActions.loadChildrenFailure, (state, { parentId, error }) => {
    const key = folderParentKey(parentId);
    return {
      ...state,
      loadingByParent: { ...state.loadingByParent, [key]: false },
      errorByParent: { ...state.errorByParent, [key]: error },
    };
  }),
);
