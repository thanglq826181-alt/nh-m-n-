"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const realtime_1 = require("../services/realtime");
const telemetryRouter = (0, express_1.Router)();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireDeviceOrStaff(req, res, next) {
    if (req.header('X-Device-Key')) {
        next();
        return;
    }
    (0, auth_1.requireAuth)(req, res, () => (0, auth_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR)(req, res, next));
}
telemetryRouter.post('/temperature', requireDeviceOrStaff, async (req, res) => {
    const deviceKey = req.header('X-Device-Key');
    if (deviceKey) {
        const machineId = req.body?.machineId;
        if (typeof machineId !== 'string' || !UUID_PATTERN.test(machineId)) {
            res.status(400).json({ success: false, message: 'machineId phải là UUID hợp lệ' });
            return;
        }
        try {
            const machine = await db_1.prisma.machine.findUnique({ where: { id: machineId }, select: { deviceKeyHash: true } });
            const submittedHash = (0, crypto_1.createHash)('sha256').update(deviceKey).digest();
            const storedHash = machine?.deviceKeyHash;
            const valid = storedHash ? (0, crypto_1.timingSafeEqual)(submittedHash, Buffer.from(storedHash, 'hex')) : false;
            if (!valid) {
                res.status(401).json({ success: false, message: 'X-Device-Key không hợp lệ' });
                return;
            }
        }
        catch (error) {
            console.error('Authenticate IoT device error:', error);
            res.status(500).json({ success: false, message: 'Không thể xác thực thiết bị lúc này' });
            return;
        }
    }
    const { machineId, temperature, humidity, doorOpen, sensorOk } = req.body ?? {};
    if (typeof machineId !== 'string' || !UUID_PATTERN.test(machineId)) {
        res.status(400).json({ success: false, message: 'machineId phải là UUID hợp lệ' });
        return;
    }
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < -50 || temperature > 100) {
        res.status(400).json({ success: false, message: 'temperature phải là số từ -50 đến 100 °C' });
        return;
    }
    if (humidity !== undefined && humidity !== null && (typeof humidity !== 'number' || !Number.isFinite(humidity) || humidity < 0 || humidity > 100)) {
        res.status(400).json({ success: false, message: 'humidity phải nằm trong khoảng 0 đến 100%' });
        return;
    }
    if (doorOpen !== undefined && typeof doorOpen !== 'boolean') {
        res.status(400).json({ success: false, message: 'doorOpen phải là boolean' });
        return;
    }
    if (sensorOk !== undefined && typeof sensorOk !== 'boolean') {
        res.status(400).json({ success: false, message: 'sensorOk pháº£i lĂ  boolean' });
        return;
    }
    try {
        const machine = await db_1.prisma.machine.findUnique({ where: { id: machineId }, select: { id: true, status: true, tempMin: true, tempMax: true } });
        if (!machine) {
            res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
            return;
        }
        const loggedAt = new Date();
        const unsafeReading = sensorOk === false || doorOpen === true || temperature < machine.tempMin || temperature > machine.tempMax;
        const machineStatus = unsafeReading || machine.status === 'FAULT' ? 'FAULT' : 'ONLINE';
        const [log] = await db_1.prisma.$transaction([
            db_1.prisma.temperatureLog.create({
                data: { machineId, temperature, humidity: humidity ?? null, doorOpen: doorOpen ?? false, sensorOk: sensorOk ?? true, loggedAt },
            }),
            db_1.prisma.machine.update({ where: { id: machineId }, data: { lastPing: loggedAt, status: machineStatus } }),
        ]);
        (0, realtime_1.publishRealtime)('telemetry', {
            machineId,
            temperature,
            humidity: humidity ?? null,
            doorOpen: doorOpen ?? false,
            sensorOk: sensorOk ?? true,
            machineStatus,
            loggedAt: loggedAt.toISOString(),
        });
        res.status(201).json({
            success: true,
            message: 'Đã ghi nhận dữ liệu nhiệt độ',
            data: { ...log, id: log.id.toString(), machineStatus },
        });
    }
    catch (error) {
        console.error('Record telemetry error:', error);
        res.status(500).json({ success: false, message: 'Không thể ghi nhận dữ liệu cảm biến lúc này' });
    }
});
exports.default = telemetryRouter;
