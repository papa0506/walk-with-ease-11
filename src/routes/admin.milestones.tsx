import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ruler, CheckCircle, Circle, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminSaveMilestone, adminListMilestones } from "@/lib/namsan.functions";
import { useGpsAverage } from "@/hooks/useGpsAverage";

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
const TARGET_SAMPLES = 20; // 20개 샘플 평균

function Milestones() {
  const [basis, setBasis] = useState("NTH_THEATER");
  const [meter, setMeter] = useState(200);
  const [dir,   setDir]   = useState<SurveyDir>("UNSPEC");
  const [msg,   setMsg]   = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);

  const saveFn  = useServerFn(adminSaveMilestone);
  const listFn  = useServerFn(adminListMilestones);
  const gps     = useGpsAverage(TARGET_SAMPLES);

  const { data: existing = [], refetch } = useQuery({
    queryKey: ["milestones"],
    queryFn: () => listFn(),
  });

  const savedMeters = new Set(
    existing.map((m: any) => `${(m.basis_entrance as any)?.code}:${m.meter}:${m.survey_direction}`)
  );

  async function saveWithResult() {
    if (!gps.result) return;
    setBusy(true); setMsg(null);
    try {
      await saveFn({ data: {
        basis_entrance_code: basis,
        meter,
        survey_direction: dir,
        lat: gps.result.lat,
        lng: gps.result.lng,
        accuracy: gps.result.accuracy,
      }});
      setMsg(
        `✓ 저장됨: ${basis} / ${meter}m\n` +
        `샘플 ${gps.result.sampleCount}개 평균 · 추정 오차 ${gps.result.accuracy.toFixed(1)}m (${confidenceKo(gps.result.confidence)})`
      );
      await refetch();
      gps.stop();
    } catch (e: unknown) {
      setMsg("오류: " + (e instanceof Error ? e.message : "저장 실패"));
    } finally { setBusy(false); }
  }

  function startCollecting() {
    setMsg(null);
    gps.start();
  }

  const key = `${basis}:${meter}:${dir}`;
  const alreadySaved = savedMeters.has(key);
  const isCollecting = gps.status === "collecting";
  const isDone       = gps.status === "done";

  return (
    <AppShell
      title="200m 거리 표지 보정"
      back={{ to: "/admin" }}
      bottomAction={
        isDone ? (
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-secondary" onClick={startCollecting} disabled={busy}>
              <RefreshCw aria-hidden size={20} /> 재측정
            </button>
            <button className="btn-primary" onClick={saveWithResult} disabled={busy}>
              <Ruler aria-hidden size={22} />
              {busy ? "저장 중..." : `${meter}m 저장`}
            </button>
          </div>
        ) : (
          <button
            className="btn-primary"
            onClick={startCollecting}
            disabled={isCollecting}
          >
            <Ruler aria-hidden size={26} />
            {isCollecting
              ? `샘플 수집 중 ${gps.progress}/${TARGET_SAMPLES}…`
              : alreadySaved ? `${meter}m 재측정 시작` : `${meter}m 정밀 측정 시작`}
          </button>
        )
      }
    >
      <StatusCard tone="info" icon={<Ruler aria-hidden size={28} />}
        eyebrow="정밀 측정 방법"
        title={`측정 시작 후 반경 10m 이내를 천천히 걸으세요`}
        description={`${TARGET_SAMPLES}개 샘플을 정확도 가중 평균하여 저장합니다. 걷는 동안 자동 수집됩니다.`} />

      {/* GPS 수집 상태 */}
      {isCollecting && (
        <div className="status-card space-y-3" role="status" aria-live="polite">
          <p className="text-lg font-extrabold">
            샘플 수집 중… {gps.progress} / {TARGET_SAMPLES}
          </p>
          <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(gps.progress / TARGET_SAMPLES * 100)}%` }}
              role="progressbar"
              aria-valuenow={gps.progress}
              aria-valuemax={TARGET_SAMPLES}
              aria-label={`${gps.progress}개 수집됨`}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            이 지점 반경 10m 이내를 천천히 걸어주세요. 자동으로 수집합니다.
          </p>
          {(() => { const p = gps.partialResult(); return p ? (
            <p className="text-sm">
              현재 추정 오차: 약 {p.accuracy.toFixed(1)}m ({confidenceKo(p.confidence)})
            </p>
          ) : null; })()}
        </div>
      )}

      {isDone && gps.result && (
        <div className="status-card space-y-2" role="status" aria-live="polite">
          <p className="text-lg font-extrabold text-green-600">측정 완료</p>
          <p className="text-base">
            샘플 {gps.result.sampleCount}개 평균 ·
            추정 오차 <strong>{gps.result.accuracy.toFixed(1)}m</strong> ({confidenceKo(gps.result.confidence)})
          </p>
          <p className="text-sm text-muted-foreground">
            아래 "저장" 버튼을 눌러 확정하거나, 재측정하세요.
          </p>
        </div>
      )}

      {gps.status === "error" && (
        <StatusCard tone="warning" icon={<Ruler aria-hidden size={28} />}
          eyebrow="GPS 오류" title={gps.errorMsg ?? "위치를 가져올 수 없습니다"} />
      )}

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
                onClick={() => { setMeter(m); gps.stop(); setMsg(null); }}
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
      </fieldset>

      {/* 결과 메시지 */}
      {msg && (
        <p role="status" aria-live="polite"
          className={`whitespace-pre-line rounded-xl border-2 border-foreground px-4 py-3 text-lg font-bold
            ${msg.startsWith("오류") ? "bg-[var(--danger)] text-[var(--danger-foreground)]" : "bg-card"}`}>
          {msg}
        </p>
      )}

      {/* 기록된 마일스톤 목록 */}
      {existing.length > 0 && (
        <section aria-label="기록된 거리 표지 목록" className="space-y-2">
          <h2 className="text-lg font-extrabold">기록된 거리 표지 ({existing.length}개)</h2>
          {existing.map((m: any) => (
            <div key={m.id} className="status-card flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold">
                  {m.meter}m — {(m.basis_entrance as any)?.name ?? (m.basis_entrance as any)?.code ?? "입구"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {m.survey_direction} · 오차 {m.accuracy != null ? `약 ${Math.round(m.accuracy)}m` : "—"}
                  {m.measured_at ? ` · ${new Date(m.measured_at).toLocaleString("ko-KR")}` : ""}
                </p>
              </div>
              {m.verified
                ? <CheckCircle size={22} aria-label="검증됨" className="shrink-0 text-green-500" />
                : <Circle size={22} aria-label="미검증" className="shrink-0 text-muted-foreground" />
              }
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}

function confidenceKo(c: "poor" | "fair" | "good" | "excellent") {
  return c === "excellent" ? "매우 우수" : c === "good" ? "우수" : c === "fair" ? "보통" : "낮음";
}
