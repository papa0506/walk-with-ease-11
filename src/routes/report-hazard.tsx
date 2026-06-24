import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Construction, Car, Box, Droplets, MapPin, Send, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { reportHazard } from "@/lib/namsan.functions";
import { useGpsAverage } from "@/hooks/useGpsAverage";

export const Route = createFileRoute("/report-hazard")({
  head: () => ({ meta: [{ title: "위험 신고 · 남산 산책" }] }),
  component: ReportHazard,
});

type HType = "CONSTRUCTION" | "VEHICLE" | "OBSTACLE" | "SLIPPERY";
type Sub = "TEMP" | "LONG";
type Side = "LEFT" | "RIGHT" | "FRONT" | "ALL" | "UNKNOWN";

const TYPES: { key: HType; label: string; icon: React.ReactNode; expiresLabel: string }[] = [
  { key: "CONSTRUCTION", label: "공사 주의",  icon: <Construction aria-hidden size={36} />, expiresLabel: "기본 24시간 / 장기 3일" },
  { key: "VEHICLE",      label: "차량 주의",  icon: <Car aria-hidden size={36} />,          expiresLabel: "기본 2시간 후 자동 만료" },
  { key: "OBSTACLE",     label: "장애물 주의", icon: <Box aria-hidden size={36} />,          expiresLabel: "기본 6시간 후 자동 만료" },
  { key: "SLIPPERY",     label: "미끄럼 주의", icon: <Droplets aria-hidden size={36} />,     expiresLabel: "기본 6시간 후 자동 만료" },
];

const SIDES: { key: Side; label: string }[] = [
  { key: "LEFT",    label: "진행 방향 왼쪽" },
  { key: "RIGHT",   label: "진행 방향 오른쪽" },
  { key: "FRONT",   label: "정면" },
  { key: "ALL",     label: "길 전체" },
  { key: "UNKNOWN", label: "모르겠음" },
];

const CONFIDENCE_LABEL: Record<string, string> = {
  excellent: "매우 우수 (±5m 이내)",
  good:      "우수 (±10m 이내)",
  fair:      "보통 (±20m 이내)",
  poor:      "낮음 — 더 수집 중",
};

function ReportHazard() {
  const fn       = useServerFn(reportHazard);
  const navigate = useNavigate();
  const gps      = useGpsAverage(10); // 10개 샘플 수집

  const [type, setType] = useState<HType | null>(null);
  const [sub,  setSub]  = useState<Sub>("TEMP");
  const [side, setSide] = useState<Side>("UNKNOWN");
  const [desc, setDesc] = useState("");
  const [msg,  setMsg]  = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 페이지 열리면 자동으로 GPS 수집 시작
  useEffect(() => { gps.start(); return () => gps.stop(); }, []); // eslint-disable-line

  const pos = gps.result;
  const canSubmit = !!type && !!pos && !busy;

  async function submit() {
    if (!type) { setMsg("위험 종류를 선택해 주세요."); return; }
    if (!pos)  { setMsg("GPS 좌표 수집이 완료되지 않았습니다."); return; }
    setBusy(true); setMsg(null);
    try {
      await fn({ data: {
        type,
        subtype: type === "CONSTRUCTION" ? sub : null,
        side,
        description: desc.trim() || null,
        lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
      }});
      setMsg("신고가 저장되었습니다.");
      setTimeout(() => navigate({ to: "/walk", search: {} as never }), 1200);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "저장 실패");
    } finally { setBusy(false); }
  }

  // GPS 상태 카드 표시
  function GpsStatus() {
    if (gps.status === "error") {
      return (
        <StatusCard tone="warning" icon={<MapPin aria-hidden size={28} />}
          eyebrow="GPS 오류"
          title={gps.errorMsg ?? "위치를 가져올 수 없습니다"}
          description="앱 설정에서 위치 권한을 허용해 주세요." />
      );
    }
    if (gps.status === "collecting") {
      const pct = Math.round((gps.progress / gps.targetSamples) * 100);
      return (
        <div className="status-card space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-lg font-extrabold">
              <MapPin aria-hidden size={20} className="mr-1 inline" />
              GPS 좌표 수집 중… {gps.progress}/{gps.targetSamples}
            </p>
            <button type="button" onClick={gps.start} aria-label="GPS 다시 수집" className="btn-secondary px-3 py-1 text-sm">
              <RefreshCw size={16} aria-hidden />
            </button>
          </div>
          {/* 진행 바 */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
            aria-valuenow={gps.progress} aria-valuemin={0} aria-valuemax={gps.targetSamples}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            정확도를 높이기 위해 이 자리에 잠시 서 계세요.
          </p>
        </div>
      );
    }
    if (gps.status === "done" && pos) {
      return (
        <div className="status-card space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-lg font-extrabold">
              <MapPin aria-hidden size={20} className="mr-1 inline" />
              GPS 수집 완료 ({pos.sampleCount}개 평균)
            </p>
            <button type="button" onClick={gps.start} aria-label="GPS 다시 수집" className="btn-secondary px-3 py-1 text-sm">
              <RefreshCw size={16} aria-hidden /> 재측정
            </button>
          </div>
          <p className="text-base font-bold">
            추정 오차 약 {pos.accuracy.toFixed(1)} m —{" "}
            {CONFIDENCE_LABEL[pos.confidence]}
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <AppShell title="공사 및 위험 신고" back={{ to: "/" }}
      bottomAction={
        <button
          className="btn-primary"
          onClick={submit}
          disabled={!canSubmit}
          aria-label="현재 위치로 위험 신고"
          aria-disabled={!canSubmit}
        >
          <Send aria-hidden size={26} />
          {busy ? "전송 중…" : gps.status !== "done" ? "GPS 수집 완료 후 신고 가능" : "현재 위치로 신고"}
        </button>
      }
    >
      {/* GPS 상태 */}
      <GpsStatus />

      {/* 위험 종류 */}
      <fieldset>
        <legend className="mb-2 text-xl font-extrabold">위험 종류</legend>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="위험 종류 선택">
          {TYPES.map((t) => {
            const selected = type === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${t.label}${selected ? ", 선택됨" : ""}. ${t.expiresLabel}`}
                onClick={() => setType(t.key)}
                className="status-card flex min-h-[112px] flex-col items-start gap-2 text-left"
                style={selected ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary-foreground)" } : undefined}
              >
                <div className="flex items-center gap-2">
                  {t.icon}
                  <span className="text-xl font-extrabold">{t.label}</span>
                </div>
                <span className="text-sm opacity-90">{selected ? "선택됨 · " : ""}{t.expiresLabel}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 공사 기간 */}
      {type === "CONSTRUCTION" && (
        <fieldset>
          <legend className="mb-2 text-xl font-extrabold">공사 기간</legend>
          <div className="grid grid-cols-2 gap-3">
            <SubBtn label="일시 공사 (24시간)" active={sub === "TEMP"} onClick={() => setSub("TEMP")} />
            <SubBtn label="장기 공사 (3일)"    active={sub === "LONG"} onClick={() => setSub("LONG")} />
          </div>
        </fieldset>
      )}

      {/* 위험 방향 */}
      <fieldset>
        <legend className="mb-2 text-xl font-extrabold">위험 위치 방향</legend>
        <div className="space-y-2" role="radiogroup" aria-label="위험 위치 방향 선택">
          {SIDES.map((s) => {
            const selected = side === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${s.label}${selected ? ", 선택됨" : ""}`}
                onClick={() => setSide(s.key)}
                className="status-card flex min-h-14 w-full items-center justify-between"
                style={selected ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}
              >
                <span className="text-lg font-extrabold">{s.label}</span>
                <span className="text-sm">{selected ? "선택됨" : ""}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 설명 */}
      <div>
        <label htmlFor="desc" className="mb-2 block text-lg font-extrabold">설명 (선택)</label>
        <textarea
          id="desc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="예: 인도 블록 들림, 공사 자재 쌓여 있음"
          className="min-h-24 w-full rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg outline-none"
        />
      </div>

      {/* 메시지 */}
      <div role="alert" aria-live="polite" className="min-h-[1px]">
        {msg && (
          <p className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">
            {msg}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function SubBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${label}${active ? ", 선택됨" : ""}`}
      onClick={onClick}
      className="status-card min-h-[72px] text-left"
      style={active ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}
    >
      <span className="text-lg font-extrabold">{label}</span>
      <p className="mt-1 text-sm">{active ? "선택됨" : ""}</p>
    </button>
  );
}
