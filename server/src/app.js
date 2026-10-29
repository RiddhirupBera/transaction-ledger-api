const express = require('express');
const mongoose = require('mongoose');
const accounts = require('./http/accounts');
const transfers = require('./http/transfers');
const { ApiError, errorHandler } = require('./http/errors');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is not ready');
  }
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
  } catch {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is not ready');
  }
  res.json({ data: { status: 'ok' } });
});
app.use('/api/accounts', accounts);
app.use('/api/transfers', transfers);
app.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Route not found')));
app.use(errorHandler);
module.exports = app;
