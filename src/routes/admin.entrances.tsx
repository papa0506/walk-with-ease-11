import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, CheckCircle } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminListEntrances, adminRecordEntrance } from "@/lib/namsan.functions";
import { useGpsAverage } from "@/hooks/useGpsAverage";

export const Route = createFileRoute("/admin/entrances")({
  head: () => ({ meta: [{ title: "입구 보정 · 관리자" }] }),
  component: Entrances,
});

/** 관리자 화면 전용 간단 TTS */
function speakText(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR"; u.rate = 1.0;
  const ko = window.speechSynthesis.getVoices().find(v => v.lang?.startsWith("ko")) ?? null;
  if (ko) u.voice = ko;
  window.speechSynthesis.speak(u);
}

function Entrances() {
  const listFn = useServerFn(adminListEntrances);
  const recFn  = useServerFn(adminRecordEntrance);
  const { data: entrances = [], refetch } = useQuery({
    queryKey: ["entrances"], queryFn: () => listFn(),
  });

  // 입구는 모든 거리 계산의 기준점이므로 마일스톤과 같은 정밀 평균 측정을 사용
  const gps = useGpsAverage(12);
  const [active, setActive] = useState<{ code: string; name: string } | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { tone: "ok" | "err" | "info"; text: string }>>({});
  const savingRef = useRef(false);

  function startMeasure(code: string, name: string) {
    savingRef.current = false;
    setActive({ code, name });
    setMsgs(m => ({ ...m, [code]: { tone: "info", text: "정밀 측정 중… 입구에 서서 잠시 기다려 주세요." } }));
    speakText(`${name} 정밀 측정을 시작합니다. 그 자리에 서 계세요.`);
    gps.start();
  }

  // 수집 완료 → 저장
  useEffect(() => {
    if (!active) return;
    if (gps.status === "done" && gps.result && !savingRef.current) {
      savingRef.current = true;
      const r = gps.result;
      const { code, name } = active;
      recFn({ data: { code, lat: r.lat, lng: r.lng, accuracy: r.accuracy } })
        .then(async () => {
          await refetch();
          const text = `${name} 좌표 저장 완료. ${r.sampleCount}개 샘플 평균, 추정 오차 약 ${r.accuracy.toFixed(1)}미터.`;
          setMsgs(m => ({ ...m, [code]: { tone: "ok", text } }));
          speakText(text);
        })
        .catch((e: unknown) => {
          setMsgs(m => ({ ...m, [code]: { tone: "err", text: `저장 실패: ${e instanceof Error ? e.message : "오류"}` } }));
        })
        .finally(() => setActive(null));
    } else if (gps.status === "error") {
      setMsgs(m => ({ ...m, [active.code]: { tone: "err", text: gps.errorMsg ?? "GPS 오류가 발생했습니다." } }));
      setActive(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.status]);

  return (
    <AppShell title="입구 좌표 보정" back={{ to: "/admin" }}>
      <StatusCard tone="info" icon={<MapPin aria-hidden size={28} />}
        eyebrow="안내"
        title="각 입구에 서서 버튼을 누르세요"
        description="GPS 샘플 12개를 평균해 입구 기준 좌표를 정밀 저장합니다. 측정하는 동안 그 자리에 서 계세요." />

      {(entrances as any[]).map((e) => {
        const isActive = active?.code === e.code;
        const msg = msgs[e.code];
        return (
          <div key={e.id} className="status-card space-y-3">
            <div>
              <p className="text-xl font-extrabold">{e.name}</p>
              <p className="text-sm text-muted-foreground">{e.code}</p>
              <p className="mt-2 text-base">
                마지막 측정: {e.measured_at
                  ? new Date(e.measured_at).toLocaleString("ko-KR")
                  : "없음"} ·
                오차: {e.accuracy != null ? `약 ${Math.round(e.accuracy * 10) / 10}m` : "—"}
              </p>
            </div>

            {isActive && gps.status === "collecting" && (
              <div className="space-y-2" role="status" aria-live="polite">
                <p className="text-lg font-extrabold">
                  샘플 수집 중… {gps.progress} / {gps.targetSamples}
                </p>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
                  aria-valuenow={gps.progress} aria-valuemin={0} aria-valuemax={gps.targetSamples}>
                  <div className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(gps.progress / gps.targetSamples * 100)}%` }} />
                </div>
              </div>
            )}

            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => startMeasure(e.code, e.name)}
              disabled={active != null}
              aria-busy={isActive}
              aria-label={`${e.name} 위치 정밀 측정`}>
              {isActive
                ? <Loader2 aria-hidden size={20} className="animate-spin" />
                : msg?.tone === "ok"
                ? <CheckCircle aria-hidden size={20} className="text-green-600" />
                : <MapPin aria-hidden size={20} />}
              {isActive ? "측정 중…" : "현재 위치를 이 입구로 정밀 기록"}
            </button>

            {msg && (
              <p
                role="status"
                aria-live="polite"
                className={`rounded-xl px-4 py-3 text-base font-bold ${
                  msg.tone === "ok"
                    ? "bg-green-50 text-green-900"
                    : msg.tone === "err"
                    ? "bg-red-50 text-red-900"
                    : "bg-card"
                }`}>
                {msg.text}
              </p>
            )}
          </div>
        );
      })}
    </AppShell>
  );
}
