/**
 * node --experimental-strip-types --test lib/uuid.test.mts
 * or: pnpm test:uuid
 */

import test from "node:test";
import assert from "node:assert/strict";
import { isUuid } from "./uuid.ts";

test("accepts real ids that Postgres stores, whatever their version nibble", () => {
  // The regression: this row exists and is reachable, but an RFC-4122 check
  // rejected it (version 3, variant 5) and 400'd the whole attendance flow.
  assert.equal(isUuid("e7b8c9d0-1a2b-3c4d-5e6f-7a8b9c0d1e2f"), true);
  assert.equal(isUuid("e7b8c9d0-9999-4000-8000-000000000001"), true);
  assert.equal(isUuid("a1b2c3d4-0001-4000-8000-000000000001"), true);
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
});

test("accepts generated v4 ids", () => {
  assert.equal(isUuid("ebe28017-5489-49dd-8367-9a887a82b673"), true);
  assert.equal(isUuid("65dae045-3c90-43e8-a21a-43425987092b"), true);
  assert.equal(isUuid(crypto.randomUUID()), true);
});

test("is case-insensitive", () => {
  assert.equal(isUuid("E7B8C9D0-1A2B-3C4D-5E6F-7A8B9C0D1E2F"), true);
});

test("still rejects anything Postgres would choke on", () => {
  for (const bad of [
    "", "bukan-uuid", "1';DROP TABLE surveys;--",
    "e7b8c9d0-1a2b-3c4d-5e6f",                       // too short
    "e7b8c9d0-1a2b-3c4d-5e6f-7a8b9c0d1e2f0",         // too long
    "e7b8c9d0-1a2b-3c4d-5e6f-7a8b9c0d1e2g",          // non-hex
    "e7b8c9d0_1a2b_3c4d_5e6f_7a8b9c0d1e2f",          // wrong separator
    " e7b8c9d0-1a2b-3c4d-5e6f-7a8b9c0d1e2f",         // leading space
    "e7b8c9d0-1a2b-3c4d-5e6f-7a8b9c0d1e2f\n",        // trailing newline
  ]) {
    assert.equal(isUuid(bad), false, `should reject: ${JSON.stringify(bad)}`);
  }
});
