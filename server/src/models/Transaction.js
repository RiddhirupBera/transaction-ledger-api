const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
  type: { type: String, enum: ['credit', 'debit'], required: true, immutable: true },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  description: { type: String, trim: true, default: '', immutable: true },
  referenceId: { type: String, trim: true, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });
schema.index({ accountId: 1, referenceId: 1 }, { unique: true });
schema.index({ accountId: 1, createdAt: -1, _id: -1 });
schema.index({ accountId: 1, type: 1, createdAt: -1, _id: -1 });
schema.pre('save', function () {
  if (!this.isNew) throw new Error('Transactions are immutable');
});
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) {
  schema.pre(operation, function () { throw new Error('Transactions are immutable'); });
}
schema.pre('deleteOne', { document: true, query: false }, function () {
  throw new Error('Transactions are immutable');
});
module.exports = mongoose.model('Transaction', schema);
