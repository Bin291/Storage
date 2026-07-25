import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FilesService } from './files.service';
import { ListFilesQuery, MoveFileDto, RenameFileDto, StarDto } from './dto';

// Nhóm "duyệt file/folder": 100 request/phút/user (mục 5.D).
@Controller('files')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query() q: ListFilesQuery) {
    return this.files.list(userId, q);
  }

  @Get('stats/usage')
  usage(@CurrentUser('id') userId: string) {
    return this.files.usage(userId);
  }

  /** Số đếm theo đuôi file cho sidebar "Theo loại" + tile Dashboard (mục 11.H). */
  @Get('stats')
  stats(@CurrentUser('id') userId: string) {
    return this.files.stats(userId);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.files.getById(userId, id);
  }

  @Patch(':id/rename')
  rename(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RenameFileDto,
  ) {
    return this.files.rename(userId, id, dto.name);
  }

  @Patch(':id/move')
  move(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: MoveFileDto,
  ) {
    return this.files.move(userId, id, dto.folderId);
  }

  @Patch(':id/star')
  star(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: StarDto,
  ) {
    return this.files.setStar(userId, id, dto.isStarred);
  }

  /** Xoá mềm — vào Thùng rác, khôi phục được (mục 7.E/11.K). */
  @Patch(':id/trash')
  trash(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.files.trash(userId, id);
  }

  /** Khôi phục từ Thùng rác (mục 7.E/11.K). */
  @Patch(':id/restore')
  restore(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.files.restore(userId, id);
  }

  /** Xoá vĩnh viễn — chỉ hợp lệ khi file đã ở Thùng rác (mục 7.E/11.K). */
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.files.hardDelete(userId, id);
    return { status: 'delete_pending' };
  }
}
