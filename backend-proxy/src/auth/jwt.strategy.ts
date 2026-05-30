import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { PUBLIC_KEY_PEM } from './auth.keys'; // 1. Import the new key
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // 1. Tell it to look for the token in the "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // 2. Instantly reject expired tokens
      secretOrKey: PUBLIC_KEY_PEM,
      algorithms: ['RS256'],
    });
  }

  // 3. If the token is cryptographically valid, this function runs.
  // It extracts the data (payload) and attaches it to the 'req.user' object.
  async validate(payload: any) {
    return { studentId: payload.sub };
  }
}
