import { describe, expect, test } from "vitest";

import {
  DOCUMENT_DB_INSERT_BATCH_SIZE,
  splitIntoDbInsertBatches,
} from "./db-batches";

describe("splitIntoDbInsertBatches", () => {
  test("splits oversized row sets into stable ordered insert batches", () => {
    const rows = Array.from({ length: DOCUMENT_DB_INSERT_BATCH_SIZE * 2 + 37 }, (_, index) => ({
      id: index + 1,
    }));

    const batches = splitIntoDbInsertBatches(rows);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(DOCUMENT_DB_INSERT_BATCH_SIZE);
    expect(batches[1]).toHaveLength(DOCUMENT_DB_INSERT_BATCH_SIZE);
    expect(batches[2]).toHaveLength(37);
    expect(batches.flat()).toEqual(rows);
  });

  test("rejects non-positive batch sizes", () => {
    expect(() => splitIntoDbInsertBatches([1, 2, 3], 0)).toThrow(
      "batchSize must be a positive integer",
    );
  });
});
