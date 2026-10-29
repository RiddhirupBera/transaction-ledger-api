const Transaction = require('../src/models/Transaction');
const { verifyIndexes } = require('../src/config/database');
afterEach(() => jest.restoreAllMocks());
test.each([
  [],
  [{ key: { accountId: 1, referenceId: 1 } }],
  [{ key: { accountId: 1, referenceId: 1 }, unique: true, sparse: true }],
  [{ key: { accountId: 1, referenceId: 1 }, unique: true, partialFilterExpression: { type: 'credit' } }],
  [{ key: { referenceId: 1, accountId: 1 }, unique: true }],
].map((indexes) => [indexes]))('startup verification rejects missing or weakened compound index %p', async (indexes) => {
  jest.spyOn(Transaction.collection, 'indexes').mockResolvedValue(indexes);
  await expect(verifyIndexes()).rejects.toThrow('Required unique');
});
test('startup verification accepts the full unique compound index', async () => {
  jest.spyOn(Transaction.collection, 'indexes').mockResolvedValue([{ key: { accountId: 1, referenceId: 1 }, unique: true }]);
  await expect(verifyIndexes()).resolves.toBeUndefined();
});
