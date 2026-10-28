import { Router, Request, Response } from 'express';
import { MachineStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { summarizeInventory } from '../services/inventory';

const productsRouter = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['name', 'price', 'shelfLifeHours']);

function validateProductFields(body: unknown, partial: boolean): { data?: Partial<Prisma.ProductCreateInput>; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body phải là một JSON object' };
  }

  const input = body as Record<string, unknown>;
  const unknownFields = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknownFields.length) {
    return { error: `Trường không được hỗ trợ: ${unknownFields.join(', ')}` };
  }
  if (!partial && (!('name' in input) || !('price' in input) || !('shelfLifeHours' in input))) {
    return { error: 'name, price và shelfLifeHours là bắt buộc' };
  }
  if (partial && Object.keys(input).length === 0) {
    return { error: 'Cần cung cấp ít nhất một trường để cập nhật' };
  }

  const data: Partial<Prisma.ProductCreateInput> = {};
  if ('name' in input) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) {
      return { error: 'name phải có từ 1 đến 100 ký tự' };
    }
    data.name = input.name.trim();
  }

  if ('price' in input) {
    const price = typeof input.price === 'number' ? input.price : Number(input.price);
    if (!Number.isFinite(price) || price <= 0 || price > 99_999_999.99 || Math.round(price * 100) !== price * 100) {
      return { error: 'price phải lớn hơn 0, tối đa 2 chữ số thập phân và không vượt quá 99.999.999,99' };
    }
    data.price = new Prisma.Decimal(price.toFixed(2));
  }

  if ('shelfLifeHours' in input) {
    if (!Number.isInteger(input.shelfLifeHours) || Number(input.shelfLifeHours) <= 0) {
      return { error: 'shelfLifeHours phải là số nguyên dương' };
    }
    data.shelfLifeHours = Number(input.shelfLifeHours);
  }

  return { data };
}

productsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy danh sách sản phẩm lúc này' });
  }
});

productsRouter.get('/catalog', async (_req: Request, res: Response) => {
  try {
    const machines = await prisma.machine.findMany({
      where: { status: MachineStatus.ONLINE },
      select: {
        id: true,
        machineCode: true,
        columns: {
          where: { productId: { not: null } },
          orderBy: { columnNumber: 'asc' },
          include: { product: true, batches: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    const catalog = machines.flatMap((machine) => machine.columns.flatMap((column) => {
      if (!column.product) return [];
      const inventory = summarizeInventory(column);
      if (inventory.availableStock <= 0) return [];
      return [{
        ...column.product,
        machineId: machine.id,
        machineCode: machine.machineCode,
        columnId: column.id,
        columnNumber: column.columnNumber,
        availableStock: inventory.availableStock,
        lowStock: inventory.lowStock,
        expiryWarning: inventory.expiryWarning,
      }];
    }));
    res.status(200).json({ success: true, data: catalog });
  } catch (error) {
    console.error('List customer catalog error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy danh mục hàng đang bán lúc này' });
  }
});

productsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ' });
    return;
  }

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
      return;
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy sản phẩm lúc này' });
  }
});

productsRouter.post('/', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  const validation = validateProductFields(req.body, false);
  if (validation.error || !validation.data) {
    res.status(400).json({ success: false, message: validation.error });
    return;
  }

  try {
    const product = await prisma.product.create({ data: validation.data as Prisma.ProductCreateInput });
    res.status(201).json({ success: true, message: 'Tạo sản phẩm thành công', data: product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Không thể tạo sản phẩm lúc này' });
  }
});

productsRouter.put('/:id', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ' });
    return;
  }
  const validation = validateProductFields(req.body, true);
  if (validation.error || !validation.data) {
    res.status(400).json({ success: false, message: validation.error });
    return;
  }

  try {
    const product = await prisma.product.update({ where: { id }, data: validation.data });
    res.status(200).json({ success: true, message: 'Cập nhật sản phẩm thành công', data: product });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
      return;
    }
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật sản phẩm lúc này' });
  }
});

productsRouter.delete('/:id', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ' });
    return;
  }

  try {
    await prisma.product.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Xóa sản phẩm thành công' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
      return;
    }
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Không thể xóa sản phẩm lúc này' });
  }
});

export default productsRouter;
