/**
 * node --experimental-strip-types --test lib/surveys/scoring.test.mts
 * or: pnpm test:scoring
 */

import test from "node:test";
import assert from "node:assert/strict";
import { averageRating, quizScore, delta, ratingSpec, normaliseRating, type ScoringAnswer, type RatingSpec } from "./scoring.ts";

const UP: RatingSpec = { min: 1, max: 5, reverse: false };
const DOWN: RatingSpec = { min: 1, max: 5, reverse: true };

const RATING_QS = new Map<string, RatingSpec>([["r1", UP], ["r2", UP], ["r3", UP], ["r4", UP]]);

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

test("normaliseRating: flips reverse-coded questions", () => {
  assert.equal(normaliseRating(5, DOWN), 1); // "very difficult" is the worst outcome
  assert.equal(normaliseRating(1, DOWN), 5);
  assert.equal(normaliseRating(3, DOWN), 3); // midpoint is its own mirror
  assert.equal(normaliseRating(5, UP), 5);
});

test("ratingSpec: reads the flag off rating_scale jsonb", () => {
  assert.deepEqual(ratingSpec({ min: 1, max: 5, reverse: true }), { min: 1, max: 5, reverse: true });
  assert.deepEqual(ratingSpec({ min: 1, max: 5 }), { min: 1, max: 5, reverse: false });
  assert.deepEqual(ratingSpec(null), { min: 1, max: 5, reverse: false });
  // Only a real boolean true flips it - a stray string must not.
  assert.equal(ratingSpec({ reverse: "true" }).reverse, false);
});

test("averageRating: a reverse-coded question no longer drags the score down", () => {
  // The bug: "difficulty" fell 4 -> 2 because training worked, which pulled the
  // average down even though every measure had improved.
  const qs = new Map<string, RatingSpec>([["r1", UP], ["r2", UP], ["r3", UP], ["r17", DOWN]]);

  const pre = [answer("r1", 2), answer("r2", 2), answer("r3", 2), answer("r17", 4)];
  const post = [answer("r1", 3), answer("r2", 3), answer("r3", 3), answer("r17", 2)];

  // pre : (2+2+2+2)/4 = 2.0        (difficulty 4 -> normalised 2)
  // post: (3+3+3+4)/4 = 3.25 -> 3.3 (difficulty 2 -> normalised 4)
  assert.equal(averageRating(pre, qs), 2);
  assert.equal(averageRating(post, qs), 3.3);
  assert.equal(delta(averageRating(pre, qs), averageRating(post, qs)), 1.3);

  // Scored raw, the very same answers report +0.3 - a quarter of the real gain.
  const raw = new Map<string, RatingSpec>([["r1", UP], ["r2", UP], ["r3", UP], ["r17", UP]]);
  assert.equal(delta(averageRating(pre, raw), averageRating(post, raw)), 0.3);
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
