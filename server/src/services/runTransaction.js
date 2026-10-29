const mongoose = require('mongoose');
const { setTimeout: delay } = require('node:timers/promises');
const { ApiError } = require('../http/errors');
const hasLabel = (error, label) => error.hasErrorLabel?.(label) || error.errorLabels?.includes(label);

async function runTransaction(work, { startSession = () => mongoose.startSession(), sleep = delay, attempts = 5, commitAttempts = 3 } = {}) {
  const session = await startSession();
  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 5000 });
      let uncertainCommit = false;
      try {
        const result = await work(session);
        for (let commit = 0; commit < commitAttempts; commit += 1) {
          try {
            await session.commitTransaction();
            return result;
          } catch (error) {
            if (error.code === 11000) throw error;
            if (!hasLabel(error, 'UnknownTransactionCommitResult')) throw error;
            uncertainCommit = true;
            if (commit + 1 === commitAttempts) {
              throw new ApiError(409, 'COMMIT_OUTCOME_UNKNOWN', 'Commit outcome is unknown; check history for this referenceId before retrying');
            }
            await sleep(20 * (commit + 1));
          }
        }
      } catch (error) {
        if (!uncertainCommit && session.inTransaction()) {
          await session.abortTransaction().catch(() => {});
        }
        if (error.code === 11000) throw error;
        if (uncertainCommit) {
          throw new ApiError(409, 'COMMIT_OUTCOME_UNKNOWN', 'Commit outcome is unknown; check history for this referenceId before retrying');
        }
        if (!hasLabel(error, 'TransientTransactionError')) throw error;
        if (attempt + 1 === attempts) {
          throw new ApiError(409, 'WRITE_CONFLICT', 'Concurrent writes prevented posting; retry with the same referenceId');
        }
        await sleep(10 * (2 ** attempt) + Math.floor(Math.random() * 10));
      }
    }
  } finally {
    await session.endSession();
  }
}
module.exports = { runTransaction };
