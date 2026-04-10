export const DOCUMENT_DB_INSERT_BATCH_SIZE = 500;

export function splitIntoDbInsertBatches<T>(
  rows: T[],
  batchSize = DOCUMENT_DB_INSERT_BATCH_SIZE,
) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  const batches: T[][] = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }

  return batches;
}
