import { createFeatureSelector, createSelector } from '@ngrx/store';
import { FilesState } from './files.reducer';

export const selectFilesState = createFeatureSelector<FilesState>('files');

export const selectFiles = createSelector(selectFilesState, (s) => s.files);
export const selectFilesTotal = createSelector(selectFilesState, (s) => s.total);
export const selectFilesLoading = createSelector(selectFilesState, (s) => s.loading);
export const selectFilesError = createSelector(selectFilesState, (s) => s.error);
