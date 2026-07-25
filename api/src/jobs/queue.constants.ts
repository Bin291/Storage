/** Tên các hàng đợi BullMQ dùng chung toàn app (mục 5.B/5.E/7.A/7.E). */
export const QUEUE = {
  CLEANUP: 'cleanup', // dọn GCS rồi xoá DB (mục 7.E)
  AI_PIPELINE: 'ai-pipeline', // trích text + embedding (mục 5.B, 8)
  THUMBNAIL: 'thumbnail', // sinh thumbnail (mục 7.A/7.C)
  ZIP: 'zip', // nén folder để download (mục 5.E)
  TRASH_SWEEP: 'trash-sweep', // job định kỳ dọn Thùng rác quá hạn (mục 7.E/11.K)
} as const;

export interface CleanupJob {
  type: 'file' | 'folder';
  userId: string;
  targetId: string; // fileId hoặc folderId (root cần hard-delete)
  r2Keys: string[]; // mọi object GCS cần xoá trước khi xoá DB
}

export interface AiPipelineJob {
  fileId: string;
  userId: string;
}

export interface ThumbnailJob {
  fileId: string;
  userId: string;
}

/**
 * Nén file/folder thành .zip (mục 5.E/11.J). `fileIds`: file rời rạc đặt
 * thẳng gốc zip; `folderIds`: mỗi folder đệ quy nguyên cây, đặt trong 1 thư
 * mục con = tên folder đó. 2 mảng có thể kết hợp (chọn hỗn hợp file + folder
 * kiểu Drive) — tải 1 folder đơn cũng chỉ là `folderIds: [id]`, `fileIds: []`.
 */
export interface ZipJob {
  userId: string;
  jobId: string;
  fileIds: string[];
  folderIds: string[];
}
