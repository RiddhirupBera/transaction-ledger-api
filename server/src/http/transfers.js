const express = require('express');
const { transferSchema, formatMinor } = require('../validation/ledger');
const { transferMoney } = require('../services/transfer');
const { accountJSON, transactionJSON } = require('./serializers');
const router = express.Router();

router.post('/', async (req, res) => {
  const result = await transferMoney(transferSchema.parse(req.body));
  res.status(201).json({ data: {
    reference_id: result.referenceId,
    referenceId: result.referenceId,
    amount: formatMinor(result.amountMinor),
    source: accountJSON(result.source),
    destination: accountJSON(result.destination),
    transactions: [transactionJSON(result.debit), transactionJSON(result.credit)],
  } });
});
module.exports = router;
