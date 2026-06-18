import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Construction, Car, Box, Droplets, MapPin, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { reportHazard } from "@/lib/namsan.functions";

export const Route = createFileRoute("/report-hazard")({
  head: () => ({ meta: [{ title: "위험 신고 · 남산 산책" }] }),
  component: ReportHazard,
});

type HType = "CONSTRUCTION" | "VEHICLE" | "OBSTACLE" | "SLIPPERY";
type Sub = "TEMP" | "LONG";
type Side = "LEFT" | "RIGHT" | "FRONT" | "ALL" | "UNKNOWN";

const TYPES: { key: HType; label: string; icon: React.ReactNode; expiresLabel: string }[] = [
  { key: "CONSTRUCTION", label: "공사 주의", icon: <Construction aria-hidden size={36} />, expiresLabel: "기본 24시간 / 장기 3일" },
  { key: "VEHICLE", label: "차량 주의", icon: <Car aria-hidden size={36} />, expiresLabel: "기본 2시간 후 자동 만료" },
  { key: "OBSTACLE", label: "장애물 주의", icon: <Box aria-hidden size={36} />, expiresLabel: "기본 6시간 후 자동 만료" },
  { key: "SLIPPERY", label: "미끄럼 주의", icon: <Droplets aria-hidden size={36} />, expiresLabel: "기본 6시간 후 자동 만료" },
];

const SIDES: { key: Side; label: string }[] = [
  { key: "LEFT", label: "진행 방향 왼쪽" },
  { key: "RIGHT", label: "진행 방향 오른쪽" },
  { key: "FRONT", label: "정면" },
  { key: "ALL", label: "길 전체" },
  { key: "UNKNOWN", label: "모르겠음" },
];

function ReportHazard() {
  const fn = useServerFn(reportHazard);
  const navigate = useNavigate();
  const [type, setType] = useState<HType | null>(null);
  const [sub, setSub] = useState<Sub>("TEMP");
  const [side, setSide] = useState<Side>("UNKNOWN");
  const [desc, setDesc] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => setMsg("위치를 가져올 수 없습니다. 권한을 허용해 주세요."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  async function submit() {
    if (!type) { setMsg("위험 종류를 선택해 주세요."); return; }
    if (!pos) { setMsg("현재 위치가 필요합니다."); return; }
    setBusy(true); setMsg(null);
    try {
      await fn({ data: {
        type, subtype: type === "CONSTRUCTION" ? sub : null,
        side, description: desc.trim() || null,
        lat: pos.lat, lng: pos.lng, accuracy: pos.acc,
      }});
      setMsg("신고가 저장되었습니다. 자동 만료 시간이 설정되었습니다.");
      setTimeout(() => navigate({ to: "/walk", search: {} as never }), 1200);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "저장 실패");
    } finally { setBusy(false); }
  }

  return (
    <AppShell title="위험 신고" back={{ to: "/walk", label: "산책 화면으로" }}
      bottomAction={
        <button className="btn-primary" onClick={submit} disabled={busy || !type || !pos}
          aria-label="현재 위치로 위험 신고">
          <Send aria-hidden size={26} /> {busy ? "전송 중..." : "현재 위치로 신고"}
        </button>
      }>
      <StatusCard tone="info" icon={<AlertTriangle aria-hidden size={28} />}
        eyebrow="안내"
        title="비회원도 위험을 신고할 수 있습니다"
        description="신고는 관리자 확인 전까지 ‘임시 경고’로만 표시되며, 종류에 따라 자동으로 만료됩니다." />

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

      {type === "CONSTRUCTION" && (
        <fieldset>
          <legend className="mb-2 text-xl font-extrabold">공사 기간</legend>
          <div className="grid grid-cols-2 gap-3">
            <SubBtn label="일시 공사 (24시간)" active={sub === "TEMP"} onClick={() => setSub("TEMP")} />
            <SubBtn label="장기 공사 (3일)" active={sub === "LONG"} onClick={() => setSub("LONG")} />
          </div>
        </fieldset>
      )}

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

      <div>
        <label htmlFor="desc" className="mb-2 block text-lg font-extrabold">설명 (선택)</label>
        <textarea id="desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
          className="min-h-24 w-full rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg outline-none" />
      </div>

      <StatusCard tone={pos ? "success" : "warning"} icon={<MapPin aria-hidden size={28} />}
        eyebrow="현재 위치"
        title={pos ? `GPS 정확도 약 ${Math.round(pos.acc)} m` : "위치 권한이 필요합니다"} />

      <div role="alert" aria-live="polite" className="min-h-[1px]">
        {msg && <p className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">{msg}</p>}
      </div>
    </AppShell>
  );
}

function SubBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={active}
      aria-label={`${label}${active ? ", 선택됨" : ""}`}
      onClick={onClick}
      className="status-card min-h-[72px] text-left"
      style={active ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
      <span className="text-lg font-extrabold">{label}</span>
      <p className="mt-1 text-sm">{active ? "선택됨" : ""}</p>
    </button>
  );
}
