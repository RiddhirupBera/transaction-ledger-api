const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
async function verifyIndexes() {
  const indexes = await Transaction.collection.indexes();
  const uniqueReference = indexes.some(({ key, unique, sparse, partialFilterExpression }) =>
    unique === true && !sparse && !partialFilterExpression &&
    JSON.stringify(Object.entries(key)) === JSON.stringify([['accountId', 1], ['referenceId', 1]]));
  if (!uniqueReference) throw new Error('Required unique (accountId, referenceId) index is missing');
}
async function connectDatabase(uri, options = {}) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, ...options });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Connected MongoDB is standalone. LedgerFlow requires its replica set: run docker compose up -d --wait and set MONGODB_URI to mongodb://localhost:27019/ledgerflow?replicaSet=rs0&directConnection=true (default local port).');
  await Account.createIndexes();
  await Transaction.createIndexes();
  await verifyIndexes();
}
module.exports = { connectDatabase, verifyIndexes };
