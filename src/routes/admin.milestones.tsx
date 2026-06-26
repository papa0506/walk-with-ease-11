import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ruler, CheckCircle, Circle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminSaveMilestone, adminListMilestones } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/milestones")({
  head: () => ({ meta: [{ title: "거리 표지 보정 · 관리자" }] }),
  component: Milestones,
});

const ENTRANCES = [
  { code: "NTH_THEATER",  label: "국립극장 기준" },
  { code: "NTH_CABLECAR", label: "케이블카 입구 기준" },
];
const DIRS = [
  { code: "THEATER_TO_CABLECAR", label: "국립극장 → 케이블카" },
  { code: "CABLECAR_TO_THEATER", label: "케이블카 → 국립극장" },
  { code: "UNSPEC",              label: "방향 무관" },
] as const;
type SurveyDir = "THEATER_TO_CABLECAR" | "CABLECAR_TO_THEATER" | "UNSPEC";

const METERS = [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000];

function Milestones() {
  const [basis, setBasis]     = useState("NTH_THEATER");
  const [meter, setMeter]     = useState(200);
  const [dir, setDir]         = useState<SurveyDir>("UNSPEC");
  const [msg, setMsg]         = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const saveFn   = useServerFn(adminSaveMilestone);
  const listFn   = useServerFn(adminListMilestones);

  const { data: existing = [], refetch } = useQuery({
    queryKey: ["milestones"],
    queryFn: () => listFn(),
  });

  // 이미 기록된 거리 집합 (빠른 조회용)
  const savedMeters = new Set(existing.map((m: any) => `${(m.basis_entrance as any)?.code}:${m.meter}:${m.survey_direction}`));

  function record() {
    setMsg(null); setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await saveFn({ data: {
            basis_entrance_code: basis,
            meter,
            survey_direction: dir,
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
          }});
          setMsg(`저장됨: ${basis} 기준 ${meter}m (정확도 약 ${Math.round(p.coords.accuracy)}m)`);
          await refetch();
        } catch (e: unknown) { setMsg("오류: " + (e instanceof Error ? e.message : "저장 실패")); }
        finally { setBusy(false); }
      },
      (e) => { setMsg(`위치 실패: ${e.message}`); setBusy(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const key = `${basis}:${meter}:${dir}`;
  const alreadySaved = savedMeters.has(key);

  return (
    <AppShell
      title="200m 거리 표지 보정"
      back={{ to: "/admin" }}
      bottomAction={
        <button className="btn-primary" onClick={record} disabled={busy}>
          <Ruler aria-hidden size={26} />
          {busy ? "기록 중..." : alreadySaved ? `${meter}m 표지 덮어쓰기` : `현재 위치를 ${meter}m 표지로 기록`}
        </button>
      }
    >
      <StatusCard tone="info" icon={<Ruler aria-hidden size={28} />}
        eyebrow="안내"
        title="현장 측정 보정값 저장"
        description="미검증 중복값은 자동으로 교체됩니다. verified=true 인 값은 보호됩니다." />

      {/* 기준 입구 */}
      <fieldset className="space-y-2">
        <legend className="text-lg font-extrabold">기준 입구</legend>
        {ENTRANCES.map((e) => (
          <label key={e.code} className="status-card flex items-center gap-3 cursor-pointer"
            style={basis === e.code ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
            <input type="radio" name="basis" className="h-6 w-6"
              checked={basis === e.code} onChange={() => setBasis(e.code)} />
            <span className="text-lg font-extrabold">{e.label}</span>
          </label>
        ))}
      </fieldset>

      {/* 측량 방향 */}
      <fieldset className="space-y-2">
        <legend className="text-lg font-extrabold">측량 방향</legend>
        {DIRS.map((d) => (
          <label key={d.code} className="status-card flex items-center gap-3 cursor-pointer"
            style={dir === d.code ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
            <input type="radio" name="dir" className="h-6 w-6"
              checked={dir === d.code} onChange={() => setDir(d.code)} />
            <span className="text-lg font-extrabold">{d.label}</span>
          </label>
        ))}
      </fieldset>

      {/* 거리 선택 */}
      <fieldset>
        <legend className="mb-2 text-lg font-extrabold">거리</legend>
        <div className="grid grid-cols-3 gap-2">
          {METERS.map((m) => {
            const mKey = `${basis}:${m}:${dir}`;
            const saved = savedMeters.has(mKey);
            return (
              <button key={m} type="button"
                onClick={() => setMeter(m)}
                aria-pressed={meter === m}
                aria-label={`${m}m${saved ? ", 이미 기록됨" : ""}`}
                className="relative min-h-16 rounded-xl border-2 border-foreground text-xl font-extrabold"
                style={meter === m
                  ? { background: "var(--foreground)", color: "var(--background)" }
                  : { background: "var(--card)", color: "var(--foreground)" }}>
                {m}m
                {saved && (
                  <span className="absolute right-1 top-1">
                    <CheckCircle size={14} aria-hidden className="text-green-500" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <CheckCircle size={12} className="mr-1 inline text-green-500" aria-hidden />표시: 이미 기록된 표지
        </p>
      </fieldset>

      {/* 결과 메시지 */}
      {msg && (
        <p role="status" aria-live="polite"
          className={`rounded-xl border-2 border-foreground px-4 py-3 text-lg font-bold ${msg.startsWith("오류") ? "bg-[var(--danger)] text-[var(--danger-foreground)]" : "bg-card"}`}>
          {msg}
        </p>
      )}

      {/* 기록된 마일스톤 목록 */}
      {existing.length > 0 && (
        <section aria-label="기록된 거리 표지 목록" className="space-y-2">
          <h2 className="text-lg font-extrabold">기록된 거리 표지 ({existing.length}개)</h2>
          <div className="space-y-2">
            {existing.map((m: any) => (
              <div key={m.id} className="status-card flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold">
                    {m.meter}m — {(m.basis_entrance as any)?.name ?? m.basis_entrance}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.survey_direction} · 정확도 {m.accuracy != null ? `약 ${Math.round(m.accuracy)}m` : "—"}
                    {m.measured_at ? ` · ${new Date(m.measured_at).toLocaleString("ko-KR")}` : ""}
                  </p>
                </div>
                {m.verified
                  ? <CheckCircle size={22} aria-label="검증됨" className="shrink-0 text-green-500" />
                  : <Circle size={22} aria-label="미검증" className="shrink-0 text-muted-foreground" />
                }
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
