import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Navigation, AlertTriangle, PhoneCall, Square,
  Users, UserCheck, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppShell } from "@/components/walk/AppShell";
import { useMe } from "@/hooks/useMe";
import { useAudioAnnouncer } from "@/hooks/useAudioAnnouncer";
import {
  endWalk, nearbyHazards, hazardFeedback,
  nearbyLandmarks, upsertMyLocation,
  getRouteWalkers,
} from "@/lib/namsan.functions";

const search = z.object({ walkId: z.string().optional() });

export const Route = createFileRoute("/walk/")({
  head: () => ({ meta: [{ title: "산책 중 · 남산 산책" }] }),
  validateSearch: (s) => search.parse(s),
  component: WalkScreen,
});

// ── 타입 ─────────────────────────────────────────────────
type Coords     = { lat: number; lng: number; acc: number; heading: number | null };
type HazardLite = {
  id: string; type: string; label: string | null; side: string;
  description: string | null; lat: number | null; lng: number | null;
  verified: boolean; verification_status: string; reporter_type: string;
  expires_at: string | null;
};
type LandmarkLite = {
  id: string; name: string; type: string | null; custom_name: string | null;
  announcement: string | null; direction_hint: string | null;
  side: string; route_meter: number | null;
};
type RouteWalker = {
  userId: string; name: string;
  distance: number | null;
  updatedSecsAgo: number;
};

// ── GPS 설정 ─────────────────────────────────────────────
const GPS_ALPHA    = 0.25;
const GPS_MAX_ACC  = 50;
const GPS_MIN_DIST = 2;
const BUF_SIZE     = 6;

// 추적 알림 임계값(m)
const TRACK_THRESHOLDS = [500, 200, 100, 50, 20];

// ── 유틸 ─────────────────────────────────────────────────
function hav(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, r = (d: number) => d * Math.PI / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 +
    Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function smooth(prev: Coords | null, next: Coords): Coords {
  if (!prev) return next;
  return { lat: prev.lat + GPS_ALPHA * (next.lat - prev.lat),
           lng: prev.lng + GPS_ALPHA * (next.lng - prev.lng),
           acc: next.acc, heading: next.heading };
}
function bufAvg(buf: { lat: number; lng: number; acc: number }[]) {
  const g = buf.filter(r => r.acc <= GPS_MAX_ACC);
  if (!g.length) return null;
  let w = 0, la = 0, lo = 0;
  for (const r of g) { const ww = 1 / (r.acc * r.acc); w += ww; la += r.lat * ww; lo += r.lng * ww; }
  return { lat: la / w, lng: lo / w };
}
function sideLabel(s: string) {
  return s === "LEFT" ? "진행 방향 왼쪽"
       : s === "RIGHT" ? "진행 방향 오른쪽"
       : s === "FRONT" ? "정면"
       : s === "BOTH"  ? "양쪽"
       : s === "ALL"   ? "길 전체" : "근처";
}
function secsAgo(s: number) { return s < 60 ? `${s}초 전` : `${Math.round(s / 60)}분 전`; }

// ── Wake Lock (화면 꺼짐 방지) ──────────────────────────
async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ("wakeLock" in navigator) {
      return await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } })
        .wakeLock.request("screen");
    }
  } catch { /* 지원 안 하는 기기 무시 */ }
  return null;
}

// ── 컴포넌트 ─────────────────────────────────────────────
function WalkScreen() {
  const { data: me } = useMe();
  const { walkId }   = Route.useSearch();
  const navigate     = useNavigate();
  const audio        = useAudioAnnouncer();

  const endFn       = useServerFn(endWalk);
  const nearbyFn    = useServerFn(nearbyHazards);
  const feedbackFn  = useServerFn(hazardFeedback);
  const landmarkFn  = useServerFn(nearbyLandmarks);
  const upsertLocFn = useServerFn(upsertMyLocation);
  const routeWalkFn = useServerFn(getRouteWalkers);

  const [permission,   setPermission]   = useState<"idle"|"requested"|"granted"|"denied">("idle");
  const [coords,       setCoords]       = useState<Coords | null>(null);
  const [meters,       setMeters]       = useState(0);
  const [hazards,      setHazards]      = useState<HazardLite[]>([]);
  const [routeWalkers, setRouteWalkers] = useState<RouteWalker[]>([]);
  const [showWalkers,  setShowWalkers]  = useState(false);
  const [trackedUser,  setTrackedUser]  = useState<{ userId: string; name: string } | null>(null);
  const [trackedDist,  setTrackedDist]  = useState<number | null>(null);

  const watchId           = useRef<number | null>(null);
  const smoothedPos       = useRef<Coords | null>(null);
  const recentBuf         = useRef<{ lat: number; lng: number; acc: number }[]>([]);
  const lastPos           = useRef<Coords | null>(null);
  const lastHazardCheck   = useRef(0);
  const lastLandmarkCheck = useRef(0);
  const lastLocPush       = useRef(0);
  const lastWalkersCheck  = useRef(0);
  const announcedLandmarks = useRef(new Set<string>());
  const announcedNearby    = useRef(new Set<string>());
  const trackedThresholds  = useRef(new Set<number>());
  const lastTrackedDist    = useRef<number | null>(null);
  const trackedUserRef     = useRef<{ userId: string; name: string } | null>(null);
  const wakeLock           = useRef<WakeLockSentinel | null>(null);

  // ── 200m 안내 ────────────────────────────────────────────
  const meterBucket = Math.floor(meters / 200);
  useEffect(() => {
    if (!audio.voiceOn || meters < 200) return;
    const cur = meterBucket * 200;
    audio.announce(`${cur} 미터 지점입니다. 다음 안내는 ${cur + 200} 미터.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meterBucket]);

  // ── 추적 거리 알림 ────────────────────────────────────────
  useEffect(() => {
    if (!trackedUser || trackedDist == null || !audio.voiceOn) return;
    const prev = lastTrackedDist.current;
    lastTrackedDist.current = trackedDist;
    if (prev != null && trackedDist >= prev) return; // 멀어지는 중
    for (const th of TRACK_THRESHOLDS) {
      if (trackedDist <= th && (prev == null || prev > th) && !trackedThresholds.current.has(th)) {
        trackedThresholds.current.add(th);
        audio.announce(
          th <= 20
            ? `${trackedUser.name}님을 곧 만납니다!`
            : `${trackedUser.name}님과 ${th}미터 거리입니다.`,
          { urgent: th <= 100 }
        );
        break;
      }
    }
    TRACK_THRESHOLDS.forEach(th => { if (trackedDist > th + 30) trackedThresholds.current.delete(th); });
  }, [trackedDist, trackedUser, audio]);

  // ── GPS 추적 ─────────────────────────────────────────────
  const startGps = useCallback(() => {
    if (!("geolocation" in navigator)) { setPermission("denied"); return; }
    setPermission("requested");

    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        setPermission("granted");
        const raw: Coords = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          acc: pos.coords.accuracy, heading: pos.coords.heading,
        };
        if (raw.acc > GPS_MAX_ACC) return;

        recentBuf.current = [...recentBuf.current, raw].slice(-BUF_SIZE);
        const avg = bufAvg(recentBuf.current);
        const blended: Coords = avg ? { ...raw, lat: avg.lat, lng: avg.lng } : raw;
        const c = smooth(smoothedPos.current, blended);
        smoothedPos.current = c;
        setCoords(c);

        if (lastPos.current) {
          const d = hav(lastPos.current.lat, lastPos.current.lng, c.lat, c.lng);
          if (d >= GPS_MIN_DIST) { setMeters(m => m + d); lastPos.current = c; }
        } else { lastPos.current = c; }

        const now = Date.now();

        // 위험 폴링 (20초)
        if (now - lastHazardCheck.current > 20_000) {
          lastHazardCheck.current = now;
          nearbyFn({ data: { lat: c.lat, lng: c.lng, radiusM: 100 } })
            .then(r => setHazards(r as HazardLite[])).catch(() => {});
        }

        // 랜드마크 폴링 (30초)
        if (now - lastLandmarkCheck.current > 30_000) {
          lastLandmarkCheck.current = now;
          landmarkFn({ data: { lat: c.lat, lng: c.lng, radiusM: 35 } })
            .then(rows => {
              (rows as LandmarkLite[]).forEach(lm => {
                if (announcedLandmarks.current.has(lm.id)) return;
                announcedLandmarks.current.add(lm.id);
                setTimeout(() => announcedLandmarks.current.delete(lm.id), 30_000);
                audio.announce(
                  lm.announcement ?? `${sideLabel(lm.side)}에 ${lm.custom_name ?? lm.name}이(가) 있습니다.`
                );
              });
            }).catch(() => {});
        }

        // 내 위치 업로드 (15초)
        if (me?.status === "APPROVED" && me.default_share_mode !== "PRIVATE") {
          if (now - lastLocPush.current > 15_000) {
            lastLocPush.current = now;
            upsertLocFn({ data: { lat: c.lat, lng: c.lng, accuracy: c.acc, walkSessionId: walkId ?? null } })
              .catch(() => {});
          }
        }

        // 전체 경로 이용자 폴링 (30초)
        if (me && now - lastWalkersCheck.current > 30_000) {
          lastWalkersCheck.current = now;
          routeWalkFn({ data: { lat: c.lat, lng: c.lng } })
            .then(rows => {
              const list = rows as RouteWalker[];
              setRouteWalkers(list);

              // 추적 중 거리 업데이트
              const tracked = trackedUserRef.current;
              if (tracked) {
                const found = list.find(w => w.userId === tracked.userId);
                setTrackedDist(found?.distance ?? null);
              }

              // 150m 신규 진입 알림
              list.filter(w => w.distance != null && w.distance <= 150).forEach(w => {
                if (announcedNearby.current.has(w.userId)) return;
                announcedNearby.current.add(w.userId);
                setTimeout(() => announcedNearby.current.delete(w.userId), 90_000);
                audio.announce(`${w.name}님이 근처 ${w.distance}미터에 계십니다.`);
              });
              const nearSet = new Set(list.filter(w => w.distance != null && w.distance <= 150).map(w => w.userId));
              announcedNearby.current.forEach(id => { if (!nearSet.has(id)) announcedNearby.current.delete(id); });
            }).catch(() => {});
        }
      },
      () => setPermission("denied"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 },
    );
  }, [me, walkId, audio, nearbyFn, landmarkFn, upsertLocFn, routeWalkFn]);

  function stopGps() {
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
  }
  useEffect(() => () => stopGps(), []);

  // ── Wake Lock: 산책 중 화면 꺼짐 방지 ───────────────────
  useEffect(() => {
    requestWakeLock().then(l => { wakeLock.current = l; });
    const reacquire = () => {
      if (document.visibilityState === "visible" && !wakeLock.current?.released) {
        requestWakeLock().then(l => { wakeLock.current = l; });
      }
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      wakeLock.current?.release().catch(() => {});
    };
  }, []);

  function startTracking(w: RouteWalker) {
    setTrackedUser({ userId: w.userId, name: w.name });
    trackedUserRef.current = { userId: w.userId, name: w.name };
    setTrackedDist(w.distance);
    lastTrackedDist.current = w.distance;
    trackedThresholds.current.clear();
    audio.announce(`${w.name}님 추적을 시작합니다.`, { beep: false });
    setShowWalkers(false);
  }
  function stopTracking() {
    audio.announce(`${trackedUser?.name}님 추적을 종료합니다.`, { beep: false });
    setTrackedUser(null); trackedUserRef.current = null;
    setTrackedDist(null); lastTrackedDist.current = null;
  }

  const isApproved   = me?.status === "APPROVED";
  const nextAnnounce = meterBucket * 200 + 200;

  return (
    <AppShell title="산책 중" back={{ to: "/" }}
      bottomAction={
        <div className="space-y-3">
          <button type="button" className="btn-primary"
            onClick={() => {
              if (!isApproved) { alert("원터치 복지콜은 관리자 승인 후 사용할 수 있습니다."); return; }
              navigate({ to: "/onetouch" });
            }}
            aria-label="원터치 복지콜 호출">
            <PhoneCall aria-hidden size={26} /> 원터치 복지콜
          </button>
          <button type="button" className="btn-danger"
            onClick={async () => {
              stopGps();
              wakeLock.current?.release().catch(() => {});
              if (walkId) { try { await endFn({ data: { walkId } }); } catch { /**/ } }
              navigate({ to: "/" });
            }}
            aria-label="산책 종료">
            <Square aria-hidden size={22} /> 산책 종료
          </button>
        </div>
      }
    >
      {/*
        aria-live 영역: 스크린리더(VoiceOver/TalkBack) 백업 알림.
        화면에는 보이지 않지만 스크린리더가 읽음.
      */}
      <div
        ref={audio.liveRef as React.RefObject<HTMLDivElement>}
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />

      {/* 위치 권한 */}
      {permission !== "granted" && (
        <button type="button" className="btn-secondary"
          onClick={() => { audio.unlockAudio(); startGps(); }}
          aria-label="위치 권한 요청 및 GPS 시작">
          <Navigation aria-hidden size={22} /> 위치 권한 요청
        </button>
      )}

      {/* 거리 + 음성 토글 */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3">
        <div>
          <p className="text-lg font-extrabold">
            {Math.round(meters)} m · 다음 안내 {nextAnnounce} m
          </p>
          {coords && (
            <p className="text-sm text-muted-foreground">
              GPS 정확도 약 {Math.round(coords.acc)} m
            </p>
          )}
        </div>
        {/* 음성 토글 — 여기서 AudioContext 언락 */}
        <button type="button" className="btn-secondary min-h-12 px-3"
          onClick={() => {
            const next = !audio.voiceOn;
            if (next) audio.unlockAudio(); // 반드시 user-gesture에서
            audio.setVoiceOn(next);
          }}
          aria-label={audio.voiceOn ? "음성 안내 끄기" : "음성 안내 켜기"}
          aria-pressed={audio.voiceOn}>
          {audio.voiceOn ? <Mic aria-hidden size={22} /> : <MicOff aria-hidden size={22} />}
          {audio.voiceOn ? "음성 켜짐" : "음성 꺼짐"}
        </button>
      </div>

      {/* 위험 신고 */}
      <button type="button" className="btn-secondary"
        onClick={() => navigate({ to: "/report-hazard" })}
        aria-label="위험 신고 화면으로 이동">
        <AlertTriangle aria-hidden size={22} /> 공사 및 위험 신고
      </button>

      {/* 추적 배너 */}
      {trackedUser && (
        <div className="flex items-center justify-between rounded-2xl border-2 border-foreground bg-card px-4 py-3"
          role="status" aria-live="polite">
          <div>
            <p className="flex items-center gap-2 text-lg font-extrabold">
              <UserCheck aria-hidden size={20} /> {trackedUser.name}님 추적 중
            </p>
            <p className="text-base text-muted-foreground">
              {trackedDist != null ? `현재 약 ${trackedDist}m 거리` : "거리 계산 중…"}
            </p>
          </div>
          <button type="button" className="btn-secondary px-3 py-2" onClick={stopTracking}
            aria-label="추적 종료">
            <X aria-hidden size={18} /> 추적 종료
          </button>
        </div>
      )}

      {/* 이 길에 있는 이용자 */}
      {routeWalkers.length > 0 && (
        <section aria-label="이 길에 있는 이용자">
          <button type="button"
            className="flex w-full items-center justify-between rounded-2xl border-2 border-foreground bg-card px-4 py-3"
            onClick={() => setShowWalkers(v => !v)}
            aria-expanded={showWalkers}>
            <p className="flex items-center gap-2 text-lg font-extrabold">
              <Users aria-hidden size={20} /> 이 길에 있는 이용자 {routeWalkers.length}명
            </p>
            {showWalkers ? <ChevronUp aria-hidden size={20} /> : <ChevronDown aria-hidden size={20} />}
          </button>
          {showWalkers && (
            <div className="mt-2 space-y-2">
              {routeWalkers.map(w => {
                const isTracked = trackedUser?.userId === w.userId;
                return (
                  <button key={w.userId} type="button"
                    className="status-card flex w-full items-center justify-between gap-3 text-left"
                    style={isTracked ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}
                    onClick={() => isTracked ? stopTracking() : startTracking(w)}
                    aria-label={`${w.name}님, ${w.distance != null ? `약 ${w.distance}미터` : "거리 미상"}, ${secsAgo(w.updatedSecsAgo)} 업데이트됨. ${isTracked ? "추적 중, 탭하면 종료" : "탭하면 추적 시작"}`}>
                    <div>
                      <p className="text-base font-bold">{w.name}님</p>
                      <p className="text-sm opacity-80">
                        {w.distance != null ? `약 ${w.distance}m` : "거리 미상"} · {secsAgo(w.updatedSecsAgo)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold">{isTracked ? "추적 중" : "추적 시작"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 근처 위험 */}
      {hazards.length > 0 && (
        <section aria-label="근처 위험 안내" className="space-y-3">
          {hazards.map(h => {
            const confirmed = h.verification_status === "ADMIN_CONFIRMED";
            return (
              <article key={h.id} className="status-card space-y-2"
                style={{ background: confirmed ? "var(--warning)" : "var(--card)", color: confirmed ? "var(--warning-foreground)" : "var(--foreground)" }}>
                <p className="text-xl font-extrabold">{h.label ?? h.type}</p>
                <p className="text-base">{sideLabel(h.side)}에 제보가 있습니다.</p>
                {h.description && <p className="text-sm">{h.description}</p>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button className="btn-secondary min-h-12"
                    onClick={() => feedbackFn({ data: { id: h.id, vote: "STILL_THERE" } })}>아직 있어요</button>
                  <button className="btn-secondary min-h-12"
                    onClick={() => feedbackFn({ data: { id: h.id, vote: "GONE" } })}>없어졌어요</button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </AppShell>
  );
}
