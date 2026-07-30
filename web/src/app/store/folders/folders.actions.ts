import { createActionGroup, props } from '@ngrx/store';
import { FolderItem } from '../../core/models';

/** Cây con trực tiếp của 1 folder (hoặc gốc, parentId = null) — dùng bởi sidebar (mục 11.H). */
export const foldersActions = createActionGroup({
  source: 'Folders',
  events: {
    'Load Children': props<{ parentId: string | null }>(),
    'Load Children Success': props<{ parentId: string | null; children: FolderItem[] }>(),
    'Load Children Failure': props<{ parentId: string | null; error: string }>(),
  },
});
