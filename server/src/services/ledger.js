const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { ApiError } = require('../http/errors');
const { runTransaction } = require('./runTransaction');

function calculateBalance(balanceMinor, amountMinor, type) {
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0) {
    throw new Error('Invalid persisted account balance');
  }
  const next = BigInt(balanceMinor) + (type === 'credit' ? 1n : -1n) * BigInt(amountMinor);
  if (next < 0n) throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'Insufficient balance');
  if (next > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(422, 'BALANCE_OVERFLOW', 'Balance exceeds safe integer minor units');
  return Number(next);
}

async function postTransaction(accountId, input) {
  return runTransaction(async (session) => {
    const account = await Account.findById(accountId).session(session);
    if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (await Transaction.exists({ accountId, referenceId: input.referenceId }).session(session)) {
      throw new ApiError(409, 'DUPLICATE_REFERENCE', 'Reference already exists for this account');
    }
    const next = calculateBalance(account.balanceMinor, input.amountMinor, input.type);
    account.balanceMinor = next;
    await account.save({ session });
    const [transaction] = await Transaction.create([{ ...input, accountId }], { session });
    return { transaction, account };
  });
}
module.exports = { postTransaction, calculateBalance };
