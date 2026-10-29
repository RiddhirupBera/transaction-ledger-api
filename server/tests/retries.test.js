const { runTransaction } = require('../src/services/runTransaction');
const labeled = (label, extra = {}) => Object.assign(new Error(label), { errorLabels: [label], ...extra });
function setup() {
  const session = {
    startTransaction: jest.fn(), commitTransaction: jest.fn().mockResolvedValue(),
    abortTransaction: jest.fn().mockResolvedValue(), inTransaction: jest.fn().mockReturnValue(true),
    endSession: jest.fn().mockResolvedValue(),
  };
  return { session, options: { startSession: async () => session, sleep: jest.fn().mockResolvedValue() } };
}
test('transient conflicts rerun body and use fresh transaction snapshots', async () => {
  const { session, options } = setup();
  const work = jest.fn().mockRejectedValueOnce(labeled('TransientTransactionError')).mockResolvedValue('done');
  await expect(runTransaction(work, options)).resolves.toBe('done');
  expect(session.startTransaction).toHaveBeenCalledTimes(2);
  expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  expect(session.endSession).toHaveBeenCalledTimes(1);
});
test('transient retries stop at five attempts', async () => {
  const { session, options } = setup();
  const work = jest.fn().mockRejectedValue(labeled('TransientTransactionError'));
  await expect(runTransaction(work, options)).rejects.toMatchObject({ status: 409, code: 'WRITE_CONFLICT' });
  expect(work).toHaveBeenCalledTimes(5);
  expect(session.abortTransaction).toHaveBeenCalledTimes(5);
  expect(session.endSession).toHaveBeenCalledTimes(1);
});
test('duplicate key is never retried even when labeled transient', async () => {
  const { session, options } = setup();
  const work = jest.fn().mockRejectedValue(labeled('TransientTransactionError', { code: 11000 }));
  await expect(runTransaction(work, options)).rejects.toMatchObject({ code: 11000 });
  expect(work).toHaveBeenCalledTimes(1);
  expect(options.sleep).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);
});
test('unknown commit retries only commit, never the body', async () => {
  const { session, options } = setup();
  session.commitTransaction.mockRejectedValueOnce(labeled('UnknownTransactionCommitResult'));
  const work = jest.fn().mockResolvedValue(42);
  await expect(runTransaction(work, options)).resolves.toBe(42);
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.commitTransaction).toHaveBeenCalledTimes(2);
});
test('unknown commit retry exhaustion does not replay or abort an ambiguous commit', async () => {
  const { session, options } = setup();
  session.commitTransaction.mockRejectedValue(labeled('UnknownTransactionCommitResult'));
  const work = jest.fn().mockResolvedValue(42);
  await expect(runTransaction(work, options)).rejects.toMatchObject({ code: 'COMMIT_OUTCOME_UNKNOWN', status: 409 });
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.commitTransaction).toHaveBeenCalledTimes(3);
  expect(session.abortTransaction).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);
});
test('duplicate key during commit is not retried', async () => {
  const { session, options } = setup();
  session.commitTransaction.mockRejectedValue(labeled('UnknownTransactionCommitResult', { code: 11000 }));
  await expect(runTransaction(jest.fn().mockResolvedValue(), options)).rejects.toMatchObject({ code: 11000 });
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);
});
test('business errors abort without retrying and release the session', async () => {
  const { session, options } = setup();
  const error = new Error('Business failure');
  const work = jest.fn().mockRejectedValue(error);
  await expect(runTransaction(work, options)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  expect(session.endSession).toHaveBeenCalledTimes(1);
});


test('a different commit failure following an unknown result cannot replay the posting', async () => {
  const { session, options } = setup();
  session.commitTransaction.mockRejectedValueOnce(labeled('UnknownTransactionCommitResult'))
    .mockRejectedValueOnce(labeled('TransientTransactionError'));
  const work = jest.fn().mockResolvedValue(42);
  await expect(runTransaction(work, options)).rejects.toMatchObject({ status: 409, code: 'COMMIT_OUTCOME_UNKNOWN' });
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.commitTransaction).toHaveBeenCalledTimes(2);
});
