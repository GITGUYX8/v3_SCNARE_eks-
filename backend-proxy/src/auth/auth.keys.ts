import { generateKeyPairSync } from 'crypto';

// 1. Generate a true 2048-bit RSA keypair in memory
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// 2. Export the Private Key for NestJS to sign tokens
export const PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' });
// ADD THIS LINE: Export the Public Key as a standard string for NestJS to use internally
export const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });
// 3. Export the Public Key directly to JWK format for AWS
const jwk = publicKey.export({ format: 'jwk' });

export const PUBLIC_JWKS = {
  keys: [
    {
      ...jwk,
      kid: 'ros2-lab-key-001',
      use: 'sig',
      alg: 'RS256' // The magic algorithm AWS demands
    }
  ]
};