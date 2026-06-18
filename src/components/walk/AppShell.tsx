import type { ReactNode } from "react";

interface Props {
  title: string;
  back?: { to: string; label?: string };
  children: ReactNode;
  /** 화면 하단 고정 액션 영역 */
  bottomAction?: ReactNode;
  /** 헤더 우상단 액션 (예: 로그인 / 로그아웃) */
  topRight?: ReactNode;
}

export function AppShell({ title, back, children, bottomAction, topRight }: Props) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <div
        role="note"
        aria-label="비공개 릴리즈 후보 버전"
        className="border-b-2 border-foreground bg-secondary px-4 py-2 text-center text-sm font-bold text-secondary-foreground"
      >
        비공개 릴리즈 후보 · 테스트 전용
      </div>

      <header className="px-5 pb-3 pt-5">
        {back ? (
          <a
            href={back.to}
            className="mb-3 inline-flex min-h-11 items-center gap-2 text-base font-bold underline underline-offset-4"
            aria-label={back.label ?? "이전 화면으로"}
          >
            ← 뒤로
          </a>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight whitespace-pre-line">{title}</h1>
          {topRight ? <div className="shrink-0 pt-1">{topRight}</div> : null}
        </div>
      </header>

      <main id="main" className="flex-1 space-y-4 px-5 pb-40 pt-2">
        {children}
      </main>

      {bottomAction ? (
        <div
          role="region"
          aria-label="주요 동작"
          className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t-2 border-foreground bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {bottomAction}
        </div>
      ) : null}
    </div>
  );
}
