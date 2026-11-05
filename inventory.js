"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPIRY_WARNING_DAYS = exports.LOW_STOCK_THRESHOLD = void 0;
exports.summarizeInventory = summarizeInventory;
exports.LOW_STOCK_THRESHOLD = 5;
exports.EXPIRY_WARNING_DAYS = 3;
function summarizeInventory(column, now = new Date()) {
    const warningCutoff = new Date(now.getTime() + exports.EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
    const availableStock = column.batches.reduce((total, batch) => {
        if (batch.expiryDate && batch.expiryDate <= now)
            return total;
        return total + batch.quantity;
    }, 0);
    const expiredStock = column.batches.reduce((total, batch) => {
        return batch.expiryDate && batch.expiryDate <= now ? total + batch.quantity : total;
    }, 0);
    const expiringWithin3Days = column.batches.reduce((total, batch) => {
        return batch.expiryDate && batch.expiryDate > now && batch.expiryDate <= warningCutoff
            ? total + batch.quantity
            : total;
    }, 0);
    return {
        ...column,
        availableStock,
        expiredStock,
        stockStatus: availableStock === 0 ? 'OUT_OF_STOCK' : availableStock <= exports.LOW_STOCK_THRESHOLD ? 'LOW_STOCK' : 'IN_STOCK',
        lowStock: availableStock > 0 && availableStock <= exports.LOW_STOCK_THRESHOLD,
        outOfStock: availableStock === 0,
        expiringWithin3Days,
        expiryWarning: expiringWithin3Days > 0,
        batches: [...column.batches].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    };
}
