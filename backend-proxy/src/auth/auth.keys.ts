// auth.keys.ts
// WARNING: These are for development/lab use only. In production, load these from AWS Secrets Manager.

export const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDE4R5Q/C4W6x1W
... (We will use a shortened valid structure for the code block) ...
-----END PRIVATE KEY-----`;

// This is the mathematical breakdown of the Public Key for the Sidecar
export const JWKS_PUBLIC_KEY = {
  kty: 'RSA',
  alg: 'RS256',
  use: 'sig',
  kid: 'ros2-lab-key-001',
  n: 'xOEeUPwuFusdVjB9Zz2_...', // Modulus
  e: 'AQAB', // Exponent
};