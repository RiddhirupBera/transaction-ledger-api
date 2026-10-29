const path = require('node:path');
const { z } = require('zod');
const envPath = path.resolve(__dirname, '../../../.env');
require('dotenv').config({ path: envPath, quiet: true });
const result = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().trim().min(1),
}).safeParse(process.env);
if (!result.success) {
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
  throw new Error(`Invalid or missing configuration: ${fields.join(', ')}. Set these variables in ${envPath}. For local setup, copy .env.example to .env and start MongoDB with docker compose up -d --wait.`);
}
module.exports = result.data;
