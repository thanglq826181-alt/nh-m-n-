import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { MachineStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/db';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth';
import { summarizeInventory } from '../services/inventory';

const machinesRouter = Router();
const staffAccess = [requireAuth, requireRole(UserRole.ADMIN, UserRole.OPERATOR)];
const adminAccess = [requireAuth, requireRole(UserRole.ADMIN)];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validId(value: string | string[] | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function createDeviceKey(): { value: string; hash: string } {
  const value = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(value).digest('hex');
  return { value, hash };
}

function getColumnExpiry(batches: Array<{ quantity: number; expiryDate: Date | null }>): Date | null {
  return batches
    .filter((batch) => batch.quantity > 0 && batch.expiryDate !== null)
    .map((batch) => batch.expiryDate as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function parseOptionalDate(value: unknown): { date?: Date | null; error?: string } {
  if (value === null) return { date: null };
  if (typeof value !== 'string' || !value.trim()) return { error: 'expiryDate phải là ngày ISO 8601 hoặc null' };
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { error: 'expiryDate không hợp lệ; dùng ISO 8601' } : { date };
}

machinesRouter.post('/', ...adminAccess, async (req: Request, res: Response) => {
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
    const machine = await prisma.machine.create({
      data: { machineCode, locationName, tempMin, tempMax, deviceKeyHash: deviceKey.hash },
      select: { id: true, machineCode: true, locationName: true, status: true, tempMin: true, tempMax: true, lastPing: true },
    });
    res.status(201).json({ success: true, message: 'Tạo máy thành công', data: { ...machine, deviceKey: deviceKey.value } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'machineCode đã tồn tại' });
      return;
    }
    console.error('Create machine error:', error);
    res.status(500).json({ success: false, message: 'Không thể tạo máy lúc này' });
  }
});

machinesRouter.get('/', ...staffAccess, async (_req: Request, res: Response) => {
  try {
    const machines = await prisma.machine.findMany({
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
        columns: machine.columns.map((column) => summarizeInventory(column)),
      })),
    });
  } catch (error) {
    console.error('List machines error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy danh sách máy lúc này' });
  }
});

machinesRouter.post('/:machineId/device-key/rotate', ...adminAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  if (!validId(machineId)) {
    res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
    return;
  }
  try {
    const deviceKey = createDeviceKey();
    const machine = await prisma.machine.update({
      where: { id: machineId },
      data: { deviceKeyHash: deviceKey.hash },
      select: { id: true, machineCode: true },
    });
    res.status(200).json({ success: true, message: 'Đã tạo khóa thiết bị mới; hãy lưu lại vì khóa chỉ hiển thị lần này', data: { ...machine, deviceKey: deviceKey.value } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
      return;
    }
    console.error('Rotate device key error:', error);
    res.status(500).json({ success: false, message: 'Không thể đổi khóa thiết bị lúc này' });
  }
});

machinesRouter.get('/:machineId', ...staffAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  if (!validId(machineId)) {
    res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
    return;
  }
  try {
    const machine = await prisma.machine.findUnique({
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
      data: { ...machine, columns: machine.columns.map((column) => summarizeInventory(column)) },
    });
  } catch (error) {
    console.error('Get machine error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy thông tin máy lúc này' });
  }
});

machinesRouter.patch('/:machineId', ...adminAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  if (!validId(machineId)) {
    res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
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

  const data: Prisma.MachineUpdateInput = {};
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
    if (typeof body.status !== 'string' || !Object.values(MachineStatus).includes(body.status as MachineStatus)) {
      res.status(400).json({ success: false, message: 'status phải là ONLINE, OFFLINE hoặc FAULT' });
      return;
    }
    data.status = body.status as MachineStatus;
  }
  for (const field of ['tempMin', 'tempMax'] as const) {
    if (field in body) {
      const value = Number(body[field]);
      if (!Number.isFinite(value)) {
        res.status(400).json({ success: false, message: `${field} phải là số hợp lệ` });
        return;
      }
      data[field] = value;
    }
  }
  const existing = await prisma.machine.findUnique({ where: { id: machineId }, select: { tempMin: true, tempMax: true } });
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
    const machine = await prisma.machine.update({
      where: { id: machineId },
      data,
      select: { id: true, machineCode: true, locationName: true, status: true, tempMin: true, tempMax: true, lastPing: true },
    });
    res.status(200).json({ success: true, message: 'Cập nhật máy thành công', data: machine });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'machineCode đã tồn tại' });
      return;
    }
    console.error('Update machine error:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật máy lúc này' });
  }
});

machinesRouter.post('/:machineId/columns', ...adminAccess, async (req: Request, res: Response) => {
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
  let parsedExpiry: Date | null | undefined;
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
    const column = await prisma.$transaction(async (tx) => {
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
      return fullColumn!;
    });
    res.status(201).json({ success: true, message: 'Tạo cột hàng thành công', data: summarizeInventory(column) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'Số cột này đã tồn tại trên máy' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(404).json({ success: false, message: 'Không tìm thấy máy hoặc sản phẩm' });
      return;
    }
    console.error('Create machine column error:', error);
    res.status(500).json({ success: false, message: 'Không thể tạo cột hàng lúc này' });
  }
});

machinesRouter.patch('/:machineId/columns/:columnId', ...adminAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  const columnId = req.params.columnId;
  if (!validId(machineId) || !validId(columnId)) {
    res.status(400).json({ success: false, message: 'ID máy hoặc cột hàng không hợp lệ' });
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
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
    const existing = await prisma.column.findFirst({ where: { id: columnId, machineId } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng thuộc máy này' });
      return;
    }
    const data: Prisma.ColumnUpdateInput = {};
    if ('productId' in body) {
      if (body.productId !== null && (typeof body.productId !== 'string' || !validId(body.productId))) {
        res.status(400).json({ success: false, message: 'productId phải là UUID hợp lệ hoặc null' });
        return;
      }
      if (existing.currentStock > 0) {
        res.status(409).json({ success: false, message: 'Hãy làm hết hoặc kiểm kê tồn kho trước khi đổi sản phẩm của cột' });
        return;
      }
      data.product = body.productId === null ? { disconnect: true } : { connect: { id: body.productId as string } };
    }
    if ('maxCapacity' in body) {
      if (!Number.isInteger(body.maxCapacity) || Number(body.maxCapacity) < existing.currentStock || Number(body.maxCapacity) < 1) {
        res.status(400).json({ success: false, message: 'maxCapacity phải là số nguyên dương và không nhỏ hơn currentStock' });
        return;
      }
      data.maxCapacity = Number(body.maxCapacity);
    }
    const column = await prisma.column.update({
      where: { id: columnId },
      data,
      include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
    });
    res.status(200).json({ success: true, message: 'Cập nhật cột hàng thành công', data: summarizeInventory(column) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Không tìm thấy máy hoặc sản phẩm' });
      return;
    }
    console.error('Update machine column error:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật cột hàng lúc này' });
  }
});

machinesRouter.get('/:machineId/columns', ...staffAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  if (!validId(machineId)) {
    res.status(400).json({ success: false, message: 'ID máy không hợp lệ' });
    return;
  }

  try {
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      select: { id: true, machineCode: true, locationName: true },
    });
    if (!machine) {
      res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
      return;
    }

    const columns = await prisma.column.findMany({
      where: { machineId },
      orderBy: { columnNumber: 'asc' },
      include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
    });
    res.status(200).json({ success: true, machine, data: columns.map((column) => summarizeInventory(column)) });
  } catch (error) {
    console.error('List machine columns error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy danh sách cột hàng lúc này' });
  }
});

machinesRouter.get('/:machineId/temperature-logs', ...staffAccess, async (req: Request, res: Response) => {
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
    const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { id: true, machineCode: true } });
    if (!machine) {
      res.status(404).json({ success: false, message: 'Không tìm thấy máy' });
      return;
    }
    const logs = await prisma.temperatureLog.findMany({
      where: { machineId },
      orderBy: { loggedAt: 'desc' },
      take: limit,
    });
    res.status(200).json({
      success: true,
      machine,
      data: logs.map((log) => ({ ...log, id: log.id.toString() })),
    });
  } catch (error) {
    console.error('List temperature logs error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy lịch sử nhiệt độ lúc này' });
  }
});

machinesRouter.get('/:machineId/restock-events', ...staffAccess, async (req: Request, res: Response) => {
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
    const events = await prisma.restockEvent.findMany({
      where: { machineId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        column: { select: { id: true, columnNumber: true } },
        operator: { select: { id: true, username: true, fullName: true } },
      },
    });
    res.status(200).json({ success: true, data: events });
  } catch (error) {
    console.error('List restock events error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy lịch sử restock lúc này' });
  }
});

machinesRouter.put('/:machineId/columns/:columnId/inventory', ...staffAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  const columnId = req.params.columnId;
  if (!validId(machineId) || !validId(columnId)) {
    res.status(400).json({ success: false, message: 'ID máy hoặc cột hàng không hợp lệ' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
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

  let expiryDate: Date | null | undefined;
  if ('expiryDate' in body) {
    if (body.expiryDate === null) {
      expiryDate = null;
    } else if (typeof body.expiryDate === 'string' && body.expiryDate.trim()) {
      expiryDate = new Date(body.expiryDate);
      if (Number.isNaN(expiryDate.getTime())) {
        res.status(400).json({ success: false, message: 'expiryDate không hợp lệ; dùng định dạng ISO 8601' });
        return;
      }
    } else {
      res.status(400).json({ success: false, message: 'expiryDate phải là ngày ISO 8601 hoặc null' });
      return;
    }
  }

  try {
    const existingColumn = await prisma.column.findFirst({ where: { id: columnId, machineId } });
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

    const column = await prisma.$transaction(async (tx) => {
      const batches = await tx.inventoryBatch.findMany({ where: { columnId }, orderBy: { createdAt: 'asc' } });
      const newStock = Number(body.currentStock);
      if (newStock > existingColumn.maxCapacity) throw new Error('CAPACITY');
      // Absolute inventory updates are stocktakes: discard old lot accounting and record the counted stock as one new lot.
      await tx.inventoryBatch.deleteMany({ where: { columnId } });
      if (newStock > 0) {
        let batchExpiry = expiryDate;
        if (batchExpiry === undefined) batchExpiry = getColumnExpiry(batches);
        await tx.inventoryBatch.create({ data: { columnId, quantity: newStock, expiryDate: batchExpiry ?? null } });
      }
      return tx.column.update({
        where: { id: columnId },
        data: { currentStock: newStock, expiryDate: newStock > 0 ? (expiryDate === undefined ? getColumnExpiry(batches) : expiryDate) : null },
        include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
      });
    });
    res.status(200).json({ success: true, message: 'Đã kiểm kê và đồng bộ tồn kho', data: summarizeInventory(column) });
  } catch (error) {
    if (error instanceof Error && error.message === 'CAPACITY') {
      res.status(400).json({ success: false, message: 'currentStock vượt sức chứa tối đa' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng' });
      return;
    }
    console.error('Update inventory error:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật tồn kho lúc này' });
  }
});

machinesRouter.post('/:machineId/columns/:columnId/restock', ...staffAccess, async (req: Request, res: Response) => {
  const machineId = req.params.machineId;
  const columnId = req.params.columnId;
  if (!validId(machineId) || !validId(columnId)) {
    res.status(400).json({ success: false, message: 'ID máy hoặc cột hàng không hợp lệ' });
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
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

  let expiryDate: Date | undefined;
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

  const operatorId = (req as AuthenticatedRequest).auth.userId;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const column = await tx.column.findFirst({
        where: { id: columnId, machineId },
        include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
      });
      if (!column) return { kind: 'NOT_FOUND' as const };
      if (!column.product) return { kind: 'NO_PRODUCT' as const };
      const quantity = Number(body.quantity);
      const newStock = column.currentStock + quantity;
      if (newStock > column.maxCapacity) return { kind: 'CAPACITY' as const, maxCapacity: column.maxCapacity };

      const batchExpiry = expiryDate ?? new Date(Date.now() + column.product.shelfLifeHours * 60 * 60 * 1000);
      const newBatches = [...column.batches, { quantity, expiryDate: batchExpiry }];
      const nextColumnExpiry = getColumnExpiry(newBatches);

      const changed = await tx.column.updateMany({
        where: { id: columnId, machineId, currentStock: column.currentStock },
        data: { currentStock: newStock, expiryDate: nextColumnExpiry },
      });
      if (changed.count !== 1) return { kind: 'CONFLICT' as const };

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
      return { kind: 'OK' as const, event, batch, column: updatedColumn };
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
      data: { column: result.column ? summarizeInventory(result.column) : null, batch: result.batch, event: result.event },
    });
  } catch (error) {
    console.error('Restock column error:', error);
    res.status(500).json({ success: false, message: 'Không thể ghi nhận restock lúc này' });
  }
});

export default machinesRouter;
