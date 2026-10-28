declare module 'jsonwebtoken' {
  export interface JwtPayload {
    [key: string]: unknown;
    iat?: number;
    exp?: number;
  }

  export interface SignOptions {
    expiresIn?: string | number;
  }

  export function verify(token: string, secret: string): JwtPayload | string;
  export function sign(payload: object, secret: string, options?: SignOptions): string;

  const jwt: { verify: typeof verify; sign: typeof sign };
  export default jwt;
}
