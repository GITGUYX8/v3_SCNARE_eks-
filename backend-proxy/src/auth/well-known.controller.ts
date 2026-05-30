import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PUBLIC_JWKS } from './auth.keys'; // Import the new keys

@Controller('.well-known')
export class WellKnownController {
  
  @Get('openid-configuration')
  getOpenIdConfig(@Req() req: Request) {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${req.headers.host}`;
    return {
      issuer: baseUrl,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['RS256'], // Updated to RS256
      subject_types_supported: ['public'],
    };
  }

  @Get('jwks.json')
  getJwks() {
    return PUBLIC_JWKS; // Serve the live math keys to AWS
  }
}