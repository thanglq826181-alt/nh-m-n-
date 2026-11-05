"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const authRouter = (0, express_1.Router)();
const SALT_ROUNDS = 12;
authRouter.post('/register', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : undefined;
    if (username.length < 3 || username.length > 50) {
        res.status(400).json({ success: false, message: 'Username phải có từ 3 đến 50 ký tự' });
        return;
    }
    if (password.length < 8 || password.length > 72) {
        res.status(400).json({ success: false, message: 'Password phải có từ 8 đến 72 ký tự' });
        return;
    }
    if (fullName && fullName.length > 100) {
        res.status(400).json({ success: false, message: 'Full name tối đa 100 ký tự' });
        return;
    }
    try {
        const existingUser = await db_1.prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            res.status(409).json({ success: false, message: 'Username đã được sử dụng' });
            return;
        }
        const passwordHash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
        const user = await db_1.prisma.user.create({
            data: {
                username,
                passwordHash,
                fullName: fullName || null,
                role: client_1.UserRole.CUSTOMER,
            },
            select: { id: true, username: true, fullName: true, role: true, createdAt: true },
        });
        res.status(201).json({ success: true, message: 'Tạo tài khoản thành công', user });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Không thể tạo tài khoản lúc này' });
    }
});
authRouter.post('/login', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
        res.status(400).json({ success: false, message: 'Vui lòng nhập username và password' });
        return;
    }
    try {
        const user = await db_1.prisma.user.findUnique({ where: { username } });
        if (!user || !(await bcrypt_1.default.compare(password, user.passwordHash))) {
            res.status(401).json({ success: false, message: 'Username hoặc password không đúng' });
            return;
        }
        const token = (0, auth_1.signAccessToken)({ userId: user.id, username: user.username, role: user.role });
        res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            token,
            user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Không thể đăng nhập lúc này' });
    }
});
authRouter.get('/me', auth_1.requireAuth, async (req, res) => {
    const auth = req.auth;
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: auth.userId },
            select: { id: true, username: true, fullName: true, role: true, createdAt: true },
        });
        if (!user) {
            res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
            return;
        }
        res.status(200).json({ success: true, user });
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy thông tin tài khoản lúc này' });
    }
});
exports.default = authRouter;
