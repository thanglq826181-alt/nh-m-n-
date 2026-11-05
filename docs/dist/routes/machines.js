"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const inventory_1 = require("../services/inventory");
const realtime_1 = require("../services/realtime");
const machinesRouter = (0, express_1.Router)();
const staffAccess = [auth_1.requireAuth, (0, auth_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR)];
const adminAccess = [auth_1.requireAuth, (0, auth_1.requireRole)(client_1.UserRole.ADMIN)];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}
function createDeviceKey() {
    const value = (0, crypto_1.randomBytes)(32).toString('hex');
    const hash = (0, crypto_1.createHash)('sha256').update(value).digest('hex');
    return { value, hash };
}
function getColumnExpiry(batches) {
    return batches
        .filter((batch) => batch.quantity > 0 && batch.expiryDate !== null)
        .map((batch) => batch.expiryDate)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}
function parseOptionalDate(value) {
    if (value === null)
        return { date: null };
    if (typeof value !== 'string' || !value.trim())
        return { error: 'expiryDate phải là ngày ISO 8601 hoặc null' };
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? { error: 'expiryDate không hợp lệ; dùng ISO 8601' } : { date };
}
machinesRouter.post('/', ...adminAccess, async (req, res) => {
    const machineCode = typeof req.body?.machineCode === 'string' ? req.body.machineCode.trim() : '';
    const locationName = typeof req.body?.locationName === 'string' ? req.body.locationName.trim() : '';
    const tempMin = req.body?.tempMin === undefined ? 2 : Number(req.body.tempMin);
    const tempMax = req.body?.tempMax === undefined ? 8 : Number(req.body.tempMax);
    if (!machineCode || machineCode.length > 50 || !locationName || locationName.length > 255) {
        res.status(400).json({ success: false, message: 'machineCode (tối đa 50 ký tự) và locationName (tối đa 255 ký tự) là bắt buộc' });
        return;
    }
    if (!Number.isFinite(tempMin) || !Number.isFinite(tempMax) || tempMin >= tempMax) {
        res.status(400).json({ success: false, message: 'Ngưỡng nhiệt độ phải là số hợp lệ và tempMin nhỏ hơn tempMax' });
        return;
    }
    try {
        const deviceKey = createDeviceKey();
        const machine = await db_1.prisma.machine.create({
            data: { machineCode, locationName, tempMin, tempMax, deviceKeyHash: deviceKey.hash },
            select: { id: true, machineCode: true, locationName: true, status: true, tempMin: true, tempMax: true, lastPing: true },
        });
        res.status(201).json({ success: true, message: 'Tạo máy thành công', data: { ...machine, deviceKey: deviceKey.value } });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            res.status(409).json({ success: false, message: 'machineCode đã tồn tại' });
            return;
        }
        console.error('Create machine error:', error);
        res.status(500).json({ success: false, message: 'Không thể tạo máy lúc này' });
    }
});
machinesRouter.get('/', ...staffAccess, async (_req, res) => {
    try {
        const machines = await db_1.prisma.machine.findMany({
            orderBy: { machineCode: 'asc' },
            select: {
                id: true, machineCode: true, locationName: true, status: true, tempMin: true, tempMax: true, lastPing: true,
                columns: {
                    orderBy: { columnNumber: 'asc' },
                    include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
                },
            },
        });
        res.status(200).json({
            success: true,
            data: machines.map((machine) => ({
                ...machine,
                columns: machine.columns.map((column) => (0, inventory_1.summarizeInventory)(column)),
            })),
        });
    }
    catch (error) {
        console.error('List machines error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy danh sách máy lúc này' });
    }
});
machinesRouter.post('/:machineId/device-key/rotate', ...adminAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    try {
        const deviceKey = createDeviceKey();
        const machine = await db_1.prisma.machine.update({
            where: { id: machineId },
            data: { deviceKeyHash: deviceKey.hash },
            select: { id: true, machineCode: true },
        });
        res.status(200).json({ success: true, message: 'Đã tạo khóa thiết bị mới; hãy lưu lại vì khóa chỉ hiển thị lần này', data: { ...machine, deviceKey: deviceKey.value } });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
            return;
        }
        console.error('Rotate device key error:', error);
        res.status(500).json({ success: false, message: 'Không thể đổi khóa thiết bị lúc này' });
    }
});
machinesRouter.get('/:machineId', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    try {
        const machine = await db_1.prisma.machine.findUnique({
            where: { id: machineId },
            select: {
                id: true, machineCode: true, locationName: true, status: true,
                tempMin: true, tempMax: true, lastPing: true,
                columns: { orderBy: { columnNumber: 'asc' }, include: { product: true, batches: { orderBy: { createdAt: 'asc' } } } },
                transactions: false, tempLogs: false, restockEvents: false,
            },
        });
        if (!machine) {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
            return;
        }
        res.status(200).json({
            success: true,
            data: { ...machine, columns: machine.columns.map((column) => (0, inventory_1.summarizeInventory)(column)) },
        });
    }
    catch (error) {
        console.error('Get machine error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy thông tin máy lúc này' });
    }
});
machinesRouter.patch('/:machineId', ...adminAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
        res.status(400).json({ success: false, message: 'Request body phải có ít nhất một trường cần cập nhật' });
        return;
    }
    const allowedFields = new Set(['machineCode', 'locationName', 'status', 'tempMin', 'tempMax']);
    const unknownFields = Object.keys(body).filter((key) => !allowedFields.has(key));
    if (unknownFields.length) {
        res.status(400).json({ success: false, message: `Trường không được hỗ trợ: ${unknownFields.join(', ')}` });
        return;
    }
    const data = {};
    if ('machineCode' in body) {
        if (typeof body.machineCode !== 'string' || !body.machineCode.trim() || body.machineCode.trim().length > 50) {
            res.status(400).json({ success: false, message: 'machineCode phải có từ 1 đến 50 ký tự' });
            return;
        }
        data.machineCode = body.machineCode.trim();
    }
    if ('locationName' in body) {
        if (typeof body.locationName !== 'string' || !body.locationName.trim() || body.locationName.trim().length > 255) {
            res.status(400).json({ success: false, message: 'locationName phải có từ 1 đến 255 ký tự' });
            return;
        }
        data.locationName = body.locationName.trim();
    }
    if ('status' in body) {
        if (typeof body.status !== 'string' || !Object.values(client_1.MachineStatus).includes(body.status)) {
            res.status(400).json({ success: false, message: 'status phải là ONLINE, OFFLINE hoặc FAULT' });
            return;
        }
        data.status = body.status;
    }
    for (const field of ['tempMin', 'tempMax']) {
        if (field in body) {
            const value = Number(body[field]);
            if (!Number.isFinite(value)) {
                res.status(400).json({ success: false, message: `${field} phải là số hợp lệ` });
                return;
            }
            data[field] = value;
        }
    }
    const existing = await db_1.prisma.machine.findUnique({ where: { id: machineId }, select: { tempMin: true, tempMax: true } });
    if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
        return;
    }
    const nextMin = data.tempMin ?? existing.tempMin;
    const nextMax = data.tempMax ?? existing.tempMax;
    if (nextMin >= nextMax) {
        res.status(400).json({ success: false, message: 'tempMin phải nhỏ hơn tempMax' });
        return;
    }
    try {
        const machine = await db_1.prisma.machine.update({
            where: { id: machineId },
            data,
            select: { id: true, machineCode: true, locationName: true, status: true, tempMin: true, tempMax: true, lastPing: true },
        });
        res.status(200).json({ success: true, message: 'Cập nhật máy thành công', data: machine });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            res.status(409).json({ success: false, message: 'machineCode đã tồn tại' });
            return;
        }
        console.error('Update machine error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật máy lúc này' });
    }
});
machinesRouter.post('/:machineId/columns', ...adminAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    const { columnNumber, productId, currentStock, maxCapacity, expiryDate } = req.body ?? {};
    const parsedStock = currentStock === undefined ? 0 : currentStock;
    const parsedCapacity = maxCapacity === undefined ? 10 : maxCapacity;
    if (!Number.isInteger(columnNumber) || columnNumber < 1) {
        res.status(400).json({ success: false, message: 'columnNumber phải là số nguyên dương' });
        return;
    }
    if (!Number.isInteger(parsedStock) || !Number.isInteger(parsedCapacity) || parsedStock < 0 || parsedCapacity < 1 || parsedStock > parsedCapacity) {
        res.status(400).json({ success: false, message: 'currentStock/maxCapacity không hợp lệ hoặc stock vượt sức chứa' });
        return;
    }
    if (productId !== undefined && productId !== null && (typeof productId !== 'string' || !validId(productId))) {
        res.status(400).json({ success: false, message: 'productId phải là UUID hợp lệ hoặc null' });
        return;
    }
    let parsedExpiry;
    if (expiryDate !== undefined) {
        const result = parseOptionalDate(expiryDate);
        if (result.error) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        parsedExpiry = result.date;
    }
    if (parsedStock > 0 && parsedExpiry && parsedExpiry <= new Date()) {
        res.status(400).json({ success: false, message: 'expiryDate phải nằm trong tương lai' });
        return;
    }
    try {
        const column = await db_1.prisma.$transaction(async (tx) => {
            const product = productId ? await tx.product.findUnique({ where: { id: productId }, select: { shelfLifeHours: true } }) : null;
            const batchExpiry = parsedExpiry ?? (product ? new Date(Date.now() + product.shelfLifeHours * 60 * 60 * 1000) : null);
            const created = await tx.column.create({
                data: {
                    machineId,
                    columnNumber,
                    currentStock: 0,
                    maxCapacity: parsedCapacity,
                    ...(productId !== undefined ? { productId } : {}),
                },
            });
            if (parsedStock > 0) {
                await tx.inventoryBatch.create({ data: { columnId: created.id, quantity: parsedStock, expiryDate: batchExpiry } });
                await tx.column.update({ where: { id: created.id }, data: { currentStock: parsedStock, expiryDate: batchExpiry } });
            }
            const fullColumn = await tx.column.findUnique({
                where: { id: created.id },
                include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
            });
            return fullColumn;
        });
        res.status(201).json({ success: true, message: 'Tạo cột hàng thành công', data: (0, inventory_1.summarizeInventory)(column) });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            res.status(409).json({ success: false, message: 'Số cột này đã tồn tại trên máy' });
            return;
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy hoặc sản phẩm' });
            return;
        }
        console.error('Create machine column error:', error);
        res.status(500).json({ success: false, message: 'Không thể tạo cột hàng lúc này' });
    }
});
machinesRouter.patch('/:machineId/columns/:columnId', ...adminAccess, async (req, res) => {
    const machineId = req.params.machineId;
    const columnId = req.params.columnId;
    if (!validId(machineId) || !validId(columnId)) {
        res.status(400).json({ success: false, message: 'ID máy hoặc cột hàng không hợp lệ' });
        return;
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
        res.status(400).json({ success: false, message: 'Request body phải có ít nhất một trường cần cập nhật' });
        return;
    }
    const allowed = new Set(['productId', 'maxCapacity']);
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length) {
        res.status(400).json({ success: false, message: `Trường không được hỗ trợ: ${unknown.join(', ')}` });
        return;
    }
    try {
        const existing = await db_1.prisma.column.findFirst({ where: { id: columnId, machineId } });
        if (!existing) {
            res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng thuộc máy này' });
            return;
        }
        const data = {};
        if ('productId' in body) {
            if (body.productId !== null && (typeof body.productId !== 'string' || !validId(body.productId))) {
                res.status(400).json({ success: false, message: 'productId phải là UUID hợp lệ hoặc null' });
                return;
            }
            if (existing.currentStock > 0) {
                res.status(409).json({ success: false, message: 'Hãy làm hết hoặc kiểm kê tồn kho trước khi đổi sản phẩm của cột' });
                return;
            }
            data.product = body.productId === null ? { disconnect: true } : { connect: { id: body.productId } };
        }
        if ('maxCapacity' in body) {
            if (!Number.isInteger(body.maxCapacity) || Number(body.maxCapacity) < existing.currentStock || Number(body.maxCapacity) < 1) {
                res.status(400).json({ success: false, message: 'maxCapacity phải là số nguyên dương và không nhỏ hơn currentStock' });
                return;
            }
            data.maxCapacity = Number(body.maxCapacity);
        }
        const column = await db_1.prisma.column.update({
            where: { id: columnId },
            data,
            include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
        });
        res.status(200).json({ success: true, message: 'Cập nhật cột hàng thành công', data: (0, inventory_1.summarizeInventory)(column) });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy hoặc sản phẩm' });
            return;
        }
        console.error('Update machine column error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật cột hàng lúc này' });
    }
});
machinesRouter.get('/:machineId/columns', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    try {
        const machine = await db_1.prisma.machine.findUnique({
            where: { id: machineId },
            select: { id: true, machineCode: true, locationName: true },
        });
        if (!machine) {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
            return;
        }
        const columns = await db_1.prisma.column.findMany({
            where: { machineId },
            orderBy: { columnNumber: 'asc' },
            include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
        });
        res.status(200).json({ success: true, machine, data: columns.map((column) => (0, inventory_1.summarizeInventory)(column)) });
    }
    catch (error) {
        console.error('List machine columns error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy danh sách cột hàng lúc này' });
    }
});
machinesRouter.post('/:machineId/clear-fault', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    const operatorId = req.auth.userId;
    try {
        const result = await db_1.prisma.$transaction(async (tx) => {
            const machine = await tx.machine.findUnique({
                where: { id: machineId },
                include: { tempLogs: { orderBy: { loggedAt: 'desc' }, take: 1 } },
            });
            if (!machine)
                return { kind: 'NOT_FOUND' };
            if (machine.status !== client_1.MachineStatus.FAULT)
                return { kind: 'NOT_FAULT' };
            const latest = machine.tempLogs[0];
            const isFresh = latest && Date.now() - latest.loggedAt.getTime() <= 120000;
            if (!isFresh || !latest.sensorOk || latest.doorOpen || latest.temperature < machine.tempMin || latest.temperature > machine.tempMax) {
                return { kind: 'UNSAFE' };
            }
            const changed = await tx.machine.updateMany({
                where: { id: machineId, status: client_1.MachineStatus.FAULT, lastPing: machine.lastPing },
                data: { status: client_1.MachineStatus.ONLINE },
            });
            if (changed.count !== 1)
                return { kind: 'CONFLICT' };
            const action = await tx.machineAction.create({
                data: { machineId, operatorId, action: 'CLEAR_FAULT', details: `Cleared after safe telemetry ${latest.temperature} °C; door closed; sensor healthy.` },
            });
            return { kind: 'OK', action };
        });
        if (result.kind === 'NOT_FOUND') {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
            return;
        }
        if (result.kind === 'NOT_FAULT') {
            res.status(409).json({ success: false, message: 'Máy không ở trạng thái FAULT' });
            return;
        }
        if (result.kind === 'UNSAFE') {
            res.status(409).json({ success: false, message: 'Cần telemetry an toàn mới trong 2 phút: cảm biến tốt, cửa đóng và nhiệt độ trong ngưỡng trước khi xóa lỗi' });
            return;
        }
        if (result.kind === 'CONFLICT') {
            res.status(409).json({ success: false, message: 'Trạng thái máy vừa thay đổi; hãy tải lại rồi thử lại' });
            return;
        }
        res.status(200).json({ success: true, message: 'Đã xóa lỗi máy và ghi nhật ký thao tác', data: result.action });
        (0, realtime_1.publishRealtime)('machine', { machineId, status: 'ONLINE', action: 'CLEAR_FAULT' });
    }
    catch (error) {
        console.error('Clear machine fault error:', error);
        res.status(500).json({ success: false, message: 'Không thể xóa lỗi máy lúc này' });
    }
});
machinesRouter.get('/:machineId/actions', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    const limit = Number(req.query.limit ?? 50);
    if (!validId(machineId) || !Number.isInteger(limit) || limit < 1 || limit > 200) {
        res.status(400).json({ success: false, message: 'ID máy hoặc limit không hợp lệ (1–200)' });
        return;
    }
    try {
        const actions = await db_1.prisma.machineAction.findMany({
            where: { machineId }, orderBy: { createdAt: 'desc' }, take: limit,
            include: { operator: { select: { username: true, fullName: true } } },
        });
        res.status(200).json({ success: true, data: actions });
    }
    catch (error) {
        console.error('List machine actions error:', error);
        res.status(500).json({ success: false, message: 'Không thể tải nhật ký thao tác máy lúc này' });
    }
});
machinesRouter.get('/:machineId/temperature-logs', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    const limit = Number(req.query.limit ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        res.status(400).json({ success: false, message: 'limit phải là số nguyên từ 1 đến 500' });
        return;
    }
    try {
        const machine = await db_1.prisma.machine.findUnique({ where: { id: machineId }, select: { id: true, machineCode: true } });
        if (!machine) {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
            return;
        }
        const logs = await db_1.prisma.temperatureLog.findMany({
            where: { machineId },
            orderBy: { loggedAt: 'desc' },
            take: limit,
        });
        res.status(200).json({
            success: true,
            machine,
            data: logs.map((log) => ({ ...log, id: log.id.toString() })),
        });
    }
    catch (error) {
        console.error('List temperature logs error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy lịch sử nhiệt độ lúc này' });
    }
});
machinesRouter.get('/:machineId/restock-events', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    const limit = Number(req.query.limit ?? 100);
    if (!validId(machineId)) {
        res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
        return;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        res.status(400).json({ success: false, message: 'limit phải là số nguyên từ 1 đến 500' });
        return;
    }
    try {
        const events = await db_1.prisma.restockEvent.findMany({
            where: { machineId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                column: { select: { id: true, columnNumber: true } },
                operator: { select: { id: true, username: true, fullName: true } },
            },
        });
        res.status(200).json({ success: true, data: events });
    }
    catch (error) {
        console.error('List restock events error:', error);
        res.status(500).json({ success: false, message: 'Không thể lấy lịch sử restock lúc này' });
    }
});
machinesRouter.put('/:machineId/columns/:columnId/inventory', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    const columnId = req.params.columnId;
    if (!validId(machineId) || !validId(columnId)) {
        res.status(400).json({ success: false, message: 'ID máy hoặc cột hàng không hợp lệ' });
        return;
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ success: false, message: 'Request body phải là JSON object' });
        return;
    }
    const unknownFields = Object.keys(body).filter((key) => !['currentStock', 'expiryDate'].includes(key));
    if (unknownFields.length) {
        res.status(400).json({ success: false, message: `Trường không được hỗ trợ: ${unknownFields.join(', ')}` });
        return;
    }
    if (!Number.isInteger(body.currentStock) || Number(body.currentStock) < 0) {
        res.status(400).json({ success: false, message: 'currentStock phải là số nguyên không âm' });
        return;
    }
    let expiryDate;
    if ('expiryDate' in body) {
        if (body.expiryDate === null) {
            expiryDate = null;
        }
        else if (typeof body.expiryDate === 'string' && body.expiryDate.trim()) {
            expiryDate = new Date(body.expiryDate);
            if (Number.isNaN(expiryDate.getTime())) {
                res.status(400).json({ success: false, message: 'expiryDate không hợp lệ; dùng định dạng ISO 8601' });
                return;
            }
        }
        else {
            res.status(400).json({ success: false, message: 'expiryDate phải là ngày ISO 8601 hoặc null' });
            return;
        }
    }
    try {
        const existingColumn = await db_1.prisma.column.findFirst({ where: { id: columnId, machineId } });
        if (!existingColumn) {
            res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng thuộc máy này' });
            return;
        }
        if (Number(body.currentStock) > existingColumn.maxCapacity) {
            res.status(400).json({
                success: false,
                message: `currentStock không được vượt quá sức chứa tối đa (${existingColumn.maxCapacity})`,
            });
            return;
        }
        const column = await db_1.prisma.$transaction(async (tx) => {
            const batches = await tx.inventoryBatch.findMany({ where: { columnId }, orderBy: { createdAt: 'asc' } });
            const newStock = Number(body.currentStock);
            if (newStock > existingColumn.maxCapacity)
                throw new Error('CAPACITY');
            // Absolute inventory updates are stocktakes: discard old lot accounting and record the counted stock as one new lot.
            await tx.inventoryBatch.deleteMany({ where: { columnId } });
            if (newStock > 0) {
                let batchExpiry = expiryDate;
                if (batchExpiry === undefined)
                    batchExpiry = getColumnExpiry(batches);
                await tx.inventoryBatch.create({ data: { columnId, quantity: newStock, expiryDate: batchExpiry ?? null } });
            }
            return tx.column.update({
                where: { id: columnId },
                data: { currentStock: newStock, expiryDate: newStock > 0 ? (expiryDate === undefined ? getColumnExpiry(batches) : expiryDate) : null },
                include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
            });
        });
        res.status(200).json({ success: true, message: 'Đã kiểm kê và đồng bộ tồn kho', data: (0, inventory_1.summarizeInventory)(column) });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'CAPACITY') {
            res.status(400).json({ success: false, message: 'currentStock vượt sức chứa tối đa' });
            return;
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng' });
            return;
        }
        console.error('Update inventory error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật tồn kho lúc này' });
    }
});
machinesRouter.post('/:machineId/columns/:columnId/restock', ...staffAccess, async (req, res) => {
    const machineId = req.params.machineId;
    const columnId = req.params.columnId;
    if (!validId(machineId) || !validId(columnId)) {
        res.status(400).json({ success: false, message: 'ID máy hoặc cột hàng không hợp lệ' });
        return;
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ success: false, message: 'Request body phải là JSON object' });
        return;
    }
    const unknownFields = Object.keys(body).filter((key) => !['quantity', 'expiryDate'].includes(key));
    if (unknownFields.length) {
        res.status(400).json({ success: false, message: `Trường không được hỗ trợ: ${unknownFields.join(', ')}` });
        return;
    }
    if (!Number.isInteger(body.quantity) || Number(body.quantity) < 1) {
        res.status(400).json({ success: false, message: 'quantity phải là số nguyên dương' });
        return;
    }
    let expiryDate;
    if (body.expiryDate !== undefined) {
        const parsed = parseOptionalDate(body.expiryDate);
        if (parsed.error || !parsed.date) {
            res.status(400).json({ success: false, message: parsed.error ?? 'expiryDate không hợp lệ' });
            return;
        }
        if (parsed.date <= new Date()) {
            res.status(400).json({ success: false, message: 'expiryDate phải nằm trong tương lai' });
            return;
        }
        expiryDate = parsed.date;
    }
    const operatorId = req.auth.userId;
    try {
        const result = await db_1.prisma.$transaction(async (tx) => {
            const column = await tx.column.findFirst({
                where: { id: columnId, machineId },
                include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
            });
            if (!column)
                return { kind: 'NOT_FOUND' };
            if (!column.product)
                return { kind: 'NO_PRODUCT' };
            const quantity = Number(body.quantity);
            const newStock = column.currentStock + quantity;
            if (newStock > column.maxCapacity)
                return { kind: 'CAPACITY', maxCapacity: column.maxCapacity };
            const batchExpiry = expiryDate ?? new Date(Date.now() + column.product.shelfLifeHours * 60 * 60 * 1000);
            const newBatches = [...column.batches, { quantity, expiryDate: batchExpiry }];
            const nextColumnExpiry = getColumnExpiry(newBatches);
            const changed = await tx.column.updateMany({
                where: { id: columnId, machineId, currentStock: column.currentStock },
                data: { currentStock: newStock, expiryDate: nextColumnExpiry },
            });
            if (changed.count !== 1)
                return { kind: 'CONFLICT' };
            const batch = await tx.inventoryBatch.create({
                data: { columnId, quantity, expiryDate: batchExpiry },
            });
            const event = await tx.restockEvent.create({
                data: {
                    machineId,
                    columnId,
                    operatorId,
                    quantity,
                    previousStock: column.currentStock,
                    newStock,
                    expiryDate: batchExpiry,
                },
            });
            const updatedColumn = await tx.column.findUnique({
                where: { id: columnId },
                include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
            });
            return { kind: 'OK', event, batch, column: updatedColumn };
        });
        if (result.kind === 'NOT_FOUND') {
            res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng thuộc máy này' });
            return;
        }
        if (result.kind === 'CAPACITY') {
            res.status(409).json({ success: false, message: `Vượt sức chứa tối đa (${result.maxCapacity})` });
            return;
        }
        if (result.kind === 'NO_PRODUCT') {
            res.status(409).json({ success: false, message: 'Gán sản phẩm vào cột trước khi restock' });
            return;
        }
        if (result.kind === 'CONFLICT') {
            res.status(409).json({ success: false, message: 'Tồn kho vừa được thay đổi; hãy tải lại và thử lại' });
            return;
        }
        res.status(201).json({
            success: true,
            message: 'Đã cộng hàng vào tồn kho và ghi nhận lô FIFO',
            data: { column: result.column ? (0, inventory_1.summarizeInventory)(result.column) : null, batch: result.batch, event: result.event },
        });
        (0, realtime_1.publishRealtime)('inventory', { machineId, columnId, action: 'RESTOCK', createdAt: new Date().toISOString() });
    }
    catch (error) {
        console.error('Restock column error:', error);
        res.status(500).json({ success: false, message: 'Không thể ghi nhận restock lúc này' });
    }
});
exports.default = machinesRouter;
