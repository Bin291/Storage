import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../infra/common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FoldersService } from './folders.service';
import {
  CreateFolderDto,
  MoveFolderDto,
  RenameFolderDto,
  StarDto,
} from './dto';

// Nhóm "duyệt file/folder": 100 request/phút/user (mục 5.D).
@Controller('folders')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.folders.create(userId, dto.name, dto.parentId ?? null);
  }

  /** Con trực tiếp của 1 folder (query parentId rỗng = gốc). */
  @Get('children')
  children(
    @CurrentUser('id') userId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.folders.children(userId, parentId ?? null);
  }

  @Get(':id/breadcrumb')
  breadcrumb(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.folders.breadcrumb(userId, id);
  }

  @Patch(':id/rename')
  rename(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.folders.rename(userId, id, dto.name);
  }

  @Patch(':id/move')
  move(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
  ) {
    return this.folders.move(userId, id, dto.parentId);
  }

  /** Sao chép cả cây thư mục sang chỗ khác (mục 11.N). */
  @Post(':id/copy')
  copy(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
  ) {
    return this.folders.copy(userId, id, dto.parentId);
  }

  @Patch(':id/star')
  star(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: StarDto,
  ) {
    return this.folders.setStar(userId, id, dto.isStarred);
  }

  /** Xoá mềm — vào Thùng rác, cascade xuống con, khôi phục được (mục 7.E/11.K). */
  @Patch(':id/trash')
  async trash(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.folders.trash(userId, id);
    return { status: 'trashed' };
  }

  /** Khôi phục từ Thùng rác (mục 7.E/11.K). */
  @Patch(':id/restore')
  restore(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.folders.restore(userId, id);
  }

  /** Xoá vĩnh viễn — chỉ hợp lệ khi folder đã ở Thùng rác (mục 7.E/11.K). */
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.folders.hardDelete(userId, id);
    return { status: 'delete_pending' };
  }
}
