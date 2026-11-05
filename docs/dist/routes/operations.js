"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const inventory_1 = require("../services/inventory");
const realtime_1 = require("../services/realtime");
const operationsRouter = (0, express_1.Router)();
const staffAccess = [auth_1.requireAuth, (0, auth_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR)];
const adminAccess = [auth_1.requireAuth, (0, auth_1.requireRole)(client_1.UserRole.ADMIN)];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REPORT_DAYS = 92;
operationsRouter.get('/stream', ...staffAccess, (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    const unsubscribe = (0, realtime_1.subscribeRealtime)(res);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});
function reportRange(req) {
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : new Date();
    const from = typeof req.query.from === 'string'
        ? new Date(req.query.from)
        : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to)
        return null;
    if (to.getTime() - from.getTime() > MAX_REPORT_DAYS * 24 * 60 * 60 * 1000)
        return null;
    return { from, to };
}
function csvCell(value) {
    const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
    const safe = /^[\s]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
}
async function collectAlerts() {
    const now = new Date();
    const machines = await db_1.prisma.machine.findMany({
        orderBy: { machineCode: 'asc' },
        include: {
            tempLogs: { orderBy: { loggedAt: 'desc' }, take: 1 },
            columns: { include: { batches: true, product: true }, orderBy: { columnNumber: 'asc' } },
        },
    });
    const alerts = [];
    for (const machine of machines) {
        const latest = machine.tempLogs[0];
        const updatedAt = latest?.loggedAt ?? machine.lastPing;
        if (machine.status === client_1.MachineStatus.FAULT) {
            const reason = latest && !latest.sensorOk ? 'Cảm biến báo lỗi.' : latest?.doorOpen ? 'Cửa máy đang mở.' : latest && (latest.temperature < machine.tempMin || latest.temperature > machine.tempMax) ? 'Nhiệt độ nằm ngoài ngưỡng an toàn.' : 'Máy đang ở trạng thái lỗi.';
            alerts.push({ id: `machine-fault-${machine.id}`, type: 'MACHINE_FAULT', severity: 'critical', machineId: machine.id, machineCode: machine.machineCode, message: reason });
        }
        else if (machine.status === client_1.MachineStatus.OFFLINE || !updatedAt || now.getTime() - updatedAt.getTime() > 120000) {
            alerts.push({ id: `machine-offline-${machine.id}`, type: 'MACHINE_OFFLINE', severity: 'warning', machineId: machine.id, machineCode: machine.machineCode, message: 'Máy mất kết nối hoặc chưa gửi telemetry trong 2 phút.' });
        }
        if (latest && (latest.temperature < machine.tempMin || latest.temperature > machine.tempMax)) {
            alerts.push({ id: `temperature-${machine.id}-${latest.id}`, type: 'TEMPERATURE_OUT_OF_RANGE', severity: 'critical', machineId: machine.id, machineCode: machine.machineCode, message: `Nhiệt độ ${latest.temperature} °C ngoài ngưỡng ${machine.tempMin}–${machine.tempMax} °C.`, createdAt: latest.loggedAt });
        }
        if (latest?.doorOpen) {
            alerts.push({ id: `door-${machine.id}-${latest.id}`, type: 'DOOR_OPEN', severity: 'warning', machineId: machine.id, machineCode: machine.machineCode, message: 'Cửa máy đang mở.', createdAt: latest.loggedAt });
        }
        for (const column of machine.columns) {
            if (!column.product)
                continue;
            const inventory = (0, inventory_1.summarizeInventory)(column, now);
            if (inventory.availableStock === 0 && inventory.expiredStock > 0) {
                alerts.push({ id: `expired-${column.id}`, type: 'EXPIRED_STOCK', severity: 'critical', machineId: machine.id, machineCode: machine.machineCode, columnId: column.id, columnNumber: column.columnNumber, message: `${column.product.name} tại cột ${column.columnNumber} đã hết hạn.` });
            }
            else if (inventory.availableStock > 0 && inventory.lowStock) {
                alerts.push({ id: `low-stock-${column.id}`, type: 'LOW_STOCK', severity: 'warning', machineId: machine.id, machineCode: machine.machineCode, columnId: column.id, columnNumber: column.columnNumber, message: `${column.product.name} còn ${inventory.availableStock} phần tại cột ${column.columnNumber}.` });
            }
            if (inventory.expiryWarning) {
                alerts.push({ id: `expiry-${column.id}`, type: 'EXPIRING_SOON', severity: 'warning', machineId: machine.id, machineCode: machine.machineCode, columnId: column.id, columnNumber: column.columnNumber, message: `${column.product.name} tại cột ${column.columnNumber} có lô sắp hết hạn trong 3 ngày.` });
            }
        }
    }
    const jammed = await db_1.prisma.transaction.findMany({
        where: { dispenseStatus: 'JAMMED', createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, createdAt: true, machineId: true, machine: { select: { machineCode: true } }, column: { select: { columnNumber: true, product: { select: { name: true } } } } },
    });
    for (const transaction of jammed) {
        alerts.push({ id: `dispense-jammed-${transaction.id}`, type: 'DISPENSE_JAMMED', severity: 'critical', machineId: transaction.machineId, machineCode: transaction.machine.machineCode, message: `Giao dịch nhả hàng lỗi tại cột ${transaction.column.columnNumber}${transaction.column.product ? ` (${transaction.column.product.name})` : ''}.`, createdAt: transaction.createdAt });
    }
    return alerts.sort((a, b) => (a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : 0));
}
operationsRouter.get('/alerts', ...staffAccess, async (_req, res) => {
    try {
        const alerts = await collectAlerts();
        res.status(200).json({ success: true, data: alerts, generatedAt: new Date().toISOString() });
    }
    catch (error) {
        console.error('List operational alerts error:', error);
        res.status(500).json({ success: false, message: 'Không thể tải cảnh báo vận hành lúc này' });
    }
});
operationsRouter.get('/summary', ...adminAccess, async (req, res) => {
    const range = reportRange(req);
    const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : undefined;
    if (!range) {
        res.status(400).json({ success: false, message: `Khoảng thời gian không hợp lệ; tối đa ${MAX_REPORT_DAYS} ngày` });
        return;
    }
    if (machineId && !UUID_PATTERN.test(machineId)) {
        res.status(400).json({ success: false, message: 'machineId không hợp lệ' });
        return;
    }
    try {
        const where = { createdAt: { gte: range.from, lte: range.to }, ...(machineId ? { machineId } : {}) };
        const deliveredWhere = { ...where, paymentStatus: 'SUCCESS', dispenseStatus: 'SUCCESS' };
        const [allTransactions, delivered, jammed, machines, columns, products, hourlyRows] = await Promise.all([
            db_1.prisma.transaction.count({ where }),
            db_1.prisma.transaction.aggregate({ where: deliveredWhere, _count: { _all: true }, _sum: { amount: true } }),
            db_1.prisma.transaction.count({ where: { ...where, dispenseStatus: 'JAMMED' } }),
            db_1.prisma.machine.findMany({ select: { id: true, status: true } }),
            db_1.prisma.column.findMany({ where: machineId ? { machineId } : {}, include: { batches: true } }),
            db_1.prisma.transaction.groupBy({ by: ['columnId'], where: deliveredWhere, _count: { _all: true }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 10 }),
            machineId
                ? db_1.prisma.$queryRaw `SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::bigint AS count FROM "Transaction" WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to} AND "machineId" = ${machineId}::uuid AND "paymentStatus" = 'SUCCESS' AND "dispenseStatus" = 'SUCCESS' GROUP BY hour ORDER BY hour`
                : db_1.prisma.$queryRaw `SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::bigint AS count FROM "Transaction" WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to} AND "paymentStatus" = 'SUCCESS' AND "dispenseStatus" = 'SUCCESS' GROUP BY hour ORDER BY hour`,
        ]);
        const topColumns = await db_1.prisma.column.findMany({ where: { id: { in: products.map((entry) => entry.columnId) } }, include: { product: true, machine: { select: { machineCode: true } } } });
        const columnById = new Map(topColumns.map((column) => [column.id, column]));
        const now = new Date();
        const stockStats = columns.reduce((stats, column) => {
            const inventory = (0, inventory_1.summarizeInventory)(column, now);
            return { lowStockColumns: stats.lowStockColumns + (inventory.lowStock ? 1 : 0), outOfStockColumns: stats.outOfStockColumns + (inventory.outOfStock ? 1 : 0), expiringColumns: stats.expiringColumns + (inventory.expiryWarning ? 1 : 0) };
        }, { lowStockColumns: 0, outOfStockColumns: 0, expiringColumns: 0 });
        res.status(200).json({ success: true, data: {
                range: { from: range.from, to: range.to },
                transactions: { total: allTransactions, delivered: delivered._count._all, jammed, revenue: Number(delivered._sum.amount ?? 0) },
                machines: { total: machines.length, online: machines.filter((item) => item.status === 'ONLINE').length, offline: machines.filter((item) => item.status === 'OFFLINE').length, fault: machines.filter((item) => item.status === 'FAULT').length },
                inventory: stockStats,
                topProducts: products.map((entry) => { const column = columnById.get(entry.columnId); return { name: column?.product?.name ?? 'Sản phẩm đã xóa', machineCode: column?.machine.machineCode ?? '', units: entry._count._all, revenue: Number(entry._sum.amount ?? 0) }; }),
                peakHours: hourlyRows.map((row) => ({ hour: row.hour, transactions: Number(row.count) })),
            } });
    }
    catch (error) {
        console.error('Load operations summary error:', error);
        res.status(500).json({ success: false, message: 'Không thể tạo tổng quan vận hành lúc này' });
    }
});
operationsRouter.get('/sales.csv', ...adminAccess, async (req, res) => {
    const range = reportRange(req);
    const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : undefined;
    if (!range || (machineId && !UUID_PATTERN.test(machineId))) {
        res.status(400).json({ success: false, message: 'Khoảng thời gian hoặc machineId không hợp lệ (tối đa 92 ngày)' });
        return;
    }
    try {
        const transactions = await db_1.prisma.transaction.findMany({
            where: { createdAt: { gte: range.from, lte: range.to }, ...(machineId ? { machineId } : {}) },
            orderBy: { createdAt: 'desc' }, take: 50000,
            include: { machine: { select: { machineCode: true, locationName: true } }, column: { include: { product: { select: { name: true } } } } },
        });
        const rows = [
            ['Mã giao dịch', 'Thời gian', 'Máy', 'Vị trí', 'Sản phẩm', 'Cột', 'Thanh toán', 'Nhả hàng', 'Số tiền'],
            ...transactions.map((transaction) => [transaction.transactionCode, transaction.createdAt, transaction.machine.machineCode, transaction.machine.locationName, transaction.column.product?.name ?? '', transaction.column.columnNumber, transaction.paymentStatus, transaction.dispenseStatus, Number(transaction.amount).toFixed(2)]),
        ];
        const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
        res.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="freshvend-sales-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv"`);
        res.send(csv);
    }
    catch (error) {
        console.error('Export sales CSV error:', error);
        res.status(500).json({ success: false, message: 'Không thể xuất báo cáo bán hàng lúc này' });
    }
});
exports.default = operationsRouter;
