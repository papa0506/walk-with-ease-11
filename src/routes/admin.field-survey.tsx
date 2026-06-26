import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Save, RefreshCw, Trash2, CheckCircle, Circle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminSaveLandmark, adminListLandmarks, adminDeleteLandmark } from "@/lib/namsan.functions";
import { useQuery } from "@tanstack/react-query";
import { useGpsAverage } from "@/hooks/useGpsAverage";

export const Route = createFileRoute("/admin/field-survey")({
  head: () => ({ meta: [{ title: "현장 측량 · 관리자" }] }),
  component: FieldSurvey,
});

type SideDir = "LEFT"|"RIGHT"|"FRONT"|"BOTH"|"ALL"|"UNKNOWN";
type SurveyDir = "THEATER_TO_CABLECAR"|"CABLECAR_TO_THEATER"|"UNSPEC";

const SIDE_OPTIONS: { key: SideDir; label: string }[] = [
  { key: "LEFT", label: "왼쪽" },
  { key: "RIGHT", label: "오른쪽" },
  { key: "FRONT", label: "정면" },
  { key: "BOTH", label: "양쪽" },
  { key: "ALL", label: "전체" },
  { key: "UNKNOWN", label: "미상" },
];

const SURVEY_OPTIONS: { key: SurveyDir; label: string }[] = [
  { key: "THEATER_TO_CABLECAR", label: "국립극장 → 케이블카 방향" },
  { key: "CABLECAR_TO_THEATER", label: "케이블카 → 국립극장 방향" },
  { key: "UNSPEC", label: "방향 무관" },
];

function FieldSurvey() {
  const gps    = useGpsAverage(12); // 12개 샘플 (더 정밀하게)
  const saveFn     = useServerFn(adminSaveLandmark);
  const listFn     = useServerFn(adminListLandmarks);
  const deleteFn   = useServerFn(adminDeleteLandmark);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { data: landmarks = [], refetch: refetchList } = useQuery({
    queryKey: ["landmarks-admin"],
    queryFn: () => listFn(),
  });

  const [name,         setName]         = useState("");
  const [type,         setType]         = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [direction,    setDirection]    = useState("");
  const [side,         setSide]         = useState<SideDir>("UNKNOWN");
  const [surveyDir,    setSurveyDir]    = useState<SurveyDir>("UNSPEC");
  const [msg,          setMsg]          = useState<string | null>(null);
  const [busy,         setBusy]         = useState(false);

  useEffect(() => { gps.start(); return () => gps.stop(); }, []); // eslint-disable-line

  const pos = gps.result;

  async function save() {
    if (!pos)         { setMsg("GPS 좌표 수집을 완료해 주세요."); return; }
    if (!name.trim()) { setMsg("랜드마크 이름을 입력해 주세요."); return; }
    setBusy(true); setMsg(null);
    try {
      await saveFn({ data: {
        name, type, announcement, direction_hint: direction,
        side, survey_direction: surveyDir,
        lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
      }});
      setMsg(`저장됨 (정확도 약 ${pos.accuracy.toFixed(1)}m, ${pos.sampleCount}개 평균)`);
      setName(""); setType(""); setAnnouncement(""); setDirection("");
      refetchList();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(false); }
  }

  return (
    <AppShell title="현장 측량" back={{ to: "/admin" }}
      bottomAction={
        <button className="btn-primary" onClick={save} disabled={busy || !pos}>
          <Save aria-hidden size={26} /> {busy ? "저장 중…" : "현장 후보 저장"}
        </button>
      }
    >
      <StatusCard tone="info" icon={<MapPin aria-hidden size={28} />}
        eyebrow="안내"
        title="저장 데이터는 verified=false로 기록됩니다"
        description="관리자 검증 후에만 일반 안내에 사용됩니다." />

      {/* GPS 상태 */}
      {gps.status === "collecting" && (
        <div className="status-card space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-lg font-extrabold">
              GPS 정밀 측량 중… {gps.progress}/{gps.targetSamples}
            </p>
            <button type="button" onClick={gps.start} className="btn-secondary px-3 py-1 text-sm">
              <RefreshCw size={16} aria-hidden /> 재시작
            </button>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round(gps.progress / gps.targetSamples * 100)}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            이 자리에서 잠시 멈춰 주세요. 여러 GPS 신호를 평균내어 정확도를 높입니다.
          </p>
        </div>
      )}
      {gps.status === "done" && pos && (
        <div className="status-card flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold">GPS 측량 완료</p>
            <p className="text-base">
              추정 오차 약 {pos.accuracy.toFixed(1)} m ({pos.sampleCount}개 평균)
            </p>
            <p className="text-sm text-muted-foreground">
              정확도: {
                pos.confidence === "excellent" ? "매우 우수 ✓✓" :
                pos.confidence === "good"      ? "우수 ✓" :
                pos.confidence === "fair"      ? "보통" : "낮음"
              }
            </p>
          </div>
          <button type="button" onClick={gps.start} className="btn-secondary px-3 py-2 text-sm">
            <RefreshCw size={16} aria-hidden /> 재측정
          </button>
        </div>
      )}
      {gps.status === "error" && (
        <StatusCard tone="warning" icon={<MapPin aria-hidden size={28} />}
          eyebrow="GPS 오류" title={gps.errorMsg ?? "위치를 가져올 수 없습니다"} />
      )}

      {/* 방향 설정 */}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-lg font-extrabold">측량 진행 방향</legend>
        <div className="space-y-1">
          {SURVEY_OPTIONS.map(o => (
            <button key={o.key} type="button" role="radio" aria-checked={surveyDir === o.key}
              onClick={() => setSurveyDir(o.key)}
              className="status-card flex min-h-12 w-full items-center justify-between"
              style={surveyDir === o.key ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
              <span className="font-bold">{o.label}</span>
              {surveyDir === o.key && <span className="text-sm">선택됨</span>}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-lg font-extrabold">지물 위치 방향</legend>
        <div className="grid grid-cols-3 gap-2">
          {SIDE_OPTIONS.map(o => (
            <button key={o.key} type="button" role="radio" aria-checked={side === o.key}
              onClick={() => setSide(o.key)}
              className="status-card min-h-12 text-center"
              style={side === o.key ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
              <span className="font-bold">{o.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Field id="name" label="랜드마크 이름 *" value={name} onChange={setName} />
      <Field id="type" label="유형 (예: 의자, 계단, 분기점)" value={type} onChange={setType} />
      <Field id="ann" label="음성 안내 문구 (예: 오른쪽에 의자가 있습니다)" value={announcement} onChange={setAnnouncement} multiline />
      <Field id="dir" label="방향 힌트 (예: 오른쪽 2시 방향)" value={direction} onChange={setDirection} />

      {msg && (
        <p className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">
          {msg}
        </p>
      )}

      {/* 저장된 랜드마크 목록 */}
      {landmarks.length > 0 && (
        <section aria-label="저장된 랜드마크 목록" className="space-y-2">
          <h2 className="text-lg font-extrabold">저장된 랜드마크 ({landmarks.length}개)</h2>
          {(landmarks as any[]).map((lm) => (
            <div key={lm.id} className="status-card flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold">{lm.name}</p>
                <p className="text-sm text-muted-foreground">
                  {lm.type ? `${lm.type} · ` : ""}{lm.side} · 오차 {lm.accuracy != null ? `약 ${Math.round(lm.accuracy)}m` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(lm.created_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lm.verified
                  ? <CheckCircle size={18} aria-label="검증됨" className="text-green-500" />
                  : <Circle size={18} aria-label="미검증" className="text-muted-foreground" />
                }
                <button
                  className="rounded-lg border-2 border-foreground p-1"
                  onClick={async () => {
                    if (!confirm(`"${lm.name}"을(를) 삭제합니까?`)) return;
                    setDeleting(lm.id);
                    try { await deleteFn({ data: { id: lm.id } }); await refetchList(); }
                    finally { setDeleting(null); }
                  }}
                  disabled={deleting !== null}
                  aria-label={`${lm.name} 삭제`}>
                  <Trash2 aria-hidden size={16} className="text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}

function Field({
  id, label, value, onChange, multiline,
}: { id: string; label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const cls = "w-full rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg outline-none";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-lg font-extrabold">{label}</label>
      {multiline
        ? <textarea id={id} rows={3} value={value} onChange={e => onChange(e.target.value)} className={cls} />
        : <input id={id} type="text" value={value} onChange={e => onChange(e.target.value)} className={cls} />}
    </div>
  );
}
