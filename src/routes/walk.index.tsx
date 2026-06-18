import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Navigation, AlertTriangle, PhoneCall, Square, Compass,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe } from "@/hooks/useMe";
import { endWalk, nearbyHazards, hazardFeedback } from "@/lib/namsan.functions";

const search = z.object({ walkId: z.string().optional() });

export const Route = createFileRoute("/walk/")({
  head: () => ({ meta: [{ title: "산책 중 · 남산 산책" }] }),
  validateSearch: (s) => search.parse(s),
  component: WalkScreen,
});

type Coords = { lat: number; lng: number; acc: number; heading: number | null };

function WalkScreen() {
  const { data: me } = useMe();
  const { walkId } = Route.useSearch();
  const navigate = useNavigate();
  const endFn = useServerFn(endWalk);

  const [permission, setPermission] = useState<"idle" | "requested" | "granted" | "denied">("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [meters, setMeters] = useState(0);
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<Coords | null>(null);

  function speak(text: string) {
    if (!voiceOn) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      window.speechSynthesis.speak(u);
    } catch { /* noop */ }
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) { setPermission("denied"); return; }
    setPermission("requested");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermission("granted");
        const c: Coords = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          acc: pos.coords.accuracy, heading: pos.coords.heading,
        };
        setCoords(c);
        if (lastPos.current) {
          const d = haversine(lastPos.current.lat, lastPos.current.lng, c.lat, c.lng);
          if (d < 50) setMeters((m) => m + d);
        }
        lastPos.current = c;
      },
      () => setPermission("denied"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
  }

  function stopTracking() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  useEffect(() => () => stopTracking(), []);

  useEffect(() => {
    if (!voiceOn) return;
    const next = Math.floor(meters / 200) * 200 + 200;
    if (meters > 0 && Math.floor(meters) % 200 === 0) {
      speak(`${Math.floor(meters)} 미터 지점입니다. 다음 안내는 ${next} 미터.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(meters / 200)]);

  // /walk is open to everyone (including guests / PENDING). Only certain
  // actions like 원터치복지콜 require APPROVED — gated at action time.
  const isApproved = me?.status === "APPROVED";

  const acc = coords?.acc;
  const nextAnnouncement = Math.floor(meters / 200) * 200 + 200;

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
      <StatusCard
        tone={permission === "granted" ? "success" : permission === "denied" ? "danger" : "warning"}
        icon={<Compass aria-hidden size={28} />}
        eyebrow="위치"
        title={
          permission === "granted" ? `GPS 정확도 약 ${Math.round(acc ?? 0)} m`
          : permission === "denied" ? "위치 권한이 거부되었습니다"
          : "위치 권한이 필요합니다"
        }
        description={
          permission === "granted" ? "현재 위치를 추적 중입니다. 위치 정보는 본인 안내에만 사용됩니다."
          : "아래 버튼으로 위치 권한을 요청하세요."
        }
      >
        {permission !== "granted" && (
          <button type="button" className="btn-secondary" onClick={requestLocation}>
            <Navigation aria-hidden size={22} /> 위치 권한 요청
          </button>
        )}
      </StatusCard>

      <StatusCard
        tone={voiceOn ? "success" : "neutral"}
        icon={voiceOn ? <Mic aria-hidden size={28} /> : <MicOff aria-hidden size={28} />}
        eyebrow="음성 안내"
        title={voiceOn ? "음성 안내 켜짐" : "음성 안내 꺼짐"}
        description="200m마다 안내합니다. 화면을 보지 않아도 진행 상황을 들을 수 있습니다."
      >
        <button type="button" className="btn-secondary" onClick={() => setVoiceOn((v) => !v)}>
          {voiceOn ? "음성 안내 끄기" : "음성 안내 켜기"}
        </button>
      </StatusCard>

      <StatusCard
        tone="info"
        icon={<Navigation aria-hidden size={28} />}
        eyebrow="거리 안내"
        title={`이동 거리 약 ${Math.round(meters)} m`}
        description={`다음 안내 지점: ${nextAnnouncement} m`}
      />

      <StatusCard
        tone="warning"
        icon={<AlertTriangle aria-hidden size={28} />}
        eyebrow="위험 안내"
        title="미검증 안전 데이터는 표시하지 않습니다"
        description="현장 검증된 위험만 안내됩니다. 위험을 직접 신고하려면 아래 버튼을 사용하세요 (다음 단계)."
      >
        <button type="button" className="btn-secondary" disabled>
          위험 신고 (준비 중)
        </button>
      </StatusCard>
    </AppShell>
  );
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
