import { createReducer, on } from '@ngrx/store';
import { FileItem } from '../../core/files/file.model';
import { filesActions } from './files.actions';

export interface FilesState {
  files: FileItem[];
  total: number;
  loading: boolean;
  error: string | null;
}

export const initialFilesState: FilesState = {
  files: [],
  total: 0,
  loading: false,
  error: null,
};

export const filesReducer = createReducer(
  initialFilesState,
  on(filesActions.loadFiles, (state) => ({ ...state, error: null })),
  on(filesActions.loadFilesSuccess, (state, { result }) => ({
    ...state,
    files: result.files,
    total: result.total,
    loading: false,
    error: null,
  })),
  on(filesActions.loadFilesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(filesActions.clearFiles, (state) => ({
    ...state,
    files: [],
    total: 0,
    loading: true,
    error: null,
  })),
  on(filesActions.filePatched, (state, { id, patch }) => ({
    ...state,
    files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  })),
  on(filesActions.filesRemoved, (state, { ids }) => {
    const idSet = new Set(ids);
    return { ...state, files: state.files.filter((f) => !idSet.has(f.id)) };
  }),
);
