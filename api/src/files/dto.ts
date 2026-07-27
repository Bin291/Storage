import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListFilesQuery {
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @IsString()
  category?: string; // document | image | video ... (mục 11.A)

  // Lăng kính "Theo loại" (mục 11.H): danh sách đuôi file, phẩy ngăn cách
  // (VD "pdf,docx,txt"). Có mặt = cắt ngang mọi folder, KHÔNG ràng buộc folderId.
  @IsOptional()
  @IsString()
  extensions?: string;

  // Tìm nhanh THEO TÊN (không phải AI — mục 8.C là đường riêng): khớp chuỗi con,
  // không phân biệt hoa/thường, cắt ngang mọi folder. Dùng cho dropdown gợi ý ở
  // ô tìm kiếm — rẻ, không tốn quota Gemini, chạy ngay khi người dùng đang gõ.
  @IsOptional()
  @IsString()
  q?: string;

  // Lăng kính "Gần đây" (mục 11.H): mọi file của user, sắp theo updatedAt desc,
  // không ràng buộc folder. Kèm folderPath cho từng dòng.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  recent?: boolean;

  @IsOptional()
  @IsIn(['name', 'updatedAt', 'size', 'createdAt'])
  sort: 'name' | 'updatedAt' | 'size' | 'createdAt' = 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}

export class RenameFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}

export class MoveFileDto {
  @IsOptional()
  @IsUUID()
  folderId!: string | null;
}

export class StarDto {
  @IsBoolean()
  isStarred!: boolean;
}
