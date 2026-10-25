import mongoose from 'mongoose';

const candleSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, index: true },
    interval: { type: String, enum: ['1m', '1d'], required: true },
    t: { type: Number, required: true }, // epoch ms UTC, candle start
    o: { type: Number, required: true },
    h: { type: Number, required: true },
    l: { type: Number, required: true },
    c: { type: Number, required: true },
    v: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false },
);

candleSchema.index({ symbol: 1, interval: 1, t: 1 }, { unique: true });

export const Candle = mongoose.model('Candle', candleSchema);
