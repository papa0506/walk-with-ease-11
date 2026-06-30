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
import { useWalkAudio } from "@/hooks/useWalkAudio";
import {
  endWalk, nearbyHazards, hazardFeedback,
  nearbyLandmarks, upsertMyLocation,
  getRouteWalkers, getWalkMilestones, getEntrances,
} from "@/lib/namsan.functions";

const search = z.object({ walkId: z.string().optional(), entranceCode: z.string().optional() });

export const Route = createFileRoute("/walk/")({
  head: () => ({ meta: [{ title: "산책 중 · 남산 산책" }] }),
  validateSearch: (s) => search.parse(s),
  component: WalkScreen,
});

// ── 타입 ─────────────────────────────────────────────────
type EntranceRow = { code: string; name: string; lat: number | null; lng: number | null };
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
const GPS_MAX_ACC  = 50;   // 정확도 50m 초과 신호 무시
const GPS_MIN_DIST = 2;    // 2m 이상 이동 시 거리 누적
const MILESTONE_SNAP_M = 30; // 마일스톤 30m 이내 진입 시 위치 보정

// 추적 알림 임계값(m)
const TRACK_THRESHOLDS = [500, 200, 100, 50, 20];

// ── Kalman 필터 (GPS 위치 보정) ───────────────────────────
// 단순 지수평활 대신 Kalman 필터 사용 → 오차 누적 최소화
class KalmanGPS {
  private lat = 0; private lng = 0;
  private P = 1e-3; // 초기 위치 불확실성 (도² 단위)
  private initialized = false;

  update(newLat: number, newLng: number, accuracyM: number): { lat: number; lng: number } {
    // 측정 노이즈: GPS 정확도를 도 단위로 변환 (1도 ≈ 111km)
    const R = Math.pow(accuracyM / 111_000, 2);
    if (!this.initialized) {
      this.lat = newLat; this.lng = newLng;
      this.P = R; this.initialized = true;
      return { lat: this.lat, lng: this.lng };
    }
    // 프로세스 노이즈 (이동에 의한 위치 변화)
    const Q = 1e-8;
    this.P += Q;
    // Kalman 게인
    const K = this.P / (this.P + R);
    this.lat += K * (newLat - this.lat);
    this.lng += K * (newLng - this.lng);
    this.P *= (1 - K);
    return { lat: this.lat, lng: this.lng };
  }

  // 마일스톤 좌표로 절대 위치 보정 (앵커링)
  anchor(lat: number, lng: number, accuracyM: number) {
    const R = Math.pow(accuracyM / 111_000, 2);
    this.lat = lat; this.lng = lng;
    this.P = R;
  }
}

// ── 유틸 ─────────────────────────────────────────────────
function hav(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, r = (d: number) => d * Math.PI / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 +
    Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/** 랜드마크 기록 방향과 현재 진행 방향이 반대이면 LEFT/RIGHT 뒤집기 */
function shouldFlipSide(
  lmSurveyDir: string,
  entranceCode: string,
  walkDir: "outbound" | "returning",
): boolean {
  if (!lmSurveyDir || lmSurveyDir === "UNSPEC") return false;
  const userDir =
    entranceCode === "NTH_THEATER"  && walkDir === "outbound"  ? "THEATER_TO_CABLECAR" :
    entranceCode === "NTH_THEATER"  && walkDir === "returning" ? "CABLECAR_TO_THEATER" :
    entranceCode === "NTH_CABLECAR" && walkDir === "outbound"  ? "CABLECAR_TO_THEATER" :
    entranceCode === "NTH_CABLECAR" && walkDir === "returning" ? "THEATER_TO_CABLECAR" : null;
  return userDir != null && lmSurveyDir !== userDir;
}

function flipSide(side: string): string {
  if (side === "LEFT")  return "RIGHT";
  if (side === "RIGHT") return "LEFT";
  return side; // FRONT, BOTH, ALL, NEAR 그대로
}

// 랜드마크 "약 10미터 앞" 안내용 헬퍼
function hasTrailingConsonant(s: string): boolean {
  const code = s.charCodeAt(s.length - 1) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}
const SIDE_TEXT: Record<string, string> = {
  LEFT: "왼쪽", RIGHT: "오른쪽", FRONT: "정면", BOTH: "양쪽", ALL: "길 전체",
};

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

// 남산 북측순환로 입구 fallback 좌표 (DB에 없을 때 사용)
const ENTRANCE_FALLBACK: Record<string, { lat: number; lng: number; name: string }> = {
  NTH_THEATER:  { lat: 37.5537, lng: 126.9971, name: "국립극장 입구" },   // 서울 중구 장충단로 59
  NTH_CABLECAR: { lat: 37.55377, lng: 126.98381, name: "케이블카 방면 입구" }, // 서울 중구 소파로 83
};

// ── 컴포넌트 ─────────────────────────────────────────────
function WalkScreen() {
  const { data: me } = useMe();
  const { walkId, entranceCode } = Route.useSearch();
  const navigate     = useNavigate();
  const audio        = useWalkAudio();

  const endFn          = useServerFn(endWalk);
  const nearbyFn       = useServerFn(nearbyHazards);
  const feedbackFn     = useServerFn(hazardFeedback);
  const landmarkFn     = useServerFn(nearbyLandmarks);
  const upsertLocFn    = useServerFn(upsertMyLocation);
  const routeWalkFn    = useServerFn(getRouteWalkers);
  const getMilestonesFn  = useServerFn(getWalkMilestones);
  const getEntrancesFn   = useServerFn(getEntrances);

  const [permission,   setPermission]   = useState<"idle"|"requested"|"granted"|"denied">("idle");
  const [coords,       setCoords]       = useState<Coords | null>(null);
  const [meters,       setMeters]       = useState(0);
  const [hazards,      setHazards]      = useState<HazardLite[]>([]);
  const [routeWalkers, setRouteWalkers] = useState<RouteWalker[]>([]);
  const [showWalkers,  setShowWalkers]  = useState(false);
  const [trackedUser,  setTrackedUser]  = useState<{ userId: string; name: string } | null>(null);
  const [trackedDist,  setTrackedDist]  = useState<number | null>(null);

  const watchId           = useRef<number | null>(null);
  const kalman            = useRef(new KalmanGPS());
  const lastPos           = useRef<Coords | null>(null);
  const milestonesRef     = useRef<{ id: string; meter: number; lat: number; lng: number; accuracy: number | null }[]>([]);
  const snapAnnouncedRef  = useRef(new Set<string>());  // 마일스톤 앵커 중복 방지
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

  // ── 방향 감지 ──────────────────────────────────────────────
  const [walkDir, setWalkDir]       = useState<"outbound"|"returning">("outbound");
  const walkDirRef                  = useRef<"outbound"|"returning">("outbound");
  const startEntranceRef            = useRef<{ lat: number; lng: number; name: string; otherName: string } | null>(null);
  const distHistory                 = useRef<number[]>([]);  // 최근 8개 distFromStart 이력
  const dirAnnounced                = useRef(false);         // 방향 전환 중복 방지



  // ── 200m 안내 (마일스톤 앵커가 없는 구간 백업용) ───────────
  // 마일스톤 GPS 좌표 근처에서는 앵커링이 자동 안내하므로 중복 방지
  const meterBucket = Math.floor(meters / 200);
  const prevBucket  = useRef(-1);
  useEffect(() => {
    if (!audio.voiceOn || meters < 200) return;
    if (meterBucket === prevBucket.current) return;
    prevBucket.current = meterBucket;
    const cur = meterBucket * 200;
    // 마일스톤 근처(±30m)에서는 앵커링이 이미 안내했으므로 스킵
    const nearMs = milestonesRef.current.some(ms => Math.abs(ms.meter - cur) <= 30);
    if (!nearMs) {
      audio.speakDistance(cur);
    }
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
        audio.speak(
          th <= 20
            ? `${trackedUser.name}님을 곧 만납니다!`
            : `${trackedUser.name}님과 ${th}미터 거리입니다.`
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

        // Kalman 필터로 위치 평활화 (지수평활 대비 오차 누적 최소화)
        const filtered = kalman.current.update(raw.lat, raw.lng, raw.acc);
        const c: Coords = { ...raw, lat: filtered.lat, lng: filtered.lng };
        setCoords(c);

        // 마일스톤 앵커링: 기록된 GPS 좌표 30m 이내 진입 시 위치 보정
        for (const ms of milestonesRef.current) {
          const distToMs = hav(c.lat, c.lng, ms.lat, ms.lng);
          if (distToMs <= MILESTONE_SNAP_M && !snapAnnouncedRef.current.has(ms.id)) {
            snapAnnouncedRef.current.add(ms.id);
            // Kalman 필터 앵커 업데이트 (절대 위치 보정)
            kalman.current.anchor(ms.lat, ms.lng, ms.accuracy ?? 10);
            // 누적 거리도 마일스톤 값으로 보정
            setMeters(ms.meter);
            if (audio.voiceOn) {
              audio.speakDistance(ms.meter);
            }
            // 재진입 허용: 30m 벗어나면 다시 알릴 수 있게
            setTimeout(() => snapAnnouncedRef.current.delete(ms.id), 60_000);
            break;
          }
        }

        // ── 거리 누적 + 방향 감지 ────────────────────────────
        const entrance = startEntranceRef.current;
        if (entrance) {
          // 입구 기준: distFromStart = 이 지점에서 출발 입구까지 haversine
          const distFromStart = hav(c.lat, c.lng, entrance.lat, entrance.lng);
          setMeters(Math.round(distFromStart));

          // 최근 이력에 추가 (최대 8개)
          distHistory.current.push(distFromStart);
          if (distHistory.current.length > 8) distHistory.current.shift();

          // 방향 판단: 이력 6개 이상일 때 첫 번째 vs 마지막 비교
          if (distHistory.current.length >= 6) {
            const oldest = distHistory.current[0];
            const newest = distHistory.current[distHistory.current.length - 1];
            const wasOutbound = walkDirRef.current === "outbound";

            if (wasOutbound && newest < oldest - 18) {
              // 방향 전환: 출발지 쪽으로 돌아오는 중
              walkDirRef.current = "returning";
              setWalkDir("returning");
              if (!dirAnnounced.current) {
                dirAnnounced.current = true;
                audio.speakByKey(
                    entrance.name.includes("국립극장") ? "dir-return-theater" : "dir-fwd-cablecar"
                  );
                setTimeout(() => { dirAnnounced.current = false; }, 30_000);
              }
            } else if (!wasOutbound && newest > oldest + 18) {
              // 다시 앞으로 출발
              walkDirRef.current = "outbound";
              setWalkDir("outbound");
              if (!dirAnnounced.current) {
                dirAnnounced.current = true;
                audio.speakByKey(
                    entrance.otherName.includes("케이블카") ? "dir-fwd-cablecar" : "dir-return-theater"
                  );
                setTimeout(() => { dirAnnounced.current = false; }, 30_000);
              }
            }
          }
        } else {
          // 입구 정보 없을 때: 기존 누적 방식
          if (lastPos.current) {
            const d = hav(lastPos.current.lat, lastPos.current.lng, c.lat, c.lng);
            if (d >= GPS_MIN_DIST) { setMeters(m => m + d); lastPos.current = c; }
          } else { lastPos.current = c; }
        }

        const now = Date.now();

        // 위험 폴링 (20초)
        if (now - lastHazardCheck.current > 20_000) {
          lastHazardCheck.current = now;
          nearbyFn({ data: { lat: c.lat, lng: c.lng, radiusM: 100 } })
            .then(r => setHazards(r as HazardLite[])).catch(() => {});
        }

        // 랜드마크 폴링 (10초, 반경 65m — 접근 전 미리 안내)
        if (now - lastLandmarkCheck.current > 10_000) {
          lastLandmarkCheck.current = now;
          landmarkFn({ data: {
                lat: c.lat, lng: c.lng, radiusM: 20,
                entranceCode: entranceCode ?? undefined,
                walkDir: walkDirRef.current,
              }})
            .then(rows => {
              (rows as LandmarkLite[]).forEach(lm => {
                if (announcedLandmarks.current.has(lm.id)) return;
                announcedLandmarks.current.add(lm.id);
                setTimeout(() => announcedLandmarks.current.delete(lm.id), 30_000);
                // 진행 방향이 기록 방향과 반대이면 LEFT↔RIGHT 뒤집기
                const flip = shouldFlipSide(
                  (lm as any).survey_direction ?? "UNSPEC",
                  entranceCode ?? "",
                  walkDirRef.current,
                );
                const effectiveSide = flip ? flipSide(lm.side) : lm.side;
                // "약 10미터 앞" 안내 문구 생성
                const rawName = lm.custom_name ?? lm.name;
                const particle = hasTrailingConsonant(rawName) ? "이" : "가";
                const sideText = SIDE_TEXT[effectiveSide] ?? "근처";
                const customAnn = lm.announcement
                  ?? `약 10미터 앞, ${sideText}에 ${rawName}${particle} 있습니다.`;
                audio.speakLandmark(effectiveSide, rawName, false, customAnn);
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
                audio.speak(`${w.name}님이 근처 ${w.distance}미터에 계십니다.`);
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

  // ── GPS 자동 시작 (산책 화면 진입 시 자동으로 위치 권한 요청) ──────
  useEffect(() => {
    startGps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 마일스톤 로드 (위치 보정 앵커 데이터) ───────────────
  useEffect(() => {
    getMilestonesFn().then(rows => {
      milestonesRef.current = (rows as any[])
        .filter(m => m.lat != null && m.lng != null)
        .map(m => ({ id: m.id, meter: m.meter, lat: m.lat, lng: m.lng, accuracy: m.accuracy }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 입구 좌표 로드 → 방향 감지 기준점 설정 ─────────────────
  useEffect(() => {
    if (!entranceCode) return; // 입구 미선택 시 생략
    getEntrancesFn().then(rows => {
      const list = rows as EntranceRow[];
      const selected = list.find(r => r.code === entranceCode);
      const other    = list.find(r => r.code !== entranceCode && r.code !== "");
      const selfFb   = ENTRANCE_FALLBACK[entranceCode];
      const otherFb  = Object.entries(ENTRANCE_FALLBACK).find(([k]) => k !== entranceCode)?.[1];
      const lat  = selected?.lat  ?? selfFb?.lat  ?? null;
      const lng  = selected?.lng  ?? selfFb?.lng  ?? null;
      const name = selected?.name ?? selfFb?.name ?? entranceCode;
      const otherName = other?.name ?? otherFb?.name ?? "반대편 입구";
      if (lat != null && lng != null) {
        startEntranceRef.current = { lat, lng, name, otherName };
        // 사전 음성 캐시 로딩 (비동기 백그라운드)
        // 모든 거리/방향 파일 사전 로드
        const distKeys = Array.from({length: 17}, (_, i) => `d${(i+1)*200}`);
        audio.preload([
          ...distKeys,
          "dir-return-theater", "dir-fwd-cablecar",
          "side-left", "side-right", "side-front", "side-both", "side-near",
          "v-here", "v-caution",
        ]);
        if (audio.voiceOn) {
          const startKey = entranceCode === "NTH_THEATER" ? "ent-start-theater" : "ent-start-cablecar";
          audio.speakByKey(startKey);
        }
      }
    }).catch(() => {
      // fallback 좌표 사용
      const fb = ENTRANCE_FALLBACK[entranceCode];
      const otherFb = Object.entries(ENTRANCE_FALLBACK).find(([k]) => k !== entranceCode)?.[1];
      if (fb) {
        startEntranceRef.current = { lat: fb.lat, lng: fb.lng, name: fb.name, otherName: otherFb?.name ?? "반대편 입구" };
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entranceCode]);

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
    audio.speak(`${w.name}님 추적을 시작합니다.`);
    setShowWalkers(false);
  }
  function stopTracking() {
    audio.speak(`${trackedUser?.name}님 추적을 종료합니다.`);
    setTrackedUser(null); trackedUserRef.current = null;
    setTrackedDist(null); lastTrackedDist.current = null;
  }

  const isApproved   = me?.status === "APPROVED";


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

      {/* 음성 허용 버튼 — 첫 탭에서 AudioContext 잠금 해제 (iOS/Android 필수) */}
      {!audio.audioUnlocked && (
        <button
          type="button"
          className="btn-primary"
          style={{ fontSize: "1.25rem", padding: "1.2rem" }}
          onClick={() => {
            audio.unlockAudio();
            audio.setVoiceOn(true);
            
            // 입구명 포함 시작 안내
            const entranceName = startEntranceRef.current?.name ?? "";
            setTimeout(() => {
              // static 파일 우선: 입구 코드가 있으면 맞는 키, 없으면 sys-start
              const startAudioKey = entranceCode === "NTH_THEATER"  ? "ent-start-theater"
                                  : entranceCode === "NTH_CABLECAR" ? "ent-start-cablecar"
                                  : "sys-start";
              audio.speakByKey(startAudioKey);
            }, 300);
          }}
          aria-label="음성 안내 시작 — 탭하면 GPS 위치와 음성이 활성화됩니다">
          <Navigation aria-hidden size={22} /> 음성 안내 시작 (탭하세요)
        </button>
      )}

      {/* 거리 + 음성 토글 */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3">
        <div>
          <p className="text-base text-muted-foreground">
            {startEntranceRef.current
              ? (walkDir === "outbound"
                  ? `${startEntranceRef.current.otherName} 방향`
                  : `${startEntranceRef.current.name} 복귀 중`)
              : "이동 중"}
          </p>
          <p className="text-3xl font-extrabold">{Math.round(meters)} m</p>
          {coords && (
            <p className="text-sm text-muted-foreground">
              GPS 정확도 약 {Math.round(coords.acc)} m
            </p>
          )}
        </div>
        {/* 음성 토글 */}
        <button type="button" className="btn-secondary min-h-12 px-3"
          onClick={() => {
            if (!audio.audioUnlocked) { audio.unlockAudio(); }
            audio.setVoiceOn(!audio.voiceOn);
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
