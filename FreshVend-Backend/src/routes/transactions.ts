import { randomBytes } from 'crypto';
import { Router, Request, Response } from 'express';
import { DispenseStatus, MachineStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/db';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth';

const transactionsRouter = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const staffRoles: UserRole[] = [UserRole.ADMIN, UserRole.OPERATOR];

function isStaff(req: Request): boolean {
  const role = (req as AuthenticatedRequest).auth.role;
  return staffRoles.includes(role);
}

function canAccess(customerId: string | null, req: Request): boolean {
  const auth = (req as AuthenticatedRequest).auth;
  return isStaff(req) || customerId === auth.userId;
}

function simulationOnly(_req: Request, res: Response, next: () => void): void {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, message: 'Không tìm thấy endpoint' });
    return;
  }
  next();
}

transactionsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const machineId = req.body?.machineId;
  const columnId = req.body?.columnId;
  if (typeof machineId !== 'string' || !UUID_PATTERN.test(machineId) || typeof columnId !== 'string' || !UUID_PATTERN.test(columnId)) {
    res.status(400).json({ success: false, message: 'machineId và columnId phải là UUID hợp lệ' });
    return;
  }

  try {
    const column = await prisma.column.findFirst({
      where: { id: columnId, machineId },
      include: { machine: true, product: true, batches: { where: { quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] }, orderBy: { createdAt: 'asc' } } },
    });
    if (!column) {
      res.status(404).json({ success: false, message: 'Không tìm thấy cột hàng thuộc máy này' });
      return;
    }
    if (column.machine.status !== MachineStatus.ONLINE) {
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

    const auth = (req as AuthenticatedRequest).auth;
    const transaction = await prisma.transaction.create({
      data: {
        transactionCode: `FV-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`,
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
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ success: false, message: 'Không thể tạo giao dịch lúc này' });
  }
});

transactionsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    const transactions = await prisma.transaction.findMany({
      where: isStaff(req) ? {} : { customerId: auth.userId },
      orderBy: { createdAt: 'desc' },
      include: { machine: true, column: { include: { product: true } } },
    });
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    console.error('List transactions error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy danh sách giao dịch lúc này' });
  }
});

transactionsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    res.status(400).json({ success: false, message: 'ID giao dịch không hợp lệ' });
    return;
  }

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { machine: true, column: { include: { product: true } } },
    });
    if (!transaction || !canAccess(transaction.customerId, req)) {
      res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
      return;
    }
    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy giao dịch lúc này' });
  }
});

transactionsRouter.post('/:id/simulate-payment', requireAuth, simulationOnly, async (req: Request, res: Response) => {
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
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing || !canAccess(existing.customerId, req)) {
      res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
      return;
    }
    if (existing.paymentStatus !== PaymentStatus.PENDING) {
      res.status(409).json({ success: false, message: 'Giao dịch không còn chờ thanh toán' });
      return;
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: { paymentStatus: outcome === 'SUCCESS' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED },
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
  } catch (error) {
    console.error('Simulate payment error:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật thanh toán lúc này' });
  }
});

transactionsRouter.post('/:id/simulate-dispense', requireAuth, simulationOnly, async (req: Request, res: Response) => {
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
    const transaction = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { id } });
      if (!existing || !canAccess(existing.customerId, req)) {
        return { error: 'NOT_FOUND' as const };
      }
      if (existing.paymentStatus !== PaymentStatus.SUCCESS || existing.dispenseStatus !== DispenseStatus.PENDING) {
        return { error: 'INVALID_STATE' as const };
      }

      if (outcome === 'SUCCESS') {
        const now = new Date();
        const batch = await tx.inventoryBatch.findFirst({
          where: { columnId: existing.columnId, quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] },
          orderBy: { createdAt: 'asc' },
        });
        const stockUpdate = batch ? await tx.column.updateMany({
          where: {
            id: existing.columnId,
            machineId: existing.machineId,
            currentStock: { gt: 0 },
          },
          data: { currentStock: { decrement: 1 } },
        }) : { count: 0 };
        if (stockUpdate.count === 0 || !batch) {
          const jammed = await tx.transaction.update({
            where: { id },
            data: { dispenseStatus: DispenseStatus.JAMMED },
            include: { machine: true, column: { include: { product: true } } },
          });
          return { value: jammed, error: 'OUT_OF_STOCK' as const };
        }
        await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: { decrement: 1 } } });
        const remainingBatches = await tx.inventoryBatch.findMany({ where: { columnId: existing.columnId, quantity: { gt: 0 } }, select: { expiryDate: true, quantity: true }, orderBy: { createdAt: 'asc' } });
        const nextExpiry = remainingBatches.filter((lot) => lot.expiryDate).sort((a, b) => (a.expiryDate as Date).getTime() - (b.expiryDate as Date).getTime())[0]?.expiryDate ?? null;
        await tx.column.update({ where: { id: existing.columnId }, data: { expiryDate: nextExpiry } });
      }

      const updated = await tx.transaction.update({
        where: { id },
        data: { dispenseStatus: outcome === 'SUCCESS' ? DispenseStatus.SUCCESS : DispenseStatus.JAMMED },
        include: { machine: true, column: { include: { product: true } } },
      });
      return { value: updated, error: null };
    });

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
      message: outcome === 'SUCCESS' ? 'Nhả hàng giả lập thành công' : 'Đã ghi nhận trạng thái kẹt hàng giả lập',
      data: transaction.value,
    });
  } catch (error) {
    console.error('Simulate dispense error:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật kết quả nhả hàng lúc này' });
  }
});

export default transactionsRouter;
