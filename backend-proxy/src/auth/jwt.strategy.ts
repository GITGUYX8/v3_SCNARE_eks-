import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // 1. Tell it to look for the token in the "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // 2. Instantly reject expired tokens
      secretOrKey: 'SUPER_SECRET_DEV_KEY', // IMPORTANT: In production, load this from .env!
    });
  }

  // 3. If the token is cryptographically valid, this function runs.
  // It extracts the data (payload) and attaches it to the 'req.user' object.
  async validate(payload: any) {
    return { studentId: payload.sub };
  }
}
