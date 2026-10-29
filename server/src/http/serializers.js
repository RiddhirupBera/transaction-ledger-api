const { formatMinor } = require('../validation/ledger');

const accountJSON = (account) => ({
  id: account._id.toString(),
  name: account.name,
  balance: formatMinor(account.balanceMinor),
  created_at: account.createdAt,
  createdAt: account.createdAt,
});
const transactionJSON = (transaction) => ({
  id: transaction._id.toString(),
  account_id: transaction.accountId.toString(),
  accountId: transaction.accountId.toString(),
  type: transaction.type,
  amount: formatMinor(transaction.amountMinor),
  description: transaction.description,
  reference_id: transaction.referenceId,
  referenceId: transaction.referenceId,
  created_at: transaction.createdAt,
  createdAt: transaction.createdAt,
});
module.exports = { accountJSON, transactionJSON };
