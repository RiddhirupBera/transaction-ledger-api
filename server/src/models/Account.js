const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  balanceMinor: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });
module.exports = mongoose.model('Account', schema);
