import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Footprints, Navigation } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { useMe } from "@/hooks/useMe";
import { startWalk, getEntrances } from "@/lib/namsan.functions";

export const Route = createFileRoute("/walk/start")({
  head: () => ({ meta: [{ title: "산책 시작 · 남산 산책" }] }),
  component: WalkStart,
});

type EntranceRow = { id: string; code: string; name: string; lat: number | null; lng: number | null; accuracy: number | null };
type Choice = "NTH_THEATER" | "NTH_CABLECAR" | "CURRENT";

// 남산 북측순환로 입구 좌표 기본값 (DB에 없을 때 fallback)
const FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  NTH_THEATER:  { lat: 37.5538, lng: 126.9972 }, // 국립극장 입구
  NTH_CABLECAR: { lat: 37.5532, lng: 126.9839 }, // 케이블카 방면 입구
};

function hav(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, r = (d: number) => d * Math.PI / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 +
    Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function speakText(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR"; u.rate = 1.0;
  const ko = window.speechSynthesis.getVoices().find(v => v.lang?.startsWith("ko")) ?? null;
  if (ko) u.voice = ko;
  window.speechSynthesis.speak(u);
}

function WalkStart() {
  const { data: me } = useMe();
  const [choice, setChoice] = useState<Choice>("NTH_THEATER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle"|"searching"|"found"|"nofix">("idle");
  const [nearestName, setNearestName] = useState<string | null>(null);
  const entrancesRef = useRef<EntranceRow[]>([]);
  const startFn = useServerFn(startWalk);
  const getEntrancesFn = useServerFn(getEntrances);
  const navigate = useNavigate();
  const isApproved = me?.status === "APPROVED";

  // 화면 로드 시 입구 목록 로드 + GPS 자동 감지
  useEffect(() => {
    getEntrancesFn().then(rows => {
      entrancesRef.current = rows as EntranceRow[];
      detectNearestEntrance(rows as EntranceRow[]);
    }).catch(() => {
      // DB 실패 시 fallback 좌표로 감지 시도
      detectNearestEntrance([]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function detectNearestEntrance(rows: EntranceRow[]) {
    if (!("geolocation" in navigator)) return;
    setGpsStatus("searching");

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const AUTO_DETECT_RADIUS = 150; // 150m 이내면 자동 감지

        // 각 입구까지 거리 계산 (DB 좌표 우선, 없으면 fallback)
        const candidates = ["NTH_THEATER", "NTH_CABLECAR"].map(code => {
          const row = rows.find(r => r.code === code);
          const coords = (row?.lat != null && row?.lng != null)
            ? { lat: row.lat, lng: row.lng }
            : FALLBACK_COORDS[code];
          const name = row?.name ?? (code === "NTH_THEATER" ? "국립극장 입구" : "케이블카 방면 입구");
          const dist = hav(lat, lng, coords.lat, coords.lng);
          return { code, name, dist };
        });

        candidates.sort((a, b) => a.dist - b.dist);
        const nearest = candidates[0];

        if (nearest.dist <= AUTO_DETECT_RADIUS) {
          setChoice(nearest.code as Choice);
          setNearestName(nearest.name);
          setGpsStatus("found");
          // 음성 안내 (voicesynth 열린 뒤 0.5초 후 실행 — iOS 안전)
          setTimeout(() => speakText(
            `이곳은 ${nearest.name}입니다. 이 지점에서 산책을 시작하려면 산책 시작 버튼을 누르세요.`
          ), 500);
        } else {
          setGpsStatus("nofix");
        }
      },
      () => setGpsStatus("nofix"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  }

  const entranceName = (code: Choice) => {
    if (code === "CURRENT") return "현재 위치";
    const row = entrancesRef.current.find(r => r.code === code);
    return row?.name ?? (code === "NTH_THEATER" ? "국립극장 입구" : "케이블카 방면 입구");
  };

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
                navigate({
                  to: "/walk",
                  search: { walkId: r.walkId, entranceCode: choice === "CURRENT" ? undefined : choice } as never,
                });
              } else {
                navigate({
                  to: "/walk",
                  search: { entranceCode: choice === "CURRENT" ? undefined : choice } as never,
                });
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
      {/* GPS 자동 감지 상태 */}
      {gpsStatus === "searching" && (
        <p className="rounded-2xl border-2 border-foreground bg-card px-4 py-3 text-base" role="status" aria-live="polite">
          <Navigation aria-hidden size={18} className="mr-1 inline" />
          현재 위치 확인 중… 가장 가까운 입구를 자동으로 찾습니다.
        </p>
      )}
      {gpsStatus === "found" && nearestName && (
        <p className="rounded-2xl border-2 border-foreground bg-card px-4 py-3 text-base font-bold" role="status" aria-live="polite">
          📍 {nearestName} 근처에 계십니다. 자동 선택됐습니다.
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-extrabold">출발 위치 선택</legend>
        <RadioRow id="r1" name="start" checked={choice === "NTH_THEATER"} onChange={() => setChoice("NTH_THEATER")}
          title={entranceName("NTH_THEATER")} subtitle="북측순환로 동쪽 시작점" />
        <RadioRow id="r2" name="start" checked={choice === "NTH_CABLECAR"} onChange={() => setChoice("NTH_CABLECAR")}
          title={entranceName("NTH_CABLECAR")} subtitle="북측순환로 서쪽 시작점" />
        <RadioRow id="r3" name="start" checked={choice === "CURRENT"} onChange={() => setChoice("CURRENT")}
          title="현재 위치에서 출발" subtitle="가장 가까운 기준점을 자동으로 찾습니다" />
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
