import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    qty: { type: Number, required: true },
    pricePaise: { type: Number, required: true },
    /** Only populated for SELL trades */
    realizedPnlPaise: { type: Number, default: 0 },
    executedAt: { type: Date, required: true },
    executedVts: { type: Number, default: null },
  },
  { timestamps: false, versionKey: false },
);

tradeSchema.index({ userId: 1, executedAt: -1 });

export const Trade = mongoose.model('Trade', tradeSchema);
