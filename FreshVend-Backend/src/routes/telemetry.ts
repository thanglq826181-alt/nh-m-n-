import { Router, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';

const telemetryRouter = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

telemetryRouter.post('/temperature', async (req: Request, res: Response, next) => {
  const deviceKey = req.header('X-Device-Key');
  if (deviceKey) {
    const machineId = req.body?.machineId;
    if (typeof machineId !== 'string' || !UUID_PATTERN.test(machineId)) {
      res.status(400).json({ success: false, message: 'machineId phải là UUID hợp lệ' });
      return;
    }
    try {
      const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { deviceKeyHash: true } });
      const submittedHash = createHash('sha256').update(deviceKey).digest();
      const storedHash = machine?.deviceKeyHash;
      const valid = storedHash ? timingSafeEqual(submittedHash, Buffer.from(storedHash, 'hex')) : false;
      if (!valid) {
        res.status(401).json({ success: false, message: 'X-Device-Key không hợp lệ' });
        return;
      }
    } catch (error) {
      console.error('Authenticate IoT device error:', error);
      res.status(500).json({ success: false, message: 'Không thể xác thực thiết bị lúc này' });
      return;
    }
  } else {
    requireAuth(req, res, () => requireRole(UserRole.ADMIN, UserRole.OPERATOR)(req, res, next));
    return;
  }

  const { machineId, temperature, humidity, doorOpen } = req.body ?? {};
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

  try {
    const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } });
    if (!machine) {
      res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
      return;
    }

    const loggedAt = new Date();
    const [log] = await prisma.$transaction([
      prisma.temperatureLog.create({
        data: { machineId, temperature, humidity: humidity ?? null, doorOpen: doorOpen ?? false, loggedAt },
      }),
      prisma.machine.update({ where: { id: machineId }, data: { lastPing: loggedAt } }),
    ]);
    res.status(201).json({
      success: true,
      message: 'Đã ghi nhận dữ liệu nhiệt độ',
      data: { ...log, id: log.id.toString() },
    });
  } catch (error) {
    console.error('Record telemetry error:', error);
    res.status(500).json({ success: false, message: 'Không thể ghi nhận dữ liệu cảm biến lúc này' });
  }
});

export default telemetryRouter;
