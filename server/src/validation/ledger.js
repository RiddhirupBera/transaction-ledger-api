const { z } = require('zod');
const amountSchema = z.string().max(17).regex(/^(0|[1-9]\d*)\.\d{2}$/, 'Use a decimal string with exactly two places, e.g. 12.34')
  .transform((value) => BigInt(value.replace('.', '')))
  .refine((value) => value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Amount must be positive and fit safe integer minor units')
  .transform(Number);
const idSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Expected a 24-character ObjectId').transform((value) => value.toLowerCase());
const createAccountSchema = z.object({ name: z.string().trim().min(1) }).strict();
const transactionFields = {
  type: z.enum(['credit', 'debit']),
  amount: amountSchema,
  description: z.string().trim().optional().default(''),
  referenceId: z.string().trim().min(1),
};
const toMinor = ({ amount, ...rest }) => ({ ...rest, amountMinor: amount });
function acceptAliases(schema, aliases) {
  return z.preprocess((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const result = { ...input };
    for (const [external, internal] of Object.entries(aliases)) {
      if (Object.hasOwn(result, external) && !Object.hasOwn(result, internal)) {
        result[internal] = result[external];
        delete result[external];
      }
    }
    return result;
  }, schema);
}
const transactionBodySchema = acceptAliases(
  z.object(transactionFields).strict().transform(toMinor),
  { reference_id: 'referenceId' },
);
const transferSchema = acceptAliases(z.object({
  sourceAccountId: idSchema,
  destinationAccountId: idSchema,
  amount: amountSchema,
  description: z.string().trim().optional().default(''),
  referenceId: z.string().trim().min(1),
}).strict().transform(toMinor), {
  source_account_id: 'sourceAccountId',
  destination_account_id: 'destinationAccountId',
  reference_id: 'referenceId',
});
const createTransactionSchema = z.object({ accountId: idSchema, ...transactionFields }).strict().transform(toMinor);
const positiveQueryInteger = (maximum) => z.string().regex(/^[1-9]\d*$/)
  .transform(Number).refine((value) => Number.isSafeInteger(value) && value <= maximum, 'Integer exceeds supported range');
const historyQuerySchema = z.object({
  type: z.enum(['credit', 'debit']).optional(),
  page: positiveQueryInteger(Number.MAX_SAFE_INTEGER).default(1),
  limit: positiveQueryInteger(100).default(10),
}).strict().refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), 'Pagination offset exceeds safe integer range');
function formatMinor(value) {
  if (!Number.isSafeInteger(value)) throw new TypeError('Expected safe integer minor units');
  const minor = BigInt(value);
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
module.exports = { amountSchema, createAccountSchema, createTransactionSchema, formatMinor, idSchema, transactionBodySchema, historyQuerySchema, transferSchema };
