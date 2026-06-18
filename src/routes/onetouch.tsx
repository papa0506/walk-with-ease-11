import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneCall, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe } from "@/hooks/useMe";
import { createOnetouchHandoff } from "@/lib/namsan.functions";

export const Route = createFileRoute("/onetouch")({
  head: () => ({ meta: [{ title: "원터치 복지콜 · 남산 산책" }] }),
  component: Onetouch,
});

const PICKUPS = [
  { code: "NTH_THEATER", label: "국립극장 입구" },
  { code: "NTH_CABLECAR", label: "북측순환로 입구, 남산케이블카 방면" },
];

function Onetouch() {
  const { data: me } = useMe();
  const [pickup, setPickup] = useState("NTH_THEATER");
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(createOnetouchHandoff);
  const navigate = useNavigate();

  if (me && me.status !== "APPROVED") {
    return (
      <AppShell title="접근 제한" back={{ to: "/" }}>
        <StatusCard tone="warning" icon={<AlertTriangle aria-hidden size={28} />}
          title="승인된 사용자만 사용할 수 있습니다" />
      </AppShell>
    );
  }

  async function submit() {
    setErr(null); setBusy(true);
    try {
      const r = await fn({ data: { pickupEntranceCode: pickup } });
      setToken(r.handoff_token);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "실패"); }
    finally { setBusy(false); }
  }

  return (
    <AppShell title="원터치 복지콜" back={{ to: "/" }}
      bottomAction={
        token
          ? <button className="btn-secondary" onClick={() => navigate({ to: "/" })}>홈으로</button>
          : <button className="btn-primary" onClick={submit} disabled={busy}>
              <PhoneCall aria-hidden size={26} /> {busy ? "준비 중..." : "픽업 요청 준비"}
            </button>
      }>
      <StatusCard tone="info" icon={<PhoneCall aria-hidden size={28} />}
        eyebrow="안내"
        title="픽업 위치만 선택합니다"
        description="실제 복지콜 외부 연동은 다음 단계입니다. 지금은 핸드오프 토큰만 생성합니다." />

      <fieldset className="space-y-2">
        <legend className="text-lg font-extrabold">픽업 입구 선택</legend>
        {PICKUPS.map((p) => (
          <label key={p.code} className="status-card flex items-center gap-3"
            style={pickup === p.code ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
            <input type="radio" name="pickup" className="h-6 w-6"
              checked={pickup === p.code} onChange={() => setPickup(p.code)} />
            <span className="text-lg font-extrabold">{p.label}</span>
          </label>
        ))}
      </fieldset>

      {token && (
        <StatusCard tone="success" icon={<PhoneCall aria-hidden size={28} />}
          eyebrow="준비됨"
          title="핸드오프 토큰 생성됨"
          description={`token: ${token.slice(0, 12)}… (실제 외부 연동은 다음 단계)`} />
      )}
      {err && (
        <p role="alert" className="rounded-xl border-2 border-foreground bg-[var(--danger)] px-4 py-3 font-bold text-[var(--danger-foreground)]">{err}</p>
      )}
    </AppShell>
  );
}
