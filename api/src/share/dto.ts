import {
  IsBoolean,
  IsEmail,
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

/** Body chung cho việc chọn target — đúng 1 trong 2 (kiểm ở service, mục 12.C). */
class ShareTargetDto {
  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

/** Tạo link công khai — kênh B (mục 12.E). */
export class CreateLinkDto extends ShareTargetDto {
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password?: string;
}

/** Mời theo email — kênh A (mục 12.E/12.I). */
export class InviteDto extends ShareTargetDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}

export class UpdateShareDto {
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  /** null = bỏ hạn; số = đặt lại hạn tính từ bây giờ. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number | null;

  /** Chuỗi rỗng = gỡ mật khẩu. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class ListSharesQuery extends ShareTargetDto {}

export class UnlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class PublicListQuery {
  @IsOptional()
  @IsUUID()
  folderId?: string;
}
