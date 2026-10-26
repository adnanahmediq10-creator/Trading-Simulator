import mongoose from 'mongoose';
import { env } from '../config/env.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    cashPaise: {
      type: Number,
      required: true,
      default: () => env.STARTING_CASH_PAISE,
      validate: {
        validator: Number.isSafeInteger,
        message: 'cashPaise must be a safe integer',
      },
    },
    reservedCashPaise: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'reservedCashPaise must be a safe integer',
      },
    },
    startingCashPaise: {
      type: Number,
      required: true,
      default: () => env.STARTING_CASH_PAISE,
    },
  },
  { timestamps: true, versionKey: false },
);

// Prevent selecting passwordHash by default
userSchema.methods.toSafeObject = function () {
  const safeUser = this.toObject();
  delete safeUser.passwordHash;
  return safeUser;
};

export const User = mongoose.model('User', userSchema);
