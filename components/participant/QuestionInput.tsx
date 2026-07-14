"use client";

import { INK, INK_SOFT, ORANGE, CREAM, LINE, MUTED } from "./Shell";

export type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: boolean;
};

export type AnswerPatch = {
  answerText?: string;
  answerValue?: string | number;
  selectedOptions?: string[];
};

export function QuestionCard({
  index, question, value, onChange,
}: {
  index: number;
  question: Question;
  value?: AnswerPatch;
  onChange: (patch: AnswerPatch) => void;
}) {
  return (
    <div className="border-2 bg-white p-5" style={{ borderColor: INK, boxShadow: `5px 5px 0 ${LINE}` }}>
      <p className="mb-4 text-sm font-extrabold leading-snug" style={{ color: INK }}>
        <span style={{ color: ORANGE }}>{String(index + 1).padStart(2, "0")}.</span> {question.question_text}
        {question.is_required && <span style={{ color: "#C2260E" }}> *</span>}
      </p>
      <QuestionInput question={question} value={value} onChange={onChange} />
    </div>
  );
}

function QuestionInput({
  question, value, onChange,
}: {
  question: Question;
  value?: AnswerPatch;
  onChange: (patch: AnswerPatch) => void;
}) {
  const opts = Array.isArray(question.options) ? question.options : [];

  if (question.question_type === "checkbox") {
    const selected = new Set(value?.selectedOptions ?? []);
    return (
      <div className="flex flex-col gap-2">
        {opts.map((opt) => (
          <Choice
            key={opt}
            selected={selected.has(opt)}
            shape="square"
            label={opt}
            onClick={() => {
              const next = new Set(selected);
              if (next.has(opt)) next.delete(opt);
              else next.add(opt);
              onChange({ selectedOptions: Array.from(next) });
            }}
          />
        ))}
      </div>
    );
  }

  if (["multiple_choice", "yes_no", "dropdown"].includes(question.question_type)) {
    const current = value?.answerText ?? value?.answerValue;
    return (
      <div className="flex flex-col gap-2">
        {opts.map((opt) => (
          <Choice
            key={opt}
            selected={current === opt}
            shape="round"
            label={opt}
            onClick={() => onChange({ answerText: opt, answerValue: opt, selectedOptions: [opt] })}
          />
        ))}
      </div>
    );
  }

  if (question.question_type === "rating" || question.question_type === "nps") {
    const current = Number(value?.answerValue ?? 0);
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              onClick={() => onChange({ answerValue: num, answerText: String(num) })}
              aria-pressed={current === num}
              className="h-12 w-12 border-2 text-base font-extrabold transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
              style={{
                borderColor: INK,
                background: current === num ? ORANGE : CREAM,
                color: INK,
                boxShadow: current === num ? "none" : `3px 3px 0 ${LINE}`,
              }}
            >
              {num}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold uppercase" style={{ color: MUTED }}>
          <span>1 — Sangat rendah</span>
          <span>5 — Sangat tinggi</span>
        </div>
      </div>
    );
  }

  return (
    <textarea
      value={value?.answerText ?? ""}
      onChange={(e) => onChange({ answerText: e.target.value })}
      placeholder="Ketik jawaban Anda..."
      rows={3}
      className="w-full border-2 px-3 py-2 text-sm outline-none"
      style={{ borderColor: INK, background: CREAM, color: INK }}
    />
  );
}

function Choice({
  selected, label, onClick, shape,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  shape: "round" | "square";
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="flex items-center gap-3 border-2 px-4 py-2.5 text-left text-sm transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
      style={{
        borderColor: INK,
        background: selected ? CREAM : "#FFFFFF",
        color: selected ? INK : INK_SOFT,
        fontWeight: selected ? 800 : 400,
        boxShadow: selected ? `3px 3px 0 ${ORANGE}` : "none",
      }}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 ${shape === "round" ? "rounded-full" : ""}`}
        style={{ borderColor: INK, background: selected ? ORANGE : "transparent" }}
        aria-hidden
      />
      {label}
    </button>
  );
}
