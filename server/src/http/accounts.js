const express = require('express');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { createAccountSchema, idSchema, transactionBodySchema, historyQuerySchema, formatMinor } = require('../validation/ledger');
const { ApiError } = require('./errors');
const { postTransaction } = require('../services/ledger');
const router = express.Router();
const { accountJSON, transactionJSON } = require('./serializers');
async function requireAccount(id) {
  const account = await Account.findById(id);
  if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
  return account;
}
router.post('/', async (req, res) => {
  const account = await Account.create(createAccountSchema.parse(req.body));
  res.status(201).json({ data: accountJSON(account) });
});
router.get('/', async (req, res) => {
  const accounts = await Account.find().sort({ createdAt: -1, _id: -1 });
  res.json({ data: accounts.map(accountJSON) });
});
router.get('/:id/balance', async (req, res) => {
  const account = await requireAccount(idSchema.parse(req.params.id));
  res.json({ data: { account_id: account.id, accountId: account.id, balance: formatMinor(account.balanceMinor) } });
});
router.post('/:id/transactions', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = transactionBodySchema.parse(req.body);
  const { transaction, account } = await postTransaction(id, input);
  res.status(201).json({ data: { ...transactionJSON(transaction), balance: formatMinor(account.balanceMinor) } });
});
router.get('/:id/transactions', async (req, res) => {
  const accountId = idSchema.parse(req.params.id);
  const { type, page, limit } = historyQuerySchema.parse(req.query);
  await requireAccount(accountId);
  const filter = { accountId, ...(type ? { type } : {}) };
  const transactions = await Transaction.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
  const total = await Transaction.countDocuments(filter);
  res.json({ data: transactions.map(transactionJSON), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});
module.exports = router;
