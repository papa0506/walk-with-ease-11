import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Footprints, Navigation, MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { useMe } from "@/hooks/useMe";
import { startWalk, getEntrances } from "@/lib/namsan.functions";

export const Route = createFileRoute("/walk/start")({
  head: () => ({ meta: [{ title: "산책 시작 · 남산 산책" }] }),
  component: WalkStart,
});

type EntranceRow = { id: string; code: string; name: string; lat: number | null; lng: number | null; accuracy: number | null };
type EntranceCode = "NTH_THEATER" | "NTH_CABLECAR";

const FALLBACK: Record<EntranceCode, { lat: number; lng: number; name: string }> = {
  NTH_THEATER:  { lat: 37.5537,  lng: 126.9971,  name: "국립극장 입구" },
  NTH_CABLECAR: { lat: 37.55377, lng: 126.98381, name: "케이블카 방면 입구" },
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
  const navigate   = useNavigate();
  const startFn    = useServerFn(startWalk);
  const getEntrancesFn = useServerFn(getEntrances);

  // "detecting" → GPS 확인 중
  // "found"     → 입구 자동 감지 성공
  // "manual"    → 범위 밖이거나 GPS 실패 → 수동 선택
  const [phase, setPhase]   = useState<"detecting"|"found"|"manual">("detecting");
  const [detected, setDetected]   = useState<EntranceCode | null>(null);
  const [manualChoice, setManualChoice] = useState<EntranceCode>("NTH_THEATER");
  const [busy, setBusy]     = useState(false);
  const [err,  setErr]      = useState<string | null>(null);
  const entrancesRef = useRef<EntranceRow[]>([]);

  const activeCode: EntranceCode = phase === "found" && detected ? detected : manualChoice;
  const activeName = FALLBACK[activeCode].name;

  // 화면 로드 시 GPS 감지 시작
  useEffect(() => {
    getEntrancesFn()
      .then(rows => { entrancesRef.current = rows as EntranceRow[]; })
      .catch(() => {})
      .finally(() => detectNearest());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function detectNearest() {
    if (!("geolocation" in navigator)) { setPhase("manual"); return; }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const candidates = (["NTH_THEATER", "NTH_CABLECAR"] as EntranceCode[]).map(code => {
          const row = entrancesRef.current.find(r => r.code === code);
          const c = (row?.lat != null && row?.lng != null)
            ? { lat: row.lat, lng: row.lng }
            : FALLBACK[code];
          return { code, dist: hav(lat, lng, c.lat, c.lng) };
        });

        candidates.sort((a, b) => a.dist - b.dist);
        const nearest = candidates[0];

        if (nearest.dist <= 200) {           // 200m 이내 → 자동 감지
          setDetected(nearest.code);
          setPhase("found");
          setTimeout(() => speakText(
            `이곳은 ${FALLBACK[nearest.code].name}입니다. 산책 시작 버튼을 누르세요.`
          ), 400);
        } else {
          setPhase("manual");                // 범위 밖 → 수동 선택
        }
      },
      () => setPhase("manual"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  }

  async function handleStart() {
    setErr(null); setBusy(true);
    try {
      if (me?.status === "APPROVED") {
        const r = await startFn({ data: { startEntranceCode: activeCode } });
        navigate({ to: "/walk", search: { walkId: r.walkId, entranceCode: activeCode } as never });
      } else {
        navigate({ to: "/walk", search: { entranceCode: activeCode } as never });
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "산책 시작 실패");
    } finally { setBusy(false); }
  }

  return (
    <AppShell
      title="산책 시작"
      back={{ to: "/" }}
      bottomAction={
        phase !== "detecting" ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={handleStart}
            aria-label={`${activeName}에서 산책 시작`}
          >
            <Footprints aria-hidden size={28} />
            {busy ? "시작 중..." : "산책 시작"}
          </button>
        ) : undefined
      }
    >
      {/* GPS 감지 중 */}
      {phase === "detecting" && (
        <div className="status-card flex items-center gap-4" role="status" aria-live="polite">
          <Navigation aria-hidden size={28} className="shrink-0 animate-pulse" />
          <div>
            <p className="text-xl font-extrabold">현재 위치 확인 중</p>
            <p className="mt-1 text-base text-muted-foreground">
              가장 가까운 입구를 자동으로 찾습니다…
            </p>
          </div>
        </div>
      )}

      {/* 자동 감지 성공 */}
      {phase === "found" && detected && (
        <div className="status-card space-y-2" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <MapPin aria-hidden size={28} className="shrink-0 text-green-600" />
            <p className="text-xl font-extrabold">{FALLBACK[detected].name}</p>
          </div>
          <p className="text-base text-muted-foreground">
            현재 위치에서 가장 가까운 입구로 자동 선택됐습니다.
            다른 입구에서 시작하려면 아래에서 변경하세요.
          </p>
          {/* 변경 원할 때만 선택지 제공 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["NTH_THEATER", "NTH_CABLECAR"] as EntranceCode[]).map(code => (
              <button key={code} type="button"
                onClick={() => { setDetected(code); }}
                className="rounded-xl border-2 border-foreground px-3 py-2 text-base font-bold"
                style={detected === code
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : { background: "var(--card)" }}
                aria-pressed={detected === code}>
                {FALLBACK[code].name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 수동 선택 (범위 밖 or GPS 실패) */}
      {phase === "manual" && (
        <div className="space-y-3">
          <p className="rounded-2xl border-2 border-foreground bg-card px-4 py-3 text-base" role="status">
            GPS로 자동 감지하지 못했습니다. 출발 입구를 선택해 주세요.
          </p>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-xl font-extrabold">출발 입구 선택</legend>
            {(["NTH_THEATER", "NTH_CABLECAR"] as EntranceCode[]).map(code => (
              <label key={code} htmlFor={`r-${code}`}
                className="status-card flex items-start gap-4 cursor-pointer"
                style={manualChoice === code
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : undefined}>
                <input id={`r-${code}`} type="radio" name="entrance"
                  checked={manualChoice === code}
                  onChange={() => setManualChoice(code)}
                  className="mt-1 h-6 w-6" />
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-extrabold leading-tight">{FALLBACK[code].name}</p>
                  <p className="mt-1 text-base opacity-90">
                    {code === "NTH_THEATER" ? "북측순환로 동쪽 시작점" : "북측순환로 서쪽 시작점"}
                  </p>
                </div>
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {err && (
        <p role="alert" className="rounded-xl border-2 border-foreground bg-[var(--danger)] px-4 py-3 text-lg font-bold text-[var(--danger-foreground)]">
          {err}
        </p>
      )}
    </AppShell>
  );
}
