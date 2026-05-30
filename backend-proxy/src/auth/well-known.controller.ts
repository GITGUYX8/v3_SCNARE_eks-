import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('.well-known')
export class WellKnownController {
  
  // 1. The Discovery Endpoint (Tells AWS what your backend supports)
  @Get('openid-configuration')
  getOpenIdConfig(@Req() req: Request) {
    const baseUrl = `http://${req.headers.host}`;
    return {
      issuer: baseUrl,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['HS256'], // Keeping it simple for your current setup
      subject_types_supported: ['public'],
    };
  }

  // 2. The JWKS Endpoint (Hands out the public key)
  @Get('jwks.json')
  getJwks() {
    return {
      keys: [
        {
          kty: 'oct', // Octet sequence (Symmetric key for HS256)
          alg: 'HS256',
          use: 'sig',
          kid: 'ros2-secret-key-1',
          // Replace this with a Base64-URL encoded version of your NestJS JWT Secret
          k: 'WW91ckFjdHVhbE5lc3RKU0p3dFNlY3JldEtleUdvZXNIZXJl', 
        }
      ]
    };
  }
}