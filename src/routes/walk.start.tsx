import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Footprints, MapPin, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe } from "@/hooks/useMe";
import { startWalk } from "@/lib/namsan.functions";

export const Route = createFileRoute("/walk/start")({
  head: () => ({ meta: [{ title: "산책 시작 · 남산 산책" }] }),
  component: WalkStart,
});

type Choice = "NTH_THEATER" | "NTH_CABLECAR" | "CURRENT";

function WalkStart() {
  const { data: me } = useMe();
  const [choice, setChoice] = useState<Choice>("NTH_THEATER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startFn = useServerFn(startWalk);
  const navigate = useNavigate();
  const isApproved = me?.status === "APPROVED";

  return (
    <AppShell
      title="산책 시작"
      back={{ to: "/" }}
      bottomAction={
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setErr(null); setBusy(true);
            try {
              if (isApproved) {
                const r = await startFn({
                  data: { startEntranceCode: choice === "CURRENT" ? null : choice },
                });
                navigate({ to: "/walk", search: { walkId: r.walkId } as never });
              } else {
                // 비로그인/PENDING: 세션 저장 없이 안내만 시작
                navigate({ to: "/walk", search: {} as never });
              }
            } catch (e: unknown) {
              setErr(e instanceof Error ? e.message : "산책 시작 실패");
            } finally { setBusy(false); }
          }}
          aria-label="산책 시작"
        >
          <Footprints aria-hidden size={28} />
          {busy ? "시작 중..." : "산책 시작"}
        </button>
      }
    >
      <StatusCard
        tone="info" icon={<MapPin aria-hidden size={28} />}
        eyebrow="위치 권한"
        title="산책 중 위치 권한이 필요합니다"
        description="다음 화면에서 위치 권한을 요청합니다. 위치 정보는 본인 산책 안내 외에는 공유되지 않습니다."
      />

      <StatusCard
        tone="warning" icon={<AlertTriangle aria-hidden size={28} />}
        eyebrow="안내"
        title="미검증 남산 데이터는 안내에 사용되지 않습니다"
        description="관리자가 현장에서 검증한 입구·거리 표지만 음성 안내에 사용됩니다."
      />

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-extrabold">출발 위치 선택</legend>
        <RadioRow id="r1" name="start" checked={choice === "NTH_THEATER"} onChange={() => setChoice("NTH_THEATER")}
          title="국립극장 입구에서 출발" subtitle="북측순환로 동쪽 시작점" />
        <RadioRow id="r2" name="start" checked={choice === "NTH_CABLECAR"} onChange={() => setChoice("NTH_CABLECAR")}
          title="북측순환로 입구, 남산케이블카 방면에서 출발" subtitle="북측순환로 서쪽 시작점" />
        <RadioRow id="r3" name="start" checked={choice === "CURRENT"} onChange={() => setChoice("CURRENT")}
          title="현재 위치에서 출발" subtitle="가장 가까운 기준점을 자동으로 찾습니다 (다음 단계)" />
      </fieldset>

      {err && (
        <p role="alert" className="rounded-xl border-2 border-foreground bg-[var(--danger)] px-4 py-3 text-lg font-bold text-[var(--danger-foreground)]">
          {err}
        </p>
      )}
    </AppShell>
  );
}

function RadioRow({
  id, name, checked, onChange, title, subtitle,
}: { id: string; name: string; checked: boolean; onChange: () => void; title: string; subtitle: string }) {
  return (
    <label htmlFor={id}
      className="status-card flex items-start gap-4 cursor-pointer"
      style={checked ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 h-6 w-6" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base opacity-90">{subtitle}</p>
      </div>
    </label>
  );
}
