import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InitUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(20)
  extension!: string;

  @IsString()
  @MaxLength(255)
  mimeType!: string;

  // size là bytes; gửi dạng string để không mất chính xác với file > 2^53 (an toàn).
  @IsString()
  size!: string;

  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}

export class PartUrlsDto {
  @IsString()
  uploadId!: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  partNumbers!: number[];
}

export class CompletedPartDto {
  @IsInt()
  @Min(1)
  PartNumber!: number;

  @IsString()
  ETag!: string;
}

export class CompleteUploadDto {
  @IsString()
  uploadId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts!: CompletedPartDto[];
}

export class UploadIdDto {
  @IsString()
  uploadId!: string;
}
