import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { MeController } from './me.controller';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MeController],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
