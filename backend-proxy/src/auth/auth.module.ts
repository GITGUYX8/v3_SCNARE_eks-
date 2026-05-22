import { Module, Controller, Post, Body } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

// --- A Quick Mock Login Controller ---
@Controller('api/auth')
export class AuthController {
  constructor(private jwtService: JwtService) {}

  @Post('login')
  login(@Body('studentId') studentId: string) {
    // We issue a token that expires in exactly 4 hours, matching our K8s Pod timeout!
    const payload = { sub: studentId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

// --- The Module Configuration ---
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: 'SUPER_SECRET_DEV_KEY', // Must match the secret in jwt.strategy.ts
      signOptions: { expiresIn: '4h' },
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
})
export class AuthModule {}