/**
 * Scoring rules for event pre/post surveys.
 *
 * Pre/post surveys carry no answer key, so the only value comparable between
 * them is the shared set of 1-5 rating questions. The quiz is the only survey
 * scored against `survey_questions.correct_answer`.
 */

export type ScoringAnswer = {
  question_id: string;
  answer_text: string | null;
  answer_value: unknown;
  selected_options: unknown;
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Average of the rating answers (1-5). Returns null when the respondent
 * answered none of them, so "no data" never collapses into a misleading 0.
 */
export function averageRating(answers: ScoringAnswer[], ratingQuestionIds: Set<string>): number | null {
  const vals = answers
    .filter((a) => ratingQuestionIds.has(a.question_id))
    .map((a) => Number(a.answer_value))
    .filter((v) => Number.isFinite(v) && v > 0);

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
