const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Account = require('../src/models/Account');
const Transaction = require('../src/models/Transaction');
const { connectDatabase, verifyIndexes } = require('../src/config/database');
let replica;
const ids = [];

beforeAll(async () => {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.16' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
    uri = replica.getUri('ledgerflow_test');
  }
  if (!new URL(uri).pathname.endsWith('_test')) throw new Error('TEST_MONGODB_URI must use a database ending in _test');
  await connectDatabase(uri, { runtimeAdapters: { os: require('node:os') } });
}, 120000);
afterEach(async () => {
  jest.restoreAllMocks();
  if (mongoose.connection.readyState === 1) {
    await Transaction.collection.deleteMany({ accountId: { $in: ids } });
    await Account.deleteMany({ _id: { $in: ids } });
  }
  ids.length = 0;
});
afterAll(async () => {
  await mongoose.disconnect();
  if (replica) await replica.stop();
});
async function account() {
  const response = await request(app).post('/api/accounts').send({ name: '  Operations  ' }).expect(201);
  ids.push(new mongoose.Types.ObjectId(response.body.data.id));
  return response.body.data;
}
const post = (id, type, amount, referenceId) => request(app).post(`/api/accounts/${id}/transactions`).send({ type, amount, referenceId, description: 'Test posting' });
const balance = async (id) => (await request(app).get(`/api/accounts/${id}/balance`).expect(200)).body.data.balance;

test('creates and lists accounts and returns formatted balances', async () => {
  const created = await account();
  expect(created).toMatchObject({ name: 'Operations', balance: '0.00' });
  expect(created.id).toMatch(/^[a-f0-9]{24}$/);
  expect(created.createdAt).toBeDefined();
  expect(created).not.toHaveProperty('balanceMinor');
  const list = await request(app).get('/api/accounts').expect(200);
  expect(list.body.data).toContainEqual(created);
  expect(await balance(created.id)).toBe('0.00');
});

test('credits and debits update ledger and balance atomically', async () => {
  const { id } = await account();
  const credit = await post(id, 'credit', '10.29', 'credit-1').expect(201);
  expect(credit.body.data).toMatchObject({ amount: '10.29', balance: '10.29', referenceId: 'credit-1', accountId: id });
  await post(id, 'debit', '0.29', 'debit-1').expect(201);
  expect(await balance(id)).toBe('10.00');
  const saved = await Account.findById(id);
  expect(saved.balanceMinor).toBe(1000);
  expect(await Transaction.countDocuments({ accountId: id })).toBe(2);
  const transaction = await Transaction.findOne({ accountId: id });
  await expect(transaction.save()).rejects.toThrow('immutable');
  await expect(transaction.deleteOne()).rejects.toThrow('immutable');
});

test('missing accounts yield 404 for balance, history, and posting', async () => {
  const id = new mongoose.Types.ObjectId().toString();
  await request(app).get(`/api/accounts/${id}/balance`).expect(404);
  await request(app).get(`/api/accounts/${id}/transactions`).expect(404);
  await post(id, 'credit', '1.00', 'missing').expect(404);
});

test('insufficient funds and overflow leave both collections unchanged', async () => {
  const { id } = await account();
  await post(id, 'debit', '0.01', 'insufficient').expect(422)
    .expect(({ body }) => expect(body.error.code).toBe('INSUFFICIENT_BALANCE'));
  expect(await Transaction.countDocuments({ accountId: id })).toBe(0);
  await post(id, 'credit', '90071992547409.91', 'max').expect(201);
  await post(id, 'credit', '0.01', 'overflow').expect(422)
    .expect(({ body }) => expect(body.error.code).toBe('BALANCE_OVERFLOW'));
  expect(await balance(id)).toBe('90071992547409.91');
  expect(await Transaction.countDocuments({ accountId: id })).toBe(1);
  await post(id, 'debit', '90071992547409.91', 'empty').expect(201);
  expect(await balance(id)).toBe('0.00');
});

test('duplicate references yield 409 and remain scoped to an account', async () => {
  const first = await account();
  const second = await account();
  await post(first.id, 'credit', '1.00', 'same').expect(201);
  await post(first.id, 'debit', '5.00', 'same').expect(409);
  await post(second.id, 'credit', '2.00', 'same').expect(201);
  expect(await balance(first.id)).toBe('1.00');
  await expect(Transaction.create({ accountId: first.id, type: 'credit', amountMinor: 1, referenceId: 'same' })).rejects.toMatchObject({ code: 11000 });
  await expect(verifyIndexes()).resolves.toBeUndefined();
});

test('failed insert rolls back an account write', async () => {
  const { id } = await account();
  await post(id, 'credit', '1.00', 'rollback').expect(201);
  jest.spyOn(Transaction, 'exists').mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) });
  await post(id, 'credit', '10.00', 'rollback').expect(409);
  expect(await balance(id)).toBe('1.00');
  expect(await Transaction.countDocuments({ accountId: id })).toBe(1);
});

test('concurrent debits cannot overspend', async () => {
  const { id } = await account();
  await post(id, 'credit', '10.00', 'initial').expect(201);
  const responses = await Promise.all([post(id, 'debit', '7.00', 'a'), post(id, 'debit', '7.00', 'b')]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
  expect(await balance(id)).toBe('3.00');
  expect(await Transaction.countDocuments({ accountId: id, type: 'debit' })).toBe(1);
});

test('concurrent credits retain every balance update', async () => {
  const { id } = await account();
  const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => post(id, 'credit', '0.29', `credit-${i}`)));
  expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
  expect(await balance(id)).toBe('1.16');
  expect(await Transaction.countDocuments({ accountId: id })).toBe(4);
});

test('concurrent duplicate references create one posting', async () => {
  const { id } = await account();
  const responses = await Promise.all([post(id, 'credit', '5.00', 'race'), post(id, 'credit', '5.00', 'race')]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await balance(id)).toBe('5.00');
  expect(await Transaction.countDocuments({ accountId: id })).toBe(1);
});

test('history filters and paginates in descending timestamp and ObjectId order', async () => {
  const { id } = await account();
  const history = await request(app).get(`/api/accounts/${id}/transactions`).expect(200);
  expect(history.body.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  await post(id, 'credit', '10.00', 'a').expect(201);
  await post(id, 'credit', '5.00', 'b').expect(201);
  await post(id, 'debit', '1.00', 'c').expect(201);
  const documents = await Transaction.find({ accountId: id });
  const newest = documents[0];
  const newestAt = new Date('2027-01-01');
  await Transaction.collection.updateOne({ _id: newest._id }, { $set: { createdAt: newestAt } });
  const chronological = await request(app).get(`/api/accounts/${id}/transactions`).expect(200);
  expect(chronological.body.data[0].id).toBe(newest.id);
  const tiedAt = new Date('2026-01-01');
  await Transaction.collection.updateMany({ accountId: new mongoose.Types.ObjectId(id) }, { $set: { createdAt: tiedAt } });
  const expected = documents.map((item) => item.id).sort().reverse();
  const first = await request(app).get(`/api/accounts/${id}/transactions?page=1&limit=2`).expect(200);
  expect(first.body.data.map((item) => item.id)).toEqual(expected.slice(0, 2));
  expect(first.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  const second = await request(app).get(`/api/accounts/${id}/transactions?page=2&limit=2`).expect(200);
  expect(second.body.data.map((item) => item.id)).toEqual(expected.slice(2));
  const credits = await request(app).get(`/api/accounts/${id}/transactions?type=credit`).expect(200);
  expect(credits.body.pagination.total).toBe(2);
  expect(credits.body.data.every((item) => item.type === 'credit')).toBe(true);
  await request(app).get(`/api/accounts/${id}/transactions?page=5`).expect(200).expect(({ body }) => expect(body.data).toEqual([]));
});

test.each([{ amount: 1.25 }, { amount: '1.234' }, { amount: '90071992547409.92' }, { referenceId: ' ' }, { type: 'refund' }, { accountId: 'forbidden' }, { balanceMinor: 10 }])('posting validation rejects %p without mutation', async (patch) => {
  const { id } = await account();
  await request(app).post(`/api/accounts/${id}/transactions`).send({ type: 'credit', amount: '1.00', referenceId: 'valid', ...patch }).expect(400);
  expect(await balance(id)).toBe('0.00');
  expect(await Transaction.countDocuments({ accountId: id })).toBe(0);
});

const transfer = (source, destination, amount, reference, extra = {}) => request(app).post('/api/transfers').send({
  source_account_id: source, destination_account_id: destination,
  amount, reference_id: reference, description: 'Assessment transfer', ...extra,
});
async function fundedAccount(amount, reference = 'opening') {
  const created = await account();
  if (amount !== '0.00') await post(created.id, 'credit', amount, reference).expect(201);
  return created;
}
async function expectConsistentLedger(id) {
  const saved = await Account.findById(id);
  const entries = await Transaction.find({ accountId: id });
  const sum = entries.reduce((total, entry) => total + (entry.type === 'credit' ? 1n : -1n) * BigInt(entry.amountMinor), 0n);
  expect(BigInt(saved.balanceMinor)).toBe(sum);
}

test('assessment snake-case fields are exposed while dashboard aliases remain compatible', async () => {
  const created = await account();
  expect(created.created_at).toBe(created.createdAt);
  const posted = await request(app).post(`/api/accounts/${created.id}/transactions`)
    .send({ type: 'credit', amount: '1.00', reference_id: 'assessment-ref' }).expect(201);
  expect(posted.body.data).toMatchObject({ account_id: created.id, reference_id: 'assessment-ref', description: '' });
  expect(posted.body.data.created_at).toBe(posted.body.data.createdAt);
  const response = await request(app).get(`/api/accounts/${created.id}/balance`).expect(200);
  expect(response.body.data).toMatchObject({ account_id: created.id, accountId: created.id, balance: '1.00' });
  const history = await request(app).get(`/api/accounts/${created.id}/transactions`).expect(200);
  expect(history.body.data[0]).toHaveProperty('reference_id', 'assessment-ref');
});

test('assessment arithmetic example preserves the sum of all valid postings', async () => {
  const { id } = await account();
  for (const [index, [type, amount]] of [['credit', '100.00'], ['credit', '50.00'], ['debit', '30.00'], ['debit', '20.00']].entries()) {
    await post(id, type, amount, `assessment-${index}`).expect(201);
  }
  expect(await balance(id)).toBe('100.00');
  await expectConsistentLedger(id);
});

test('public API cannot change any field or delete an existing transaction', async () => {
  const { id } = await fundedAccount('10.00');
  const before = (await Transaction.findOne({ accountId: id }).lean());
  const patch = { account_id: new mongoose.Types.ObjectId().toString(), type: 'debit', amount: '5.00', description: 'Edited', reference_id: 'edited', created_at: '2000-01-01' };
  for (const method of ['put', 'patch', 'delete']) {
    await request(app)[method](`/api/accounts/${id}/transactions/${before._id}`).send(patch).expect(404);
    await request(app)[method](`/api/transactions/${before._id}`).send(patch).expect(404);
  }
  expect(await Transaction.findById(before._id).lean()).toEqual(before);
  expect(await balance(id)).toBe('10.00');
});

test('bonus transfer matches the assessment example and records both immutable entries', async () => {
  const source = await fundedAccount('100.00');
  const destination = await fundedAccount('50.00');
  const response = await transfer(source.id, destination.id, '30.00', 'transfer-1').expect(201);
  expect(response.body.data.source.balance).toBe('70.00');
  expect(response.body.data.destination.balance).toBe('80.00');
  expect(response.body.data.transactions).toHaveLength(2);
  expect(response.body.data.transactions.map((entry) => [entry.account_id, entry.type, entry.amount, entry.reference_id]))
    .toEqual([[source.id, 'debit', '30.00', 'transfer-1'], [destination.id, 'credit', '30.00', 'transfer-1']]);
  expect(response.body.data.transactions[0].created_at).toBe(response.body.data.transactions[1].created_at);
  expect(await balance(source.id)).toBe('70.00');
  expect(await balance(destination.id)).toBe('80.00');
  await expectConsistentLedger(source.id);
  await expectConsistentLedger(destination.id);
});

test('transfer accepts camelCase aliases for existing JavaScript callers', async () => {
  const source = await fundedAccount('1.00');
  const destination = await account();
  await request(app).post('/api/transfers').send({ sourceAccountId: source.id, destinationAccountId: destination.id, amount: '0.29', referenceId: 'camel' }).expect(201);
  expect(await balance(source.id)).toBe('0.71');
  expect(await balance(destination.id)).toBe('0.29');
});

test('transfer rejects missing source and destination accounts without changes', async () => {
  const existing = await fundedAccount('10.00');
  const missing = new mongoose.Types.ObjectId().toString();
  await transfer(existing.id, missing, '1.00', 'missing-destination').expect(404);
  await transfer(missing, existing.id, '1.00', 'missing-source').expect(404);
  expect(await balance(existing.id)).toBe('10.00');
  expect(await Transaction.countDocuments({ accountId: existing.id })).toBe(1);
});

test('transfer rejects insufficient funds and self-transfers without ledger entries', async () => {
  const source = await fundedAccount('10.00');
  const destination = await account();
  await transfer(source.id, destination.id, '10.01', 'insufficient').expect(422)
    .expect(({ body }) => expect(body.error.code).toBe('INSUFFICIENT_BALANCE'));
  await transfer(source.id.toUpperCase(), source.id, '1.00', 'self').expect(422)
    .expect(({ body }) => expect(body.error.code).toBe('SAME_ACCOUNT_TRANSFER'));
  expect(await balance(source.id)).toBe('10.00');
  expect(await balance(destination.id)).toBe('0.00');
  expect(await Transaction.countDocuments({ accountId: destination.id })).toBe(0);
});

test('destination overflow cannot debit the source', async () => {
  const source = await fundedAccount('1.00');
  const destination = await fundedAccount('90071992547409.91');
  await transfer(source.id, destination.id, '0.01', 'overflow').expect(422)
    .expect(({ body }) => expect(body.error.code).toBe('BALANCE_OVERFLOW'));
  expect(await balance(source.id)).toBe('1.00');
  expect(await balance(destination.id)).toBe('90071992547409.91');
  expect(await Transaction.countDocuments({ referenceId: 'overflow', accountId: { $in: [source.id, destination.id] } })).toBe(0);
});

test('repeating a transfer or reusing an existing participant reference leaves both balances unchanged', async () => {
  const source = await fundedAccount('100.00');
  const destination = await fundedAccount('50.00', 'destination-reference');
  await transfer(source.id, destination.id, '30.00', 'repeat').expect(201);
  await transfer(source.id, destination.id, '30.00', 'repeat').expect(409);
  await transfer(source.id, destination.id, '1.00', 'destination-reference').expect(409);
  expect(await balance(source.id)).toBe('70.00');
  expect(await balance(destination.id)).toBe('80.00');
  expect(await Transaction.countDocuments({ referenceId: 'repeat', accountId: { $in: [source.id, destination.id] } })).toBe(2);
});

test('a real unique-index failure on the second transfer entry rolls back both accounts and the first entry', async () => {
  const source = await fundedAccount('100.00');
  const destination = await fundedAccount('50.00', 'occupied');
  jest.spyOn(Transaction, 'exists').mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) });
  await transfer(source.id, destination.id, '30.00', 'occupied').expect(409);
  expect(await balance(source.id)).toBe('100.00');
  expect(await balance(destination.id)).toBe('50.00');
  expect(await Transaction.countDocuments({ accountId: source.id, referenceId: 'occupied' })).toBe(0);
  expect(await Transaction.countDocuments({ accountId: destination.id, referenceId: 'occupied' })).toBe(1);
  await expectConsistentLedger(source.id);
  await expectConsistentLedger(destination.id);
});

test('failure writing the second transfer account rolls back the first write', async () => {
  const source = await fundedAccount('100.00');
  const destination = await fundedAccount('50.00');
  const save = Account.prototype.save;
  let writes = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(Account.prototype, 'save').mockImplementation(function (options) {
    writes += 1;
    if (writes === 2) return Promise.reject(new Error('Simulated account write failure'));
    return save.call(this, options);
  });
  await transfer(source.id, destination.id, '30.00', 'write-failure').expect(500);
  expect(await balance(source.id)).toBe('100.00');
  expect(await balance(destination.id)).toBe('50.00');
  expect(await Transaction.countDocuments({ referenceId: 'write-failure', accountId: { $in: [source.id, destination.id] } })).toBe(0);
});

test('concurrent transfers from one source cannot overspend', async () => {
  const source = await fundedAccount('100.00');
  const first = await account();
  const second = await account();
  const responses = await Promise.all([transfer(source.id, first.id, '70.00', 'race-a'), transfer(source.id, second.id, '70.00', 'race-b')]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
  expect(await balance(source.id)).toBe('30.00');
  const destinations = await Account.find({ _id: { $in: [first.id, second.id] } });
  expect(destinations.reduce((sum, item) => sum + item.balanceMinor, 0)).toBe(7000);
  for (const id of [source.id, first.id, second.id]) await expectConsistentLedger(id);
});

test('concurrent duplicate transfers commit exactly one pair', async () => {
  const source = await fundedAccount('100.00');
  const destination = await account();
  const responses = await Promise.all([transfer(source.id, destination.id, '30.00', 'same'), transfer(source.id, destination.id, '30.00', 'same')]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await balance(source.id)).toBe('70.00');
  expect(await balance(destination.id)).toBe('30.00');
  expect(await Transaction.countDocuments({ referenceId: 'same', accountId: { $in: [source.id, destination.id] } })).toBe(2);
});

test('opposite-direction transfers preserve total funds and each account ledger', async () => {
  const first = await fundedAccount('100.00');
  const second = await fundedAccount('50.00');
  const responses = await Promise.all([transfer(first.id, second.id, '30.00', 'outbound'), transfer(second.id, first.id, '10.00', 'inbound')]);
  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  expect(await balance(first.id)).toBe('80.00');
  expect(await balance(second.id)).toBe('70.00');
  await expectConsistentLedger(first.id);
  await expectConsistentLedger(second.id);
});

test('a transfer competes safely with an ordinary debit on the same source', async () => {
  const source = await fundedAccount('100.00');
  const destination = await account();
  const responses = await Promise.all([transfer(source.id, destination.id, '70.00', 'transfer-race'), post(source.id, 'debit', '70.00', 'debit-race')]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
  expect(await balance(source.id)).toBe('30.00');
  await expectConsistentLedger(source.id);
  await expectConsistentLedger(destination.id);
});

test('readiness confirms the database without exposing ledger data', async () => {
  await request(app).get('/api/health').expect(200)
    .expect(({ body }) => expect(body).toEqual({ data: { status: 'ok' } }));
});

test('readiness returns a consistent 503 if the database ping fails', async () => {
  jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ command: jest.fn().mockRejectedValue(new Error('Database unreachable')) });
  await request(app).get('/api/health').expect(503)
    .expect(({ body }) => expect(body.error).toMatchObject({ code: 'DATABASE_UNAVAILABLE', message: 'Database is not ready' }));
});
