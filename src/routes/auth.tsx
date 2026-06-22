import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { login, signup } from "@/lib/namsan.functions";
import { useInvalidateMe } from "@/hooks/useMe";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "로그인 · 남산 산책" }] }),
  component: AuthScreen,
});

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loginFn = useServerFn(login);
  const signupFn = useServerFn(signup);
  const invalidate = useInvalidateMe();
  const navigate = useNavigate();

  async function handleAuthSubmit() {
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanPin = pin.trim();
    if (!cleanPhone || !cleanPin || (mode === "signup" && !cleanName)) {
      setErr(mode === "login" ? "전화번호와 비밀번호를 입력해 주세요." : "이름, 전화번호, 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setErr(null); setBusy(true);
    try {
      if (mode === "login") {
        const r = await loginFn({ data: { name: cleanName, phone: cleanPhone, pin: cleanPin } });
        if (r.error || !r.user) {
          setErr(r.error ?? "로그인에 실패했습니다.");
          return;
        }
        await invalidate();
        navigate({ to: r.user.status === "APPROVED" ? "/" : "/auth/pending" });
      } else {
        await signupFn({ data: { name: cleanName, phone: cleanPhone, pin: cleanPin, pinConfirm: pin2.trim() } });
        await invalidate();
        navigate({ to: "/auth/pending" });
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void handleAuthSubmit();
  }

  return (
    <AppShell
      title={mode === "login" ? "로그인" : "회원가입"}
      back={{ to: "/" }}
      bottomAction={
        <button
          type="button"
          onClick={() => void handleAuthSubmit()}
          className="btn-primary"
          disabled={busy}
          aria-label={mode === "login" ? "로그인" : "회원가입 요청"}
        >
          {mode === "login" ? <LogIn aria-hidden size={28} /> : <UserPlus aria-hidden size={28} />}
          {busy ? "처리 중..." : mode === "login" ? "로그인" : "회원가입 요청"}
        </button>
      }
    >

      <div role="tablist" aria-label="로그인 또는 회원가입 선택"
        className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-foreground bg-muted p-1">
        <TabBtn active={mode === "login"} onClick={() => setMode("login")}>로그인</TabBtn>
        <TabBtn active={mode === "signup"} onClick={() => setMode("signup")}>회원가입</TabBtn>
      </div>

      <form id="auth-form" className="space-y-3" onSubmit={submit}>
        <Field id="name" label="이름" value={name} onChange={setName} autoComplete="name" />
        <Field
          id="phone" label="전화번호" value={phone} onChange={setPhone}
          type="tel" autoComplete="tel" inputMode="numeric"
          hint="숫자만 입력해도 됩니다. 예: 01012345678"
        />
        <Field
          id="pin" label="비밀번호 (4자리 숫자)" value={pin} onChange={setPin}
          type="password" inputMode="numeric" maxLength={4}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "signup" && (
          <Field
            id="pin2" label="비밀번호 확인" value={pin2} onChange={setPin2}
            type="password" inputMode="numeric" maxLength={4} autoComplete="new-password"
          />
        )}
        <div role="alert" aria-live="assertive" aria-atomic="true" className="min-h-[1px]">
          {err && (
            <p className="rounded-xl border-2 border-foreground bg-[var(--danger)] px-4 py-3 text-lg font-bold text-[var(--danger-foreground)]">
              {err}
            </p>
          )}
        </div>
      </form>
    </AppShell>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className="min-h-14 rounded-xl text-lg font-extrabold"
      style={active ? { background: "var(--foreground)", color: "var(--background)" } : { background: "transparent", color: "var(--foreground)" }}>
      {children}
    </button>
  );
}

function Field({
  id, label, value, onChange, type = "text", autoComplete, hint, inputMode, maxLength,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; autoComplete?: string; hint?: string;
  inputMode?: "text" | "numeric" | "tel"; maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-lg font-extrabold">{label}</label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-14 w-full rounded-xl border-2 border-foreground bg-card px-4 text-lg font-semibold text-foreground outline-none"
      />
      {hint && <p id={`${id}-hint`} className="mt-2 text-base text-muted-foreground">{hint}</p>}
    </div>
  );
}
