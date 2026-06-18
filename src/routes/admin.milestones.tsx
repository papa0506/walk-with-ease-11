import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Ruler } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminSaveMilestone } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/milestones")({
  head: () => ({ meta: [{ title: "거리 표지 보정 · 관리자" }] }),
  component: Milestones,
});

const ENTRANCES = [
  { code: "NTH_THEATER", label: "국립극장 입구 기준" },
  { code: "NTH_CABLECAR", label: "북측순환로 입구(케이블카 방면) 기준" },
];
const METERS = [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000];

function Milestones() {
  const [basis, setBasis] = useState("NTH_THEATER");
  const [meter, setMeter] = useState(200);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saveFn = useServerFn(adminSaveMilestone);

  function record() {
    setMsg(null); setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await saveFn({ data: {
            basis_entrance_code: basis, meter,
            survey_direction: "UNSPEC",
            lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy,
          }});
          setMsg(`${basis} 기준 ${meter}m 보정 저장됨 (FIELD_MEASURED, verified=false)`);
        } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "실패"); }
        finally { setBusy(false); }
      },
      (e) => { setMsg(`위치 실패: ${e.message}`); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <AppShell title="200m 거리 표지 보정" back={{ to: "/admin" }}
      bottomAction={
        <button className="btn-primary" onClick={record} disabled={busy}>
          <Ruler aria-hidden size={26} /> {busy ? "기록 중..." : "현재 위치를 이 거리 표지로 보정"}
        </button>
      }>
      <StatusCard tone="info" icon={<Ruler aria-hidden size={28} />}
        eyebrow="안내"
        title="현장 측정 보정값 저장"
        description="verification_status=FIELD_MEASURED, verified=false 로 저장됩니다." />

      <fieldset className="space-y-2">
        <legend className="text-lg font-extrabold">기준 입구</legend>
        {ENTRANCES.map((e) => (
          <label key={e.code} className="status-card flex items-center gap-3"
            style={basis === e.code ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
            <input type="radio" name="basis" className="h-6 w-6"
              checked={basis === e.code} onChange={() => setBasis(e.code)} />
            <span className="text-lg font-extrabold">{e.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-extrabold">거리</legend>
        <div className="grid grid-cols-3 gap-2">
          {METERS.map((m) => (
            <button key={m} type="button"
              onClick={() => setMeter(m)}
              aria-pressed={meter === m}
              className="min-h-16 rounded-xl border-2 border-foreground text-xl font-extrabold"
              style={meter === m
                ? { background: "var(--foreground)", color: "var(--background)" }
                : { background: "var(--card)", color: "var(--foreground)" }}>
              {m}m
            </button>
          ))}
        </div>
      </fieldset>

      {msg && (
        <p role="status" className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">{msg}</p>
      )}
    </AppShell>
  );
}
