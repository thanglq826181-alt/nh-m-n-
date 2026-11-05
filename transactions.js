"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const realtime_1 = require("../services/realtime");
const runtime_1 = require("../config/runtime");
const transactionsRouter = (0, express_1.Router)();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const staffRoles = [client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR];
function isStaff(req) {
    const role = req.auth.role;
    return staffRoles.includes(role);
}
function canAccess(customerId, req) {
    const auth = req.auth;
    return isStaff(req) || customerId === auth.userId;
}
function simulationOnly(_req, res, next) {
    if (!(0, runtime_1.simulationsEnabled)()) {
        res.status(404).json({ success: false, message: 'Không tìm thấy endpoint' });
        return;
    }
    next();
}
transactionsRouter.post('/', auth_1.requireAuth, async (req, res) => {
    const machineId = req.body?.machineId;
    const columnId = req.body?.columnId;
    if (typeof machineId !== 'string' || !UUID_PATTERN.test(machineId) || typeof columnId !== 'string' || !UUID_PATTERN.test(columnId)) {
        res.status(400).json({ success: false, message: 'machineId và columnId phải là UUID hợp lệ' });
        return;
    }
    try {
        const column = await db_1.prisma.column.findFirst({
            where: { id: columnId, machineId },
            include: { machine: true, product: true, batches: { where: { quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] }, orderBy: { createdAt: 'asc' } } },
        });
        if (!column) {
            res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng thuộc máy này' });
            return;
        }
        if (column.machine.status !== client_1.MachineStatus.ONLINE) {
            res.status(409).json({ success: false, message: 'Máy hiện không hoạt động' });
            return;
        }
        if (!column.product) {
            res.status(409).json({ success: false, message: 'Cột hàng chưa được gán sản phẩm' });
            return;
        }
        if (!column.batches.some((batch) => batch.quantity > 0)) {
            res.status(409).json({ success: false, message: 'Sản phẩm hiện hết hàng hoặc đã hết hạn' });
            return;
        }
        const auth = req.auth;
        const transaction = await db_1.prisma.transaction.create({
            data: {
                transactionCode: `FV-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex').toUpperCase()}`,
                customerId: auth.userId,
                machineId,
                columnId,
                amount: column.product.price,
            },
            include: { machine: true, column: { include: { product: true } } },
        });
        res.status(201).json({
            success: true,
            message: 'Tạo giao dịch giả lập thành công; đang chờ thanh toán',
            data: transaction,
            simulation: { next: `/api/v1/transactions/${transaction.id}/simulate-payment`, allowedOutcomes: ['SUCCESS', 'FAILED'] },
        });
        (0, realtime_1.publishRealtime)('transaction', { transactionId: transaction.id, machineId, createdAt: transaction.createdAt.toISOString() });
    }
    catch (error) {
        console.error('Create transaction error:', error);
        res.status(500).json({ success: false, message: 'Không thể tạo giao dịch lúc này' });
    }
});
transactionsRouter.get('/', auth_1.requireAuth, async (req, res) => {
    const auth = req.auth;
    try {
        const transactions = await db_1.prisma.transaction.findMany({
            where: isStaff(req) ? {} : { customerId: auth.userId },
            orderBy: { createdAt: 'desc' },
            include: { machine: true, column: { include: { product: true } }, customer: { select: { username: true, fullName: true } } },
        });
        const safeTransactions = isStaff(req) && req.auth.role !== client_1.UserRole.ADMIN
            ? transactions.map(({ amount: _amount, ...transaction }) => transaction)
            : transactions;
        res.status(200).json({ success: true, data: safeTransactions });
    }
    catch (error) {
        console.error('List transactions error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy danh sách giao dịch lúc này' });
    }
});
transactionsRouter.get('/:id', auth_1.requireAuth, async (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
        res.status(400).json({ success: false, message: 'ID giao dịch không hợp lệ' });
        return;
    }
    try {
        const transaction = await db_1.prisma.transaction.findUnique({
            where: { id },
            include: { machine: true, column: { include: { product: true } } },
        });
        if (!transaction || !canAccess(transaction.customerId, req)) {
            res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
            return;
        }
        const visibleTransaction = req.auth.role === client_1.UserRole.OPERATOR
            ? { ...transaction, amount: undefined }
            : transaction;
        res.status(200).json({ success: true, data: visibleTransaction });
    }
    catch (error) {
        console.error('Get transaction error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy giao dịch lúc này' });
    }
});
transactionsRouter.post('/:id/simulate-payment', auth_1.requireAuth, simulationOnly, async (req, res) => {
    const id = req.params.id;
    const outcome = req.body?.outcome;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
        res.status(400).json({ success: false, message: 'ID giao dịch không hợp lệ' });
        return;
    }
    if (outcome !== 'SUCCESS' && outcome !== 'FAILED') {
        res.status(400).json({ success: false, message: 'outcome phải là SUCCESS hoặc FAILED' });
        return;
    }
    try {
        const existing = await db_1.prisma.transaction.findUnique({ where: { id } });
        if (!existing || !canAccess(existing.customerId, req)) {
            res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
            return;
        }
        if (existing.paymentStatus !== client_1.PaymentStatus.PENDING) {
            res.status(409).json({ success: false, message: 'Giao dịch không còn chờ thanh toán' });
            return;
        }
        const paymentUpdate = await db_1.prisma.transaction.updateMany({
            where: { id, paymentStatus: client_1.PaymentStatus.PENDING },
            data: { paymentStatus: outcome === 'SUCCESS' ? client_1.PaymentStatus.SUCCESS : client_1.PaymentStatus.FAILED },
        });
        if (paymentUpdate.count !== 1) {
            res.status(409).json({ success: false, message: 'Giao dịch đã được xử lý hoặc không còn chờ thanh toán' });
            return;
        }
        const transaction = await db_1.prisma.transaction.findUniqueOrThrow({
            where: { id },
            include: { machine: true, column: { include: { product: true } } },
        });
        res.status(200).json({
            success: true,
            message: outcome === 'SUCCESS' ? 'Thanh toán giả lập thành công; chờ kết quả nhả hàng' : 'Thanh toán giả lập thất bại',
            data: transaction,
            ...(outcome === 'SUCCESS'
                ? { simulation: { next: `/api/v1/transactions/${id}/simulate-dispense`, allowedOutcomes: ['SUCCESS', 'JAMMED'] } }
                : {}),
        });
    }
    catch (error) {
        console.error('Simulate payment error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật thanh toán lúc này' });
    }
});
transactionsRouter.post('/:id/simulate-dispense', auth_1.requireAuth, simulationOnly, async (req, res) => {
    const id = req.params.id;
    const outcome = req.body?.outcome;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
        res.status(400).json({ success: false, message: 'ID giao dịch không hợp lệ' });
        return;
    }
    if (outcome !== 'SUCCESS' && outcome !== 'JAMMED') {
        res.status(400).json({ success: false, message: 'outcome phải là SUCCESS hoặc JAMMED' });
        return;
    }
    try {
        const transaction = await db_1.prisma.$transaction(async (tx) => {
            const existing = await tx.transaction.findUnique({ where: { id } });
            if (!existing || !canAccess(existing.customerId, req)) {
                return { error: 'NOT_FOUND' };
            }
            if (existing.paymentStatus !== client_1.PaymentStatus.SUCCESS || existing.dispenseStatus !== client_1.DispenseStatus.PENDING) {
                return { error: 'INVALID_STATE' };
            }
            if (outcome === 'SUCCESS') {
                const now = new Date();
                const batch = await tx.inventoryBatch.findFirst({
                    where: { columnId: existing.columnId, quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] },
                    orderBy: { createdAt: 'asc' },
                });
                const batchUpdate = batch ? await tx.inventoryBatch.updateMany({
                    where: { id: batch.id, quantity: { gt: 0 } },
                    data: { quantity: { decrement: 1 } },
                }) : { count: 0 };
                const stockUpdate = batchUpdate.count > 0 ? await tx.column.updateMany({
                    where: {
                        id: existing.columnId,
                        machineId: existing.machineId,
                        currentStock: { gt: 0 },
                    },
                    data: { currentStock: { decrement: 1 } },
                }) : { count: 0 };
                if (stockUpdate.count === 0 || !batch || batchUpdate.count === 0) {
                    if (batchUpdate.count > 0)
                        throw new Error('INVENTORY_INCONSISTENT');
                    const jammed = await tx.transaction.update({
                        where: { id },
                        data: { dispenseStatus: client_1.DispenseStatus.JAMMED },
                        include: { machine: true, column: { include: { product: true } } },
                    });
                    return { value: jammed, error: 'OUT_OF_STOCK' };
                }
                const remainingBatches = await tx.inventoryBatch.findMany({ where: { columnId: existing.columnId, quantity: { gt: 0 } }, select: { expiryDate: true, quantity: true }, orderBy: { createdAt: 'asc' } });
                const nextExpiry = remainingBatches.filter((lot) => lot.expiryDate).sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())[0]?.expiryDate ?? null;
                await tx.column.update({ where: { id: existing.columnId }, data: { expiryDate: nextExpiry } });
            }
            const updated = await tx.transaction.update({
                where: { id },
                data: {
                    dispenseStatus: outcome === 'SUCCESS' ? client_1.DispenseStatus.SUCCESS : client_1.DispenseStatus.JAMMED,
                    dispenseRetryCount: outcome === 'SUCCESS' ? 0 : 2,
                    dispenseErrorCode: outcome === 'SUCCESS' ? null : 'SIMULATED_JAM_AFTER_RETRIES',
                },
                include: { machine: true, column: { include: { product: true } } },
            });
            return { value: updated, error: null };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        if ('error' in transaction && transaction.error === 'NOT_FOUND') {
            res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
            return;
        }
        if ('error' in transaction && transaction.error === 'INVALID_STATE') {
            res.status(409).json({ success: false, message: 'Giao dịch chưa thanh toán hoặc đã có kết quả nhả hàng' });
            return;
        }
        if ('error' in transaction && transaction.error === 'OUT_OF_STOCK') {
            res.status(409).json({
                success: false,
                message: 'Không còn tồn kho để nhả hàng; giao dịch được đánh dấu JAMMED, cần xử lý hoàn tiền riêng',
                data: transaction.value,
            });
            return;
        }
        if (!('value' in transaction)) {
            res.status(500).json({ success: false, message: 'Không thể cập nhật kết quả nhả hàng' });
            return;
        }
        res.status(200).json({
            success: true,
            message: outcome === 'SUCCESS' ? 'Nhả hàng giả lập thành công' : 'Đã giả lập 1 lần nhả ban đầu và 2 lần thử lại; cần nhân viên xử lý giao dịch/hoàn tiền',
            data: transaction.value,
        });
        (0, realtime_1.publishRealtime)('transaction', { transactionId: transaction.value.id, machineId: transaction.value.machineId, dispenseStatus: transaction.value.dispenseStatus, createdAt: new Date().toISOString() });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
            res.status(409).json({ success: false, message: 'Tồn kho vừa được cập nhật đồng thời; vui lòng tải lại rồi thử lại' });
            return;
        }
        console.error('Simulate dispense error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật kết quả nhả hàng lúc này' });
    }
});
exports.default = transactionsRouter;
