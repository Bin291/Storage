import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/** Tải xuống hàng loạt (mục 11.J) — chọn hỗn hợp file rời rạc + folder. */
export class BulkZipDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(500)
  fileIds!: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  folderIds!: string[];
}
