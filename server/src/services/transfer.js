const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { ApiError } = require('../http/errors');
const { calculateBalance } = require('./ledger');
const { runTransaction } = require('./runTransaction');

async function transferMoney(input) {
  const { sourceAccountId, destinationAccountId, amountMinor, description, referenceId } = input;
  if (sourceAccountId === destinationAccountId) {
    throw new ApiError(422, 'SAME_ACCOUNT_TRANSFER', 'Source and destination accounts must differ');
  }
  return runTransaction(async (session) => {
    const ids = [sourceAccountId, destinationAccountId];
    const accounts = await Account.find({ _id: { $in: ids } }).sort({ _id: 1 }).session(session);
    const source = accounts.find((account) => account.id === sourceAccountId);
    const destination = accounts.find((account) => account.id === destinationAccountId);
    if (!source || !destination) {
      throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Both source and destination accounts must exist');
    }
    if (await Transaction.exists({ accountId: { $in: ids }, referenceId }).session(session)) {
      throw new ApiError(409, 'DUPLICATE_REFERENCE', 'Reference already exists in a participating account');
    }
    const sourceBalance = calculateBalance(source.balanceMinor, amountMinor, 'debit');
    const destinationBalance = calculateBalance(destination.balanceMinor, amountMinor, 'credit');
    source.balanceMinor = sourceBalance;
    destination.balanceMinor = destinationBalance;
    for (const account of accounts) await account.save({ session });
    const createdAt = new Date();
    const entry = { amountMinor, description, referenceId, createdAt };
    const [debit] = await Transaction.create([{ ...entry, accountId: sourceAccountId, type: 'debit' }], { session });
    const [credit] = await Transaction.create([{ ...entry, accountId: destinationAccountId, type: 'credit' }], { session });
    return { source, destination, debit, credit, referenceId, amountMinor };
  });
}
module.exports = { transferMoney };
