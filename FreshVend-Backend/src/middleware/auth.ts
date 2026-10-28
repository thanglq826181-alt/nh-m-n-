import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/db';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & { auth: AuthenticatedUser };

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : undefined;

  if (!token) {
    res.status(401).json({ success: false, message: 'Vui lòng cung cấp access token' });
    return;
  }

  let payload: JwtPayload;
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === 'string') throw new Error('Invalid token payload');
    payload = decoded as JwtPayload;
  } catch {
    res.status(401).json({ success: false, message: 'Access token không hợp lệ hoặc đã hết hạn' });
    return;
  }

  if (typeof payload.userId !== 'string') {
    res.status(401).json({ success: false, message: 'Access token không hợp lệ' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, role: true },
    });
    if (!user) {
      res.status(401).json({ success: false, message: 'Tài khoản không còn tồn tại hoặc đã bị thu hồi' });
      return;
    }

    // Read the current role from the database so role changes take effect immediately,
    // even when a client still holds a token issued before the change.
    (req as AuthenticatedRequest).auth = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    next();
  } catch (error) {
    console.error('Authentication lookup error:', error);
    res.status(503).json({ success: false, message: 'Không thể xác thực tài khoản lúc này' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Partial<AuthenticatedRequest>).auth;
    if (!auth) {
      res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập' });
      return;
    }

    if (!allowedRoles.includes(auth.role)) {
      res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
      return;
    }

    next();
  };
}

export function signAccessToken(user: AuthenticatedUser): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  return jwt.sign(user, getJwtSecret(), { expiresIn: expiresIn as SignOptions['expiresIn'] });
}
