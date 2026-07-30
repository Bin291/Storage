import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../infra/common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SearchService } from './search.service';

class SearchQuery {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  q!: string;
}

// AI Search: 20 request/phút/user (mục 5.D) — chỉ gọi khi nhấn Enter (mục 8.C).
@Controller('search')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(@CurrentUser('id') userId: string, @Query() q: SearchQuery) {
    return this.search.search(userId, q.q);
  }
}
