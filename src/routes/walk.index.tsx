import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic, MicOff, Navigation, AlertTriangle, PhoneCall, Square, Users,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppShell } from "@/components/walk/AppShell";
import { useMe } from "@/hooks/useMe";
import {
  endWalk, nearbyHazards, hazardFeedback,
  nearbyLandmarks, upsertMyLocation, getNearbyWalkers,
} from "@/lib/namsan.functions";

const search = z.object({ walkId: z.string().optional() });

export const Route = createFileRoute("/walk/")({
  head: () => ({ meta: [{ title: "산책 중 · 남산 산책" }] }),
  validateSearch: (s) => search.parse(s),
  component: WalkScreen,
});

// ── 타입 ──────────────────────────────────────────────────
type Coords = { lat: number; lng: number; acc: number; heading: number | null };

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

type NearbyWalker = { userId: string; name: string; distance: number };

// ── GPS 스무딩: 지수이동평균 ──────────────────────────────
const GPS_ALPHA = 0.3; // 낮을수록 더 부드러움 (0.1~0.5)
const GPS_MAX_ACCURACY = 50; // 50m 이상 오차는 무시
const GPS_MIN_DISTANCE = 2;  // 2m 미만 이동은 노이즈로 무시

function smoothCoords(prev: Coords | null, next: Coords): Coords {
  if (!prev) return next;
  return {
    lat: prev.lat + GPS_ALPHA * (next.lat - prev.lat),
    lng: prev.lng + GPS_ALPHA * (next.lng - prev.lng),
    acc: next.acc,
    heading: next.heading,
  };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function sideLabel(side: string): string {
  switch (side) {
    case "LEFT": return "진행 방향 왼쪽";
    case "RIGHT": return "진행 방향 오른쪽";
    case "FRONT": return "정면";
    case "BOTH": return "양쪽";
    case "ALL": return "길 전체";
    default: return "근처";
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────
function WalkScreen() {
  const { data: me } = useMe();
  const { walkId } = Route.useSearch();
  const navigate = useNavigate();

  const endFn       = useServerFn(endWalk);
  const nearbyFn    = useServerFn(nearbyHazards);
  const feedbackFn  = useServerFn(hazardFeedback);
  const landmarkFn  = useServerFn(nearbyLandmarks);
  const upsertLocFn = useServerFn(upsertMyLocation);
  const walkersFn   = useServerFn(getNearbyWalkers);

  const [permission, setPermission] = useState<"idle" | "requested" | "granted" | "denied">("idle");
  const [coords, setCoords]         = useState<Coords | null>(null);
  const [voiceOn, setVoiceOn]       = useState(false);
  const [meters, setMeters]         = useState(0);
  const [hazards, setHazards]       = useState<HazardLite[]>([]);
  const [walkers, setWalkers]       = useState<NearbyWalker[]>([]);

  const watchId           = useRef<number | null>(null);
  const smoothedPos       = useRef<Coords | null>(null);
  const lastPos           = useRef<Coords | null>(null);
  const lastHazardCheck   = useRef<number>(0);
  const lastLandmarkCheck = useRef<number>(0);
  const lastLocationPush  = useRef<number>(0);
  const lastWalkersCheck  = useRef<number>(0);
  const announcedLandmarks = useRef<Set<string>>(new Set());
  const announcedWalkers   = useRef<Set<string>>(new Set());
  const voiceQueue         = useRef<string[]>([]);
  const speakingRef        = useRef(false);

  // ── 음성 큐: 겹치지 않게 순서대로 재생 ──────────────────
  const flushQueue = useCallback(() => {
    if (speakingRef.current || voiceQueue.current.length === 0) return;
    const text = voiceQueue.current.shift()!;
    speakingRef.current = true;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.1;
    u.onend = () => { speakingRef.current = false; flushQueue(); };
    u.onerror = () => { speakingRef.current = false; flushQueue(); };
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceOn) return;
    voiceQueue.current.push(text);
    flushQueue();
  }, [voiceOn, flushQueue]);

  // voiceOn 바뀔 때 큐 초기화
  useEffect(() => {
    if (!voiceOn) {
      window.speechSynthesis.cancel();
      voiceQueue.current = [];
      speakingRef.current = false;
    }
  }, [voiceOn]);

  // ── 200m 안내 (버그 수정: 조건 제거) ────────────────────
  const meterBucket = Math.floor(meters / 200);
  useEffect(() => {
    if (!voiceOn || meters < 200) return;
    const current = meterBucket * 200;
    const next = current + 200;
    speak(`${current} 미터 지점입니다. 다음 안내는 ${next} 미터.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meterBucket]);

  // ── GPS 위치 추적 ────────────────────────────────────────
  function requestLocation() {
    if (!("geolocation" in navigator)) { setPermission("denied"); return; }
    setPermission("requested");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermission("granted");
        const raw: Coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
          heading: pos.coords.heading,
        };

        // 정확도 낮은 신호 무시
        if (raw.acc > GPS_MAX_ACCURACY) return;

        // 지수이동평균으로 스무딩
        const c = smoothCoords(smoothedPos.current, raw);
        smoothedPos.current = c;
        setCoords(c);

        // 거리 누적 (최소 2m 이상 이동만 반영)
        if (lastPos.current) {
          const d = haversine(lastPos.current.lat, lastPos.current.lng, c.lat, c.lng);
          if (d >= GPS_MIN_DISTANCE) {
            setMeters((m) => m + d);
            lastPos.current = c;
          }
        } else {
          lastPos.current = c;
        }

        const now = Date.now();

        // 위험 폴링 (20초마다)
        if (now - lastHazardCheck.current > 20_000) {
          lastHazardCheck.current = now;
          nearbyFn({ data: { lat: c.lat, lng: c.lng, radiusM: 100 } })
            .then((rows) => setHazards(rows as HazardLite[]))
            .catch(() => {});
        }

        // 랜드마크 폴링 (30초마다)
        if (now - lastLandmarkCheck.current > 30_000) {
          lastLandmarkCheck.current = now;
          landmarkFn({ data: { lat: c.lat, lng: c.lng, radiusM: 35 } })
            .then((rows) => {
              (rows as LandmarkLite[]).forEach((lm) => {
                if (announcedLandmarks.current.has(lm.id)) return;
                announcedLandmarks.current.add(lm.id);
                // 30초 뒤 재알림 허용 (다시 지나칠 때를 위해)
                setTimeout(() => announcedLandmarks.current.delete(lm.id), 30_000);
                const msg = lm.announcement
                  ?? `${sideLabel(lm.side)}에 ${lm.custom_name ?? lm.name}이(가) 있습니다.`;
                speak(msg);
              });
            })
            .catch(() => {});
        }

        // 내 위치 서버 업로드 (15초마다, 승인된 사용자만)
        if (me?.status === "APPROVED" && me.default_share_mode !== "PRIVATE") {
          if (now - lastLocationPush.current > 15_000) {
            lastLocationPush.current = now;
            upsertLocFn({ data: { lat: c.lat, lng: c.lng, accuracy: c.acc, walkSessionId: walkId ?? null } })
              .catch(() => {});
          }
        }

        // 근처 이용자 폴링 (30초마다)
        if (me && now - lastWalkersCheck.current > 30_000) {
          lastWalkersCheck.current = now;
          walkersFn({ data: { lat: c.lat, lng: c.lng, radiusM: 150 } })
            .then((rows) => {
              const list = rows as NearbyWalker[];
              setWalkers(list);
              // 새로 나타난 사람만 음성 알림
              list.forEach((w) => {
                if (announcedWalkers.current.has(w.userId)) return;
                announcedWalkers.current.add(w.userId);
                setTimeout(() => announcedWalkers.current.delete(w.userId), 60_000);
                speak(`${w.name}님이 근처 ${w.distance}미터 앞에 계십니다.`);
              });
              // 자리 뜬 사람 제거
              const ids = new Set(list.map((w) => w.userId));
              announcedWalkers.current.forEach((id) => { if (!ids.has(id)) announcedWalkers.current.delete(id); });
            })
            .catch(() => {});
        }
      },
      () => setPermission("denied"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }

  function stopTracking() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  useEffect(() => () => stopTracking(), []);

  const isApproved = me?.status === "APPROVED";
  const nextAnnouncement = meterBucket * 200 + 200;

  return (
    <AppShell
      title="산책 중"
      back={{ to: "/" }}
      bottomAction={
        <div className="space-y-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (!isApproved) {
                alert("원터치 복지콜은 관리자 승인 후 사용할 수 있습니다.");
                return;
              }
              navigate({ to: "/onetouch" });
            }}
            aria-label="원터치 복지콜 호출"
          >
            <PhoneCall aria-hidden size={26} /> 원터치 복지콜
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={async () => {
              stopTracking();
              if (walkId) { try { await endFn({ data: { walkId } }); } catch { /* noop */ } }
              navigate({ to: "/" });
            }}
            aria-label="산책 종료"
          >
            <Square aria-hidden size={22} /> 산책 종료
          </button>
        </div>
      }
    >
      {/* 위치 권한 요청 */}
      {permission !== "granted" && (
        <button type="button" className="btn-secondary" onClick={requestLocation}>
          <Navigation aria-hidden size={22} /> 위치 권한 요청
        </button>
      )}

      {/* 거리 표시 + 음성 토글 */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3">
        <div>
          <p className="text-lg font-extrabold">
            {Math.round(meters)} m · 다음 안내 {nextAnnouncement} m
          </p>
          {coords && (
            <p className="text-sm text-muted-foreground">
              GPS 정확도 {Math.round(coords.acc)} m
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary min-h-12 px-3"
          onClick={() => setVoiceOn((v) => !v)}
          aria-label={voiceOn ? "음성 안내 끄기" : "음성 안내 켜기"}
        >
          {voiceOn ? <Mic aria-hidden size={22} /> : <MicOff aria-hidden size={22} />}
          {voiceOn ? "음성 켜짐" : "음성 꺼짐"}
        </button>
      </div>

      {/* 위험 신고 버튼 */}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => navigate({ to: "/report-hazard" })}
        aria-label="위험 신고 화면으로 이동"
      >
        <AlertTriangle aria-hidden size={22} /> 공사 및 위험 신고
      </button>

      {/* 근처 이용자 */}
      {walkers.length > 0 && (
        <section aria-label="근처 이용자" className="space-y-2">
          <p className="flex items-center gap-2 text-lg font-extrabold">
            <Users aria-hidden size={20} /> 근처 이용자 {walkers.length}명
          </p>
          {walkers.map((w) => (
            <div key={w.userId} className="status-card flex items-center justify-between">
              <span className="text-base font-bold">{w.name}님</span>
              <span className="text-base text-muted-foreground">약 {w.distance}m</span>
            </div>
          ))}
        </section>
      )}

      {/* 근처 위험 */}
      {hazards.length > 0 && (
        <section aria-label="근처 위험 안내" className="space-y-3">
          {hazards.map((h) => {
            const adminConfirmed = h.verification_status === "ADMIN_CONFIRMED";
            return (
              <article
                key={h.id}
                className="status-card space-y-2"
                style={{
                  background: adminConfirmed ? "var(--warning)" : "var(--card)",
                  color: adminConfirmed ? "var(--warning-foreground)" : "var(--foreground)",
                }}
              >
                <p className="text-xl font-extrabold">{h.label ?? h.type}</p>
                <p className="text-base">{sideLabel(h.side)}에 제보가 있습니다.</p>
                {h.description && <p className="text-sm">{h.description}</p>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    className="btn-secondary min-h-12"
                    onClick={() => feedbackFn({ data: { id: h.id, vote: "STILL_THERE" } })}
                  >
                    아직 있어요
                  </button>
                  <button
                    className="btn-secondary min-h-12"
                    onClick={() => feedbackFn({ data: { id: h.id, vote: "GONE" } })}
                  >
                    없어졌어요
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </AppShell>
  );
}
