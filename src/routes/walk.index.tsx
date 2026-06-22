import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Navigation, AlertTriangle, PhoneCall, Square,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppShell } from "@/components/walk/AppShell";
import { useMe } from "@/hooks/useMe";
import { endWalk, nearbyHazards, hazardFeedback } from "@/lib/namsan.functions";

const search = z.object({ walkId: z.string().optional() });

export const Route = createFileRoute("/walk/")({
  head: () => ({ meta: [{ title: "산책 중 · 남산 산책" }] }),
  validateSearch: (s) => search.parse(s),
  component: WalkScreen,
});

type Coords = { lat: number; lng: number; acc: number; heading: number | null };
type HazardLite = {
  id: string; type: string; label: string | null; side: string;
  description: string | null; lat: number | null; lng: number | null;
  verified: boolean; verification_status: string; reporter_type: string;
  expires_at: string | null;
};

function WalkScreen() {
  const { data: me } = useMe();
  const { walkId } = Route.useSearch();
  const navigate = useNavigate();
  const endFn = useServerFn(endWalk);
  const nearbyFn = useServerFn(nearbyHazards);
  const feedbackFn = useServerFn(hazardFeedback);

  const [permission, setPermission] = useState<"idle" | "requested" | "granted" | "denied">("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [meters, setMeters] = useState(0);
  const [hazards, setHazards] = useState<HazardLite[]>([]);
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<Coords | null>(null);
  const lastHazardCheck = useRef<number>(0);

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
        // Poll nearby hazards at most every 20s
        const now = Date.now();
        if (now - lastHazardCheck.current > 20_000) {
          lastHazardCheck.current = now;
          nearbyFn({ data: { lat: c.lat, lng: c.lng, radiusM: 100 } })
            .then((rows) => setHazards(rows as HazardLite[]))
            .catch(() => { /* noop */ });
        }
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
      {permission !== "granted" && (
        <button type="button" className="btn-secondary" onClick={requestLocation}>
          <Navigation aria-hidden size={22} /> 위치 권한 요청
        </button>
      )}

      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3">
        <p className="text-lg font-extrabold">
          {Math.round(meters)} m · 다음 안내 {nextAnnouncement} m
        </p>
        <button type="button" className="btn-secondary min-h-12 px-3"
          onClick={() => setVoiceOn((v) => !v)}
          aria-label={voiceOn ? "음성 안내 끄기" : "음성 안내 켜기"}>
          {voiceOn ? <Mic aria-hidden size={22} /> : <MicOff aria-hidden size={22} />}
          {voiceOn ? "음성 켜짐" : "음성 꺼짐"}
        </button>
      </div>

      <button type="button" className="btn-secondary"
        onClick={() => navigate({ to: "/report-hazard" })}
        aria-label="위험 신고 화면으로 이동">
        <AlertTriangle aria-hidden size={22} /> 공사 및 위험 신고
      </button>

      {hazards.length > 0 && (
        <section aria-label="근처 위험 안내" className="space-y-3">
          {hazards.map((h) => {
            const adminConfirmed = h.verification_status === "ADMIN_CONFIRMED";
            const sideText = sideLabel(h.side);
            return (
              <article key={h.id} className="status-card space-y-2"
                style={{ background: adminConfirmed ? "var(--warning)" : "var(--card)", color: adminConfirmed ? "var(--warning-foreground)" : "var(--foreground)" }}>
                <p className="text-xl font-extrabold">{h.label ?? h.type}</p>
                <p className="text-base">{sideText}에 제보가 있습니다.</p>
                {h.description && <p className="text-sm">{h.description}</p>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button className="btn-secondary min-h-12"
                    onClick={() => feedbackFn({ data: { id: h.id, vote: "STILL_THERE" } })}>
                    아직 있어요
                  </button>
                  <button className="btn-secondary min-h-12"
                    onClick={() => feedbackFn({ data: { id: h.id, vote: "GONE" } })}>
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

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
