import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Footprints, MapPin, Tag, AlertTriangle, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminSaveMilestone, adminSaveLandmark } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/field-mode")({
  head: () => ({ meta: [{ title: "현장 실측 모드 · 관리자" }] }),
  component: FieldMode;
});

type Dir = "THEATER_TO_CABLECAR" | "CABLECAR_TO_THEATER";
type Step = "MAIN" | "LANDMARK";
type LType = "TOILET" | "BENCH" | "PAVILION" | "STAIRS_DOWN" | "STAIRS_UP" | "EXERCISE" | "CUSTOM";
type Side = "LEFT" | "RIGHT" | "FRONT" | "BOTH" | "UNKNOWN";

const LTYPES: { key: LType; label: string; announce: string }[] = [
  { key: "TOILET", label: "화장실", announce: "화장실이 있습니다" },
  { key: "BENCH", label: "벤치", announce: "벤치가 있습니다" },
  { key: "PAVILION", label: "정자", announce: "정자가 있습니다" },
  { key: "STAIRS_DOWN", label: "내려가는 계단", announce: "내려가는 계단이 있습니다" },
  { key: "STAIRS_UP", label: "올라가는 계단", announce: "올라가는 계단이 있습니다" },
  { key: "EXERCISE", label: "운동기구", announce: "운동기구가 있습니다" },
  { key: "CUSTOM", label: "사용자 정의", announce: "지형지물이 있습니다" },
];
const SIDES: { key: Side; label: string }[] = [
  { key: "LEFT", label: "왼쪽" },
  { key: "RIGHT", label: "오른쪽" },
  { key: "FRONT", label: "정면" },
  { key: "BOTH", label: "양쪽" },
  { key: "UNKNOWN", label: "모르겠음" },
];

function FieldMode() {
  const navigate = useNavigate();
  const saveM = useServerFn(adminSaveMilestone);
  const saveL = useServerFn(adminSaveLandmark);

  const [dir, setDir] = useState<Dir>("THEATER_TO_CABLECAR");
  const [meter, setMeter] = useState(200);
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("MAIN");
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);

  // Landmark form state
  const [ltype, setLType] = useState<LType>("BENCH");
  const [customName, setCustomName] = useState("");
  const [lside, setLSide] = useState<Side>("RIGHT");

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => setMsg("위치 권한이 필요합니다."),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, []);

  const basisCode = dir === "THEATER_TO_CABLECAR" ? "NTH_THEATER" : "NTH_CABLECAR";

  async function saveMilestone() {
    if (!pos) { setMsg("위치를 가져오는 중입니다."); return; }
    setBusy(true); setMsg(null);
    try {
      await saveM({ data: {
        basis_entrance_code: basisCode, meter,
        survey_direction: dir,
        lat: pos.lat, lng: pos.lng, accuracy: pos.acc,
      }});
      setMsg(`${meter}m 표지 저장됨 → 다음 ${meter + 200}m`);
      setMeter((m) => m + 200);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(false); }
  }

  async function saveLandmark() {
    if (!pos) { setMsg("위치를 가져오는 중입니다."); return; }
    const def = LTYPES.find((t) => t.key === ltype)!;
    const name = ltype === "CUSTOM" ? (customName.trim() || "지형지물") : def.label;
    const sideLabel = lside === "LEFT" ? "진행 방향 왼쪽" : lside === "RIGHT" ? "진행 방향 오른쪽"
      : lside === "FRONT" ? "정면" : lside === "BOTH" ? "양쪽" : "위치 미상";
    const announcement = `${sideLabel}에 ${name === "지형지물" ? "지형지물이 있습니다" : (ltype === "CUSTOM" ? `${name}이 있습니다` : def.announce)}`;
    setBusy(true); setMsg(null);
    try {
      await saveL({ data: {
        name, type: ltype, custom_name: ltype === "CUSTOM" ? customName.trim() || null : null,
        announcement, side: lside, survey_direction: dir,
        lat: pos.lat, lng: pos.lng, accuracy: pos.acc,
        route_meter: meter,
      }});
      setMsg(`지형지물 저장됨: ${name} (${sideLabel})`);
      setStep("MAIN");
      setCustomName("");
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(false); }
  }

  if (step === "LANDMARK") {
    return (
      <AppShell title="지형지물 기록" back={{ to: "/admin/field-mode" }}
        bottomAction={
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-secondary" onClick={() => setStep("MAIN")}>취소</button>
            <button className="btn-primary" onClick={saveLandmark} disabled={busy}>
              <Save aria-hidden size={22} /> {busy ? "저장 중..." : "저장 후 실측 복귀"}
            </button>
          </div>
        }>
        <StatusCard tone="info" icon={<Tag aria-hidden size={28} />}
          eyebrow={`${meter}m 부근`}
          title="현재 진행 방향 기준으로 저장됩니다"
          description={dir === "THEATER_TO_CABLECAR" ? "국립극장 → 케이블카 방면" : "케이블카 → 국립극장 방면"} />

        <fieldset>
          <legend className="mb-2 text-lg font-extrabold">종류</legend>
          <div className="grid grid-cols-2 gap-2">
            {LTYPES.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={ltype === t.key}
                aria-label={`${t.label}${ltype === t.key ? ", 선택됨" : ""}`}
                onClick={() => setLType(t.key)}
                className="status-card min-h-[72px] text-left"
                style={ltype === t.key ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
                <span className="text-lg font-extrabold">{t.label}</span>
                <p className="text-sm">{ltype === t.key ? "선택됨" : ""}</p>
              </button>
            ))}
          </div>
        </fieldset>

        {ltype === "CUSTOM" && (
          <div>
            <label htmlFor="cn" className="mb-2 block text-lg font-extrabold">이름</label>
            <input id="cn" value={customName} onChange={(e) => setCustomName(e.target.value)}
              className="min-h-14 w-full rounded-xl border-2 border-foreground bg-card px-4 text-lg" />
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-lg font-extrabold">위치 방향 (실측 진행 방향 기준)</legend>
          <div className="space-y-2">
            {SIDES.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={lside === s.key}
                aria-label={`${s.label}${lside === s.key ? ", 선택됨" : ""}`}
                onClick={() => setLSide(s.key)}
                className="status-card flex min-h-14 w-full items-center justify-between"
                style={lside === s.key ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
                <span className="text-lg font-extrabold">{s.label}</span>
                <span className="text-sm">{lside === s.key ? "선택됨" : ""}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </AppShell>
    );
  }

  return (
    <AppShell title="현장 실측 모드" back={{ to: "/admin" }}
      bottomAction={
        <button className="btn-primary" onClick={saveMilestone} disabled={busy || !pos}>
          <Save aria-hidden size={26} /> {busy ? "저장 중..." : `현재 위치를 ${meter}m 표지로 기록`}
        </button>
      }>
      <fieldset>
        <legend className="mb-2 text-lg font-extrabold">기준 방향</legend>
        <div className="grid grid-cols-1 gap-2">
          <DirBtn label="국립극장 → 북측순환로 입구 방향" active={dir === "THEATER_TO_CABLECAR"} onClick={() => setDir("THEATER_TO_CABLECAR")} />
          <DirBtn label="북측순환로 입구 → 국립극장 방향" active={dir === "CABLECAR_TO_THEATER"} onClick={() => setDir("CABLECAR_TO_THEATER")} />
        </div>
      </fieldset>

      <StatusCard tone={pos ? "success" : "warning"} icon={<MapPin aria-hidden size={28} />}
        eyebrow="GPS"
        title={pos ? `정확도 약 ${Math.round(pos.acc)} m` : "위치 가져오는 중..."} />

      <StatusCard tone="info" icon={<Footprints aria-hidden size={28} />}
        eyebrow="현재 표지"
        title={`${meter} m`}
        description={`다음 표지: ${meter + 200} m · 기준: ${basisCode}`}>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-secondary min-h-12" onClick={() => setMeter((m) => Math.max(200, m - 200))}>
            <ChevronLeft aria-hidden size={18} /> 이전
          </button>
          <button className="btn-secondary min-h-12" onClick={() => setMeter((m) => m + 200)}>
            다음 <ChevronRight aria-hidden size={18} />
          </button>
          <button className="btn-secondary min-h-12" onClick={() => {
            const v = prompt("거리(m) 직접 입력 (200 단위)", String(meter));
            const n = Number(v); if (Number.isFinite(n) && n >= 200) setMeter(Math.round(n / 200) * 200);
          }}>직접 선택</button>
        </div>
      </StatusCard>

      <div className="grid grid-cols-2 gap-3">
        <button className="status-card min-h-[80px] text-left" onClick={() => setStep("LANDMARK")}>
          <Tag aria-hidden size={28} />
          <p className="mt-1 text-lg font-extrabold">지형지물 기록</p>
        </button>
        <button className="status-card min-h-[80px] text-left"
          onClick={() => navigate({ to: "/report-hazard" })}>
          <AlertTriangle aria-hidden size={28} />
          <p className="mt-1 text-lg font-extrabold">위험 지점 기록</p>
        </button>
      </div>

      {msg && (
        <p role="status" aria-live="polite" className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">
          {msg}
        </p>
      )}
    </AppShell>
  );
}

function DirBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={active}
      aria-label={`${label}${active ? ", 선택됨" : ""}`}
      onClick={onClick}
      className="status-card min-h-14 text-left"
      style={active ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
      <span className="text-lg font-extrabold">{label}</span>
      <span className="ml-2 text-sm">{active ? "선택됨" : ""}</span>
    </button>
  );
}
