"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.signAccessToken = signAccessToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret;
}
async function requireAuth(req, res, next) {
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;
    if (!token) {
        res.status(401).json({ success: false, message: 'Vui lòng cung cấp access token' });
        return;
    }
    let payload;
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret());
        if (typeof decoded === 'string')
            throw new Error('Invalid token payload');
        payload = decoded;
    }
    catch {
        res.status(401).json({ success: false, message: 'Access token không hợp lệ hoặc đã hết hạn' });
        return;
    }
    if (typeof payload.userId !== 'string') {
        res.status(401).json({ success: false, message: 'Access token không hợp lệ' });
        return;
    }
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, username: true, role: true },
        });
        if (!user) {
            res.status(401).json({ success: false, message: 'Tài khoản không còn tồn tại hoặc đã bị thu hồi' });
            return;
        }
        // Read the current role from the database so role changes take effect immediately,
        // even when a client still holds a token issued before the change.
        req.auth = {
            userId: user.id,
            username: user.username,
            role: user.role,
        };
        next();
    }
    catch (error) {
        console.error('Authentication lookup error:', error);
        res.status(503).json({ success: false, message: 'Không thể xác thực tài khoản lúc này' });
    }
}
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        const auth = req.auth;
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
function signAccessToken(user) {
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    return jsonwebtoken_1.default.sign(user, getJwtSecret(), { expiresIn: expiresIn });
}
