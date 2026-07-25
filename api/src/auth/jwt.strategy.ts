import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

// Placeholder chỉ để app boot khi chưa cấu hình secret — token thật sẽ KHÔNG verify được.
const DEV_PLACEHOLDER_SECRET = 'MISSING_SUPABASE_JWT_SECRET_PLACEHOLDER';

/** Payload JWT của Supabase (các trường dùng tới). */
export interface SupabaseJwtPayload {
  sub: string; // user id
  email?: string;
  role?: string;
  [key: string]: unknown;
}

/** Thông tin user gắn vào request sau khi verify. */
export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Verify JWT của Supabase — mục 3 PLAN.md.
 *
 * Supabase (project mới) ký access token của user bằng khóa BẤT ĐỐI XỨNG (ES256/RS256)
 * và công bố public key qua JWKS: <SUPABASE_URL>/auth/v1/.well-known/jwks.json.
 * Ta verify bằng JWKS (secretOrKeyProvider). Nếu project vẫn dùng JWT secret đối xứng
 * (HS256) thì rơi về SUPABASE_JWT_SECRET.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('supabase.jwtSecret');
    const supabaseUrl = config.get<string>('supabase.url');
    const jwksUri = supabaseUrl
      ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
      : undefined;

    // Provider lấy public key theo `kid` từ JWKS (cache + rate-limit sẵn có).
    const jwksProvider = jwksUri
      ? passportJwtSecret({
          jwksUri,
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 10,
        })
      : undefined;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Supabase phát token với audience "authenticated".
      audience: 'authenticated',
      // Hỗ trợ cả token bất đối xứng (JWKS) lẫn đối xứng (JWT secret legacy).
      algorithms: ['ES256', 'RS256', 'HS256'],
      // Chọn key theo alg của token: HS* -> secret đối xứng; còn lại -> JWKS.
      secretOrKeyProvider: (
        _req: unknown,
        rawJwt: string,
        done: (err: Error | null, key?: string | Buffer) => void,
      ) => {
        const alg = decodeAlg(rawJwt);
        if (alg && alg.startsWith('HS')) {
          done(null, secret || DEV_PLACEHOLDER_SECRET);
          return;
        }
        if (jwksProvider) {
          jwksProvider(_req, rawJwt, done);
          return;
        }
        done(null, secret || DEV_PLACEHOLDER_SECRET);
      },
    });

    if (!jwksUri && !secret) {
      new Logger(JwtStrategy.name).warn(
        'Thiếu SUPABASE_URL và SUPABASE_JWT_SECRET — API boot nhưng xác thực sẽ trả 401.',
      );
    }
  }

  validate(payload: SupabaseJwtPayload): AuthUser {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    return { id: payload.sub, email: payload.email };
  }
}

/** Đọc trường `alg` trong header JWT mà không cần verify. */
function decodeAlg(rawJwt: string): string | undefined {
  try {
    const header = rawJwt.split('.')[0];
    const json = Buffer.from(header, 'base64').toString('utf8');
    return (JSON.parse(json) as { alg?: string }).alg;
  } catch {
    return undefined;
  }
}
