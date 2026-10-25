import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    type: { type: String, enum: ['MARKET', 'LIMIT'], required: true },
    qty: { type: Number, required: true },
    limitPricePaise: { type: Number, default: null },
    status: {
      type: String,
      enum: ['PENDING', 'FILLED', 'CANCELLED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    /** Funds locked for BUY limit: limitPricePaise * qty */
    reservedPaise: { type: Number, default: 0 },
    filledPricePaise: { type: Number, default: null },
    filledQty: { type: Number, default: 0 },
    filledAt: { type: Date, default: null },
    filledVts: { type: Number, default: null },
    createdVts: { type: Number, default: null },
    cancelledAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

// Unique per (userId, idempotencyKey) — prevents duplicate processing
orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
// Matcher rebuild
orderSchema.index({ status: 1, symbol: 1 });
// User order history
orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
