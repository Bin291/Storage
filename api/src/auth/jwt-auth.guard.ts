import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guard mặc định cho mọi route cần đăng nhập. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
