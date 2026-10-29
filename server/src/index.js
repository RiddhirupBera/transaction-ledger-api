const mongoose = require('mongoose');
const app = require('./app');
const { connectDatabase } = require('./config/database');
async function start() {
  const env = require('./config/env');
  await connectDatabase(env.MONGODB_URI);
  const server = app.listen(env.PORT, () => console.log(`LedgerFlow server listening on ${env.PORT}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    }));
  }
}
start().catch(async (error) => {
  console.error('Server startup failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
