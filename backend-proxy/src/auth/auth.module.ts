import { Module, Controller, Post, Body } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { PRIVATE_KEY } from './auth.keys';
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
    privateKey: PRIVATE_KEY, // Replaces 'secret'
    signOptions: { 
      algorithm: 'RS256', // CRITICAL: Switch to Asymmetric Encryption
      expiresIn: '60m', 
      issuer: 'https://interdentally-moderne-taunya.ngrok-free.dev', 
      audience: 'ros2-lab-platform', 
      keyid: 'ros2-lab-key-001', // Tells AWS which key in the JWKS to use
    },
    })
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
})
export class AuthModule {}