import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Save } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminSaveLandmark } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/field-survey")({
  head: () => ({ meta: [{ title: "현장 측량 · 관리자" }] }),
  component: FieldSurvey,
});

type Pos = { lat: number; lng: number; acc: number } | null;

function FieldSurvey() {
  const [pos, setPos] = useState<Pos>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [direction, setDirection] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saveFn = useServerFn(adminSaveLandmark);

  function capture() {
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => setMsg(`위치 실패: ${e.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    if (!pos) { setMsg("먼저 현재 위치를 찍어주세요."); return; }
    if (!name.trim()) { setMsg("랜드마크 이름을 입력해 주세요."); return; }
    setBusy(true); setMsg(null);
    try {
      await saveFn({ data: {
        name, type, announcement, direction_hint: direction,
        lat: pos.lat, lng: pos.lng, accuracy: pos.acc,
      }});
      setMsg("저장됨 (verified=false, 안내에 사용되지 않음)");
      setName(""); setType(""); setAnnouncement(""); setDirection("");
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(false); }
  }

  return (
    <AppShell title="현장 측량" back={{ to: "/admin" }}
      bottomAction={
        <button className="btn-primary" onClick={save} disabled={busy}>
          <Save aria-hidden size={26} /> {busy ? "저장 중..." : "현장 후보 저장"}
        </button>
      }>
      <StatusCard tone="info" icon={<MapPin aria-hidden size={28} />}
        eyebrow="안내"
        title="저장 데이터는 verified=false로 기록됩니다"
        description="일반 사용자에게 안전 안내처럼 보이지 않습니다. 관리자 검증 후에만 안내에 사용됩니다." />

      <button className="btn-secondary" onClick={capture}>
        <MapPin aria-hidden size={24} /> 현재 지점 찍기
      </button>

      {pos && (
        <div className="status-card">
          <p className="text-lg font-extrabold">현재 GPS</p>
          <p>정확도 약 {Math.round(pos.acc)} m</p>
          <p className="text-sm text-muted-foreground">좌표는 관리자 전용</p>
        </div>
      )}

      <Field id="name" label="랜드마크 이름" value={name} onChange={setName} />
      <Field id="type" label="유형 (예: 계단, 분기점, 표지판)" value={type} onChange={setType} />
      <Field id="ann" label="음성 안내 문구" value={announcement} onChange={setAnnouncement} multiline />
      <Field id="dir" label="방향 힌트 (예: 오른쪽 11시 방향)" value={direction} onChange={setDirection} />

      {msg && (
        <p role="status" className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">
          {msg}
        </p>
      )}
    </AppShell>
  );
}

function Field({ id, label, value, onChange, multiline }: { id: string; label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-lg font-extrabold">{label}</label>
      {multiline
        ? <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3}
            className="min-h-24 w-full rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-semibold outline-none" />
        : <input id={id} value={value} onChange={(e) => onChange(e.target.value)}
            className="min-h-14 w-full rounded-xl border-2 border-foreground bg-card px-4 text-lg font-semibold outline-none" />}
    </div>
  );
}
