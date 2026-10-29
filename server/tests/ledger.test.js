const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Account = require('../src/models/Account');
const Transaction = require('../src/models/Transaction');
const { amountSchema, createAccountSchema, createTransactionSchema, formatMinor } = require('../src/validation/ledger');

test('accounts have generated IDs and a zero integer balance', async () => {
  const account = new Account({ name: '  Operations  ' });
  await account.validate();
  expect(account._id).toBeInstanceOf(mongoose.Types.ObjectId);
  expect(account.name).toBe('Operations');
  expect(account.balanceMinor).toBe(0);
  await expect(new Account({ name: ' ' }).validate()).rejects.toThrow();
  await expect(new Account({ name: 'A', balanceMinor: 1.1 }).validate()).rejects.toThrow();
  expect(createAccountSchema.safeParse({ name: 'A', balanceMinor: 5 }).success).toBe(false);
});

test.each(['0.00', '-1.00', '1', '1.2', '1.234', '01.00', '1e2', '90071992547409.92', 1.25])('rejects invalid amount %p', (value) => {
  expect(amountSchema.safeParse(value).success).toBe(false);
});

test('money converts exactly, including safe integer boundaries', () => {
  expect(amountSchema.parse('0.29')).toBe(29);
  expect(amountSchema.parse('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
  expect(formatMinor(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  expect(formatMinor(-1)).toBe('-0.01');
  expect(formatMinor(0)).toBe('0.00');
  expect(() => formatMinor(1.5)).toThrow();
  const input = { accountId: new mongoose.Types.ObjectId().toString(), type: 'credit', amount: '12.34', referenceId: ' r1 ' };
  expect(createTransactionSchema.parse(input)).toMatchObject({ amountMinor: 1234, referenceId: 'r1' });
  expect(createTransactionSchema.safeParse({ ...input, _id: 'client-id' }).success).toBe(false);
});

test('transactions validate required fields, positive integers, and unique index definition', async () => {
  const base = { accountId: new mongoose.Types.ObjectId(), type: 'credit', amountMinor: 100, referenceId: 'r1' };
  await expect(new Transaction(base).validate()).resolves.toBeUndefined();
  for (const patch of [{ amountMinor: 0 }, { amountMinor: 1.5 }, { amountMinor: Number.MAX_SAFE_INTEGER + 1 }, { type: 'refund' }, { referenceId: ' ' }, { accountId: undefined }]) {
    await expect(new Transaction({ ...base, ...patch }).validate()).rejects.toThrow();
  }
  expect(Transaction.schema.indexes()).toContainEqual([{ accountId: 1, referenceId: 1 }, { unique: true }]);
});

test('transaction mutations fail before database access', async () => {
  await expect(Transaction.updateOne({}, { description: 'changed' })).rejects.toThrow('immutable');
  await expect(Transaction.deleteMany({})).rejects.toThrow('immutable');
  await expect(Transaction.bulkWrite([{ deleteMany: { filter: {} } }])).rejects.toThrow('immutable');
});

test.each(['get', 'post', 'put', 'patch', 'delete'])('unregistered legacy %s routes return consistent errors', async (method) => {
  await request(app)[method]('/accounts').expect(404);
  await request(app)[method]('/transactions').expect(404);
});


test('invalid API requests return consistent validation errors before database access', async () => {
  for (const body of [{}, { name: ' ' }, { name: 'A', balance: '1.00' }, { name: 'A', _id: 'client' }]) {
    const response = await request(app).post('/api/accounts').send(body).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
    expect(response.body.error.details).toBeInstanceOf(Array);
  }
  await request(app).get('/api/accounts/not-an-id/balance').expect(400);
  await request(app).post('/api/accounts').set('Content-Type', 'application/json').send('{').expect(400)
    .expect(({ body }) => expect(body.error.code).toBe('INVALID_JSON'));
});

test.each(['page=0', 'page=1.5', 'page=1e2', 'page=-1', 'limit=101', 'limit=0', 'type=refund', 'page=1&page=2', 'type=', 'unknown=value', 'page=9007199254740991&limit=10'])('invalid history query %s returns 400', async (query) => {
  await request(app).get(`/api/accounts/${new mongoose.Types.ObjectId()}/transactions?${query}`).expect(400);
});

test.each(['put', 'patch', 'delete'])('no direct %s mutations are exposed', async (method) => {
  const id = new mongoose.Types.ObjectId();
  for (const url of [`/api/accounts/${id}`, `/api/accounts/${id}/balance`, `/api/accounts/${id}/transactions/${id}`]) {
    await request(app)[method](url).send({ balance: '100.00' }).expect(404);
  }
});

test('assessment reference aliases normalize without accepting ambiguous or protected fields', () => {
  const { transactionBodySchema, transferSchema } = require('../src/validation/ledger');
  const source = new mongoose.Types.ObjectId().toString();
  const destination = new mongoose.Types.ObjectId().toString();
  expect(transactionBodySchema.parse({ type: 'credit', amount: '1.00', reference_id: ' ref ' }))
    .toEqual({ type: 'credit', amountMinor: 100, description: '', referenceId: 'ref' });
  expect(transactionBodySchema.safeParse({ type: 'credit', amount: '1.00', reference_id: 'a', referenceId: 'b' }).success).toBe(false);
  expect(transferSchema.parse({ source_account_id: source.toUpperCase(), destination_account_id: destination, amount: '1.00', reference_id: 'transfer' }))
    .toMatchObject({ sourceAccountId: source, destinationAccountId: destination, amountMinor: 100, referenceId: 'transfer' });
  expect(transferSchema.safeParse({ source_account_id: source, sourceAccountId: source, destination_account_id: destination, amount: '1.00', reference_id: 'transfer' }).success).toBe(false);
});

test.each([
  {}, null, [],
  { source_account_id: 'invalid', destination_account_id: 'invalid', amount: '1.00', reference_id: 'r' },
  { amount: '0.00' }, { amount: '-1.00' }, { amount: 1 }, { reference_id: ' ' },
])('invalid transfer body %p produces a consistent 400', async (body) => {
  await request(app).post('/api/transfers').set('Content-Type', 'application/json').send(JSON.stringify(body)).expect(400)
    .expect(({ body }) => expect(body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) }));
});

test.each([null, [], {}, { name: 'A', created_at: '2020-01-01' }, { name: 'A', balance: '0.00' }])('invalid account body %p cannot supply protected fields', async (body) => {
  await request(app).post('/api/accounts').set('Content-Type', 'application/json').send(JSON.stringify(body)).expect(400);
});

test('readiness returns a consistent 503 before the database is connected', async () => {
  await request(app).get('/api/health').expect(503)
    .expect(({ body }) => expect(body).toEqual({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is not ready' } }));
});
