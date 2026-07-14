"use client";

import type { ReactNode } from "react";

/**
 * Participant-facing shell (attendance + public survey).
 *
 * Deliberately unlike the admin dashboard: this is read by UMKM owners on a
 * phone in a training room, not by staff at a desk. Palette follows the house
 * light theme - navy ink, orange accent, cool-light surface.
 */
export const INK = "#0A2647";
export const INK_SOFT = "#51617A";
export const MUTED = "#8A97A8";
export const ORANGE = "#FF7A00";
export const ORANGE_INK = "#DB6400";
export const CREAM = "#FEF6EE";
export const PANEL = "#EEF2F8";
export const LINE = "#E5E9F1";

const FONT = "var(--font-geist-sans), Inter, system-ui, -apple-system, sans-serif";

export type Brand = {
  companyName: string | null;
  logoUrl: string | null;
  instagram: string | null;
};

export function Shell({
  brand, kicker, tag, steps, currentStep, children,
}: {
  brand: Brand;
  kicker: string;
  /** Word after the company name, e.g. ABSENSI or SURVEY. */
  tag: string;
  steps: { n: string; label: string; hint: string }[];
  currentStep: number;
  children: ReactNode;
}) {
  const active = steps[Math.min(currentStep, steps.length - 1)];

  return (
    <div className="min-h-screen px-3 py-6 sm:px-6 sm:py-10" style={{ background: "#F4F6FA", fontFamily: FONT }}>
      <div
        className="mx-auto w-full max-w-5xl border-2 bg-white"
        style={{ borderColor: INK, boxShadow: `10px 10px 0 ${INK}` }}
      >
        <Header brand={brand} kicker={kicker} tag={tag} />

        <div className="grid md:grid-cols-[280px_1fr]">
          <aside
            className="border-b-2 px-6 py-8 md:border-b-0 md:border-r-2"
            style={{ background: PANEL, borderColor: INK }}
          >
            <StepIndicator steps={steps} current={currentStep} />
            <div className="mt-6 text-center">
              <p className="text-base font-extrabold tracking-wide" style={{ color: INK }}>
                {active.label}
              </p>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: INK_SOFT }}>
                {active.hint}
              </p>
            </div>
          </aside>

          <main className="px-6 py-8 sm:px-10 sm:py-12">{children}</main>
        </div>

        <Footer brand={brand} />
      </div>
    </div>
  );
}

function Header({ brand, kicker, tag }: { brand: Brand; kicker: string; tag: string }) {
  return (
    <header
      className="flex flex-col gap-4 border-b-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"
      style={{ borderColor: INK }}
    >
      <div className="flex items-center gap-3">
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.companyName ?? ""}
            className="h-11 w-11 border-2 object-cover"
            style={{ borderColor: INK }}
          />
        )}
        <div>
          <h1 className="text-xl font-extrabold uppercase leading-none tracking-tight sm:text-2xl" style={{ color: INK }}>
            {brand.companyName ?? "Impact Plus"}{" "}
            <span className="italic" style={{ color: ORANGE }}>{tag}</span>
          </h1>
          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: INK_SOFT }}>
            {kicker}
          </p>
        </div>
      </div>

      {brand.instagram && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: MUTED }}>Instagram</p>
            <p className="text-sm font-extrabold" style={{ color: INK }}>@{brand.instagram.replace(/^@/, "")}</p>
          </div>
          <span
            className="flex h-9 w-9 items-center justify-center border-2 text-lg"
            style={{ borderColor: INK, color: INK }}
            aria-hidden
          >
            ◎
          </span>
        </div>
      )}
    </header>
  );
}

function StepIndicator({ steps, current }: { steps: { n: string }[]; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const isNow = i === current;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center rounded-full border-2 font-extrabold italic transition-all ${
                isNow ? "h-16 w-16 text-xl" : "h-9 w-9 text-xs"
              }`}
              style={{
                borderColor: INK,
                background: isNow ? "#FFFFFF" : done ? INK : "transparent",
                color: done ? "#FFFFFF" : INK,
                opacity: isNow || done ? 1 : 0.35,
              }}
            >
              {done ? "✓" : s.n}
            </span>
            {i < steps.length - 1 && (
              <span className="h-0.5 w-3" style={{ background: INK, opacity: done ? 1 : 0.25 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Footer({ brand }: { brand: Brand }) {
  return (
    <footer
      className="flex flex-col gap-1 border-t-2 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.06em] sm:flex-row sm:items-center sm:justify-between sm:px-8"
      style={{ background: INK, borderColor: INK, color: "#FFFFFF" }}
    >
      <span style={{ opacity: 0.85 }}>
        © {new Date().getFullYear()} {brand.companyName ?? "Impact Plus"} — Business Growth Accelerator
      </span>
      <span style={{ opacity: 0.6 }}>Powered by MWX Market AI Analysis</span>
    </footer>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <h2 className="text-3xl font-extrabold uppercase leading-none tracking-tight sm:text-4xl" style={{ color: INK }}>
        {title}
      </h2>
      {subtitle && <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>{subtitle}</p>}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em]" style={{ color: INK }}>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full border-2 px-4 py-3 text-sm outline-none transition focus:translate-x-[2px] focus:translate-y-[2px]"
      style={{ borderColor: INK, background: CREAM, color: INK, boxShadow: `4px 4px 0 ${LINE}` }}
    />
  );
}

export function PrimaryButton({
  children, onClick, disabled, type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full border-2 px-6 py-3.5 text-sm font-extrabold uppercase tracking-[0.08em] transition-all enabled:hover:translate-x-[2px] enabled:hover:translate-y-[2px] enabled:hover:shadow-none"
      style={{
        borderColor: INK,
        background: disabled ? MUTED : ORANGE,
        color: disabled ? "#FFFFFF" : INK,
        boxShadow: disabled ? "none" : `5px 5px 0 ${INK}`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border-2 bg-white px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.08em] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
      style={{ borderColor: INK, color: INK, boxShadow: `4px 4px 0 ${LINE}` }}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <div className="my-6 border-t-2 border-dashed" style={{ borderColor: LINE }} />;
}

export function NoteBox({ icon = "?", children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center border-2 text-sm font-extrabold"
        style={{ borderColor: ORANGE, background: CREAM, color: ORANGE_INK }}
        aria-hidden
      >
        {icon}
      </span>
      <p className="text-[11px] italic leading-relaxed" style={{ color: MUTED }}>{children}</p>
    </div>
  );
}

export function Callout({
  tone = "warn", title, children,
}: {
  tone?: "warn" | "ok";
  title: string;
  children?: ReactNode;
}) {
  const accent = tone === "ok" ? "#0D7377" : ORANGE_INK;
  return (
    <div
      className="border-2 p-5"
      style={{ borderColor: accent, background: tone === "ok" ? "#E9F5F5" : CREAM, boxShadow: `5px 5px 0 ${LINE}` }}
    >
      <p className="text-base font-extrabold uppercase tracking-wide" style={{ color: accent }}>{title}</p>
      {children && <div className="mt-2 text-sm" style={{ color: INK_SOFT }}>{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      className="border-2 px-3 py-2 text-xs font-bold"
      style={{ borderColor: "#C2260E", background: "#FDECEA", color: "#C2260E" }}
      role="alert"
    >
      {children}
    </p>
  );
}
