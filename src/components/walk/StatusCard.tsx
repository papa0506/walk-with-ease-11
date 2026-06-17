import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<Tone, { bg: string; fg: string; label: string }> = {
  neutral: { bg: "var(--card)", fg: "var(--foreground)", label: "안내" },
  success: { bg: "var(--success)", fg: "var(--success-foreground)", label: "정상" },
  warning: { bg: "var(--warning)", fg: "var(--warning-foreground)", label: "주의" },
  danger:  { bg: "var(--danger)",  fg: "var(--danger-foreground)",  label: "위험" },
  info:    { bg: "var(--info)",    fg: "var(--info-foreground)",    label: "정보" },
};

interface Props {
  tone?: Tone;
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  ariaLabel?: string;
}

/**
 * 색상에만 의존하지 않도록 [아이콘 + 텍스트 라벨 + 색상]을 항상 함께 표시.
 */
export function StatusCard({
  tone = "neutral",
  icon,
  eyebrow,
  title,
  description,
  children,
  ariaLabel,
}: Props) {
  const s = toneStyles[tone];
  return (
    <section
      role="group"
      aria-label={ariaLabel ?? `${s.label}: ${title}`}
      className="status-card"
      style={{ background: s.bg, color: s.fg }}
    >
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2"
          style={{ borderColor: "currentColor" }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wider opacity-90">
            {eyebrow ?? s.label}
          </p>
          <h3 className="mt-1 text-2xl font-extrabold leading-tight">{title}</h3>
          {description ? (
            <p className="mt-2 text-lg leading-snug">{description}</p>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
