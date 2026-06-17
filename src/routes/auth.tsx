import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, UserPlus, Mail } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "로그인 · UI 시안" }] }),
  component: AuthScreen,
});

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");

  return (
    <AppShell
      title={mode === "login" ? "로그인" : "회원가입"}
      back={{ to: "/" }}
      bottomAction={
        mode === "login" ? (
          <Link
            to="/auth/pending"
            className="btn-primary"
            aria-label="로그인 (시안: 다음 화면으로 이동)"
          >
            <LogIn aria-hidden="true" size={28} />
            로그인
          </Link>
        ) : (
          <Link
            to="/auth/pending"
            className="btn-primary"
            aria-label="회원가입 후 승인 대기 화면으로"
          >
            <UserPlus aria-hidden="true" size={28} />
            회원가입 요청
          </Link>
        )
      }
    >
      <StatusCard
        tone="info"
        icon={<Mail aria-hidden="true" size={28} />}
        eyebrow="중요"
        title="승인된 사용자만 사용할 수 있어요"
        description="회원가입 후 관리자의 승인이 필요합니다. 위치 공유는 기본적으로 비공개입니다."
      />

      <div
        role="tablist"
        aria-label="로그인 또는 회원가입 선택"
        className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-foreground bg-muted p-1"
      >
        <TabBtn active={mode === "login"} onClick={() => setMode("login")}>
          로그인
        </TabBtn>
        <TabBtn active={mode === "signup"} onClick={() => setMode("signup")}>
          회원가입
        </TabBtn>
      </div>

      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        {mode === "signup" && (
          <Field id="name" label="이름" type="text" autoComplete="name" />
        )}
        <Field id="email" label="이메일" type="email" autoComplete="email" />
        <Field
          id="password"
          label="비밀번호"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "signup" && (
          <Field
            id="phone"
            label="연락처 (선택)"
            type="tel"
            autoComplete="tel"
            hint="긴급 상황 시 보호자 연락용으로만 사용됩니다."
          />
        )}
      </form>

      <p className="px-1 text-base text-muted-foreground">
        이 시안에서는 실제 인증이 동작하지 않습니다. 다음 버튼은 승인 대기 화면으로 이동합니다.
      </p>
    </AppShell>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="min-h-14 rounded-xl text-lg font-extrabold"
      style={
        active
          ? { background: "var(--foreground)", color: "var(--background)" }
          : { background: "transparent", color: "var(--foreground)" }
      }
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  type,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-lg font-extrabold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-14 w-full rounded-xl border-2 border-foreground bg-card px-4 text-lg font-semibold text-foreground outline-none"
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-2 text-base text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
