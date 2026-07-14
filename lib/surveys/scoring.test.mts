/**
 * node --experimental-strip-types --test lib/surveys/scoring.test.mts
 * or: pnpm test:scoring
 */

import test from "node:test";
import assert from "node:assert/strict";
import { averageRating, quizScore, delta, type ScoringAnswer } from "./scoring.ts";

const RATING_QS = new Set(["r1", "r2", "r3", "r4"]);

const answer = (question_id: string, answer_value: unknown, answer_text: string | null = null): ScoringAnswer =>
  ({ question_id, answer_value, answer_text, selected_options: null });

test("averageRating: averages the rating answers", () => {
  assert.equal(averageRating([answer("r1", 5), answer("r2", 4), answer("r3", 3), answer("r4", 4)], RATING_QS), 4);
});

test("averageRating: rounds to one decimal", () => {
  assert.equal(averageRating([answer("r1", 5), answer("r2", 4), answer("r3", 2)], RATING_QS), 3.7);
});

test("averageRating: ignores non-rating questions", () => {
  assert.equal(averageRating([answer("r1", 5), answer("free_text", 1)], RATING_QS), 5);
});

test("averageRating: no rating answers yields null, never 0", () => {
  assert.equal(averageRating([answer("free_text", 3)], RATING_QS), null);
});

test("averageRating: null answer_value yields null, never 0", () => {
  // A 0 here would read as a real score of zero and drag every average down.
  assert.equal(averageRating([answer("r1", null)], RATING_QS), null);
});

test("quizScore: all correct", () => {
  const key = new Map([["q1", "A"], ["q2", "B"]]);
  assert.deepEqual(quizScore([answer("q1", null, "A"), answer("q2", null, "B")], key), { correct: 2, pct: 100 });
});

test("quizScore: partial", () => {
  const key = new Map([["q1", "A"], ["q2", "B"]]);
  assert.deepEqual(quizScore([answer("q1", null, "A"), answer("q2", null, "Z")], key), { correct: 1, pct: 50 });
});

test("quizScore: falls back to selected_options", () => {
  const key = new Map([["q1", "A"], ["q2", "B"]]);
  const a: ScoringAnswer = { question_id: "q1", answer_text: null, answer_value: null, selected_options: ["A"] };
  assert.deepEqual(quizScore([a], key), { correct: 1, pct: 50 });
});

test("quizScore: unscored survey yields null", () => {
  assert.equal(quizScore([answer("q1", null, "A")], new Map()), null);
});

test("delta: needs both sides", () => {
  assert.equal(delta(3.2, 4.5), 1.3);
  assert.equal(delta(4, 3.5), -0.5);
  assert.equal(delta(3, null), null);
  assert.equal(delta(null, 3), null);
});
