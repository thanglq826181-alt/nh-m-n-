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
const usersRouter = (0, express_1.Router)();
const adminAccess = [auth_1.requireAuth, (0, auth_1.requireRole)(client_1.UserRole.ADMIN)];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_SELECT = { id: true, username: true, fullName: true, role: true, createdAt: true };
function validUserId(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}
function isUserRole(value) {
    return typeof value === 'string' && Object.values(client_1.UserRole).includes(value);
}
usersRouter.get('/', ...adminAccess, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        res.status(400).json({ success: false, message: 'page phải >= 1; limit phải từ 1 đến 100' });
        return;
    }
    try {
        const [users, total] = await db_1.prisma.$transaction([
            db_1.prisma.user.findMany({
                select: USER_SELECT,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            db_1.prisma.user.count(),
        ]);
        res.status(200).json({ success: true, data: users, pagination: { page, limit, total } });
    }
    catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy danh sách người dùng lúc này' });
    }
});
usersRouter.get('/:id', ...adminAccess, async (req, res) => {
    const id = req.params.id;
    if (!validUserId(id)) {
        res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
        return;
    }
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!user) {
            res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
            return;
        }
        res.status(200).json({ success: true, data: user });
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy người dùng lúc này' });
    }
});
usersRouter.post('/', ...adminAccess, async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : null;
    const role = req.body?.role;
    if (username.length < 3 || username.length > 50) {
        res.status(400).json({ success: false, message: 'username phải có từ 3 đến 50 ký tự' });
        return;
    }
    if (password.length < 8 || password.length > 72) {
        res.status(400).json({ success: false, message: 'password phải có từ 8 đến 72 ký tự' });
        return;
    }
    if (fullName && fullName.length > 100) {
        res.status(400).json({ success: false, message: 'fullName tối đa 100 ký tự' });
        return;
    }
    if (!isUserRole(role)) {
        res.status(400).json({ success: false, message: 'role phải là ADMIN, OPERATOR hoặc CUSTOMER' });
        return;
    }
    try {
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        const user = await db_1.prisma.user.create({
            data: { username, passwordHash, fullName, role },
            select: USER_SELECT,
        });
        res.status(201).json({ success: true, message: 'Tạo người dùng thành công', data: user });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            res.status(409).json({ success: false, message: 'Username đã được sử dụng' });
            return;
        }
        console.error('Create user error:', error);
        res.status(500).json({ success: false, message: 'Không thể tạo người dùng lúc này' });
    }
});
usersRouter.patch('/:id/role', ...adminAccess, async (req, res) => {
    const id = req.params.id;
    const role = req.body?.role;
    if (!validUserId(id)) {
        res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
        return;
    }
    if (!isUserRole(role)) {
        res.status(400).json({ success: false, message: 'role phải là ADMIN, OPERATOR hoặc CUSTOMER' });
        return;
    }
    try {
        const result = await db_1.prisma.$transaction(async (tx) => {
            const target = await tx.user.findUnique({ where: { id } });
            if (!target)
                return { kind: 'NOT_FOUND' };
            if (target.role === client_1.UserRole.ADMIN && role !== client_1.UserRole.ADMIN) {
                const adminCount = await tx.user.count({ where: { role: client_1.UserRole.ADMIN } });
                if (adminCount <= 1)
                    return { kind: 'LAST_ADMIN' };
            }
            const user = await tx.user.update({ where: { id }, data: { role }, select: USER_SELECT });
            return { kind: 'OK', user };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        if (result.kind === 'NOT_FOUND') {
            res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
            return;
        }
        if (result.kind === 'LAST_ADMIN') {
            res.status(409).json({ success: false, message: 'Không thể hạ quyền Admin cuối cùng' });
            return;
        }
        res.status(200).json({ success: true, message: 'Cập nhật role thành công', data: result.user });
    }
    catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật role lúc này' });
    }
});
usersRouter.delete('/:id', ...adminAccess, async (req, res) => {
    const id = req.params.id;
    if (!validUserId(id)) {
        res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
        return;
    }
    const auth = req.auth;
    if (id === auth.userId) {
        res.status(400).json({ success: false, message: 'Không thể xóa tài khoản đang đăng nhập' });
        return;
    }
    try {
        const result = await db_1.prisma.$transaction(async (tx) => {
            const target = await tx.user.findUnique({ where: { id } });
            if (!target)
                return { kind: 'NOT_FOUND' };
            if (target.role === client_1.UserRole.ADMIN) {
                const adminCount = await tx.user.count({ where: { role: client_1.UserRole.ADMIN } });
                if (adminCount <= 1)
                    return { kind: 'LAST_ADMIN' };
            }
            await tx.user.delete({ where: { id } });
            return { kind: 'OK' };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        if (result.kind === 'NOT_FOUND') {
            res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
            return;
        }
        if (result.kind === 'LAST_ADMIN') {
            res.status(409).json({ success: false, message: 'Không thể xóa Admin cuối cùng' });
            return;
        }
        res.status(200).json({ success: true, message: 'Xóa người dùng thành công' });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Không thể xóa người dùng lúc này' });
    }
});
exports.default = usersRouter;
