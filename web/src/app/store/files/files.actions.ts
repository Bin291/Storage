import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { FileItem, FileListResult, ListParams } from '../../core/files/file.model';

/** Danh sách file của view hiện tại (mục 11.H — trang Files). */
export const filesActions = createActionGroup({
  source: 'Files',
  events: {
    'Load Files': props<{ params: ListParams }>(),
    'Load Files Success': props<{ result: FileListResult }>(),
    'Load Files Failure': props<{ error: string }>(),
    /** Đổi lăng kính/folder -> xoá danh sách cũ + hiện spinner (mục 11.H). */
    'Clear Files': emptyProps(),
    /** Vá tại chỗ 1 field của 1 file (star, realtime status, retry) — không refetch cả danh sách. */
    'File Patched': props<{ id: string; patch: Partial<FileItem> }>(),
    /** Xoá khỏi danh sách sau khi trash (đơn hoặc hàng loạt — mục 7.E/11.J/11.K). */
    'Files Removed': props<{ ids: string[] }>(),
  },
});
