/**
 * Scoring rules for event pre/post surveys.
 *
 * Pre/post surveys carry no answer key, so the only value comparable between
 * them is the shared set of rating questions. The quiz is the only survey
 * scored against `survey_questions.correct_answer`.
 */

export type ScoringAnswer = {
  question_id: string;
  answer_text: string | null;
  answer_value: unknown;
  selected_options: unknown;
};

/**
 * How one rating question is scored.
 *
 * `reverse` matters: not every rating points the same way. "Seberapa sulit
 * dalam membuat konten" scores 5 for the WORST outcome, so averaging it raw
 * alongside "makin tinggi makin baik" questions makes a successful programme
 * look flat. Flagged questions are flipped to (min + max) - value first, so
 * every rating means the same thing before anything is averaged.
 *
 * Set via survey_questions.rating_scale, e.g. {"min":1,"max":5,"reverse":true}.
 */
export type RatingSpec = { min: number; max: number; reverse: boolean };

export const DEFAULT_RATING: RatingSpec = { min: 1, max: 5, reverse: false };

/** Read a RatingSpec off a survey_questions.rating_scale jsonb value. */
export function ratingSpec(scale: unknown): RatingSpec {
  const s = (scale ?? {}) as Record<string, unknown>;
  const min = Number.isFinite(Number(s.min)) ? Number(s.min) : DEFAULT_RATING.min;
  const max = Number.isFinite(Number(s.max)) ? Number(s.max) : DEFAULT_RATING.max;
  return { min, max, reverse: s.reverse === true };
}

/** Value on a "higher is better" scale, flipping reverse-coded questions. */
export function normaliseRating(value: number, spec: RatingSpec): number {
  return spec.reverse ? spec.min + spec.max - value : value;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Average of the rating answers, all pointing "higher is better". Returns null
 * when the respondent answered none of them, so "no data" never collapses into
 * a misleading 0.
 */
export function averageRating(answers: ScoringAnswer[], ratings: Map<string, RatingSpec>): number | null {
  const vals: number[] = [];
  for (const a of answers) {
    const spec = ratings.get(a.question_id);
    if (!spec) continue;
    const raw = Number(a.answer_value);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    vals.push(normaliseRating(raw, spec));
  }

  if (vals.length === 0) return null;
  return round1(vals.reduce((x, y) => x + y, 0) / vals.length);
}

/**
 * Number of answers matching the key. `answer_text` holds the chosen label for
 * multiple choice; `selected_options[0]` is the fallback shape.
 */
export function quizScore(
  answers: ScoringAnswer[],
  answerKey: Map<string, string>
): { correct: number; pct: number } | null {
  if (answerKey.size === 0) return null;

  let correct = 0;
  for (const a of answers) {
    const expected = answerKey.get(a.question_id);
    if (!expected) continue;
    const given = a.answer_text ?? (Array.isArray(a.selected_options) ? a.selected_options[0] : null);
    if (given === expected) correct += 1;
  }

  return { correct, pct: Math.round((correct / answerKey.size) * 100) };
}

export const delta = (pre: number | null, post: number | null): number | null =>
  pre !== null && post !== null ? round1(post - pre) : null;
