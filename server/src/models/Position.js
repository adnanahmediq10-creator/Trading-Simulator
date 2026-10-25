import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    qty: { type: Number, required: true, default: 0 },
    /** Shares locked by pending SELL limit orders */
    reservedQty: { type: Number, required: true, default: 0 },
    avgCostPaise: { type: Number, required: true, default: 0 },
    realizedPnlPaise: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

positionSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export const Position = mongoose.model('Position', positionSchema);
