import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MapPin, Loader2, CheckCircle } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminListEntrances, adminRecordEntrance } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/entrances")({
  head: () => ({ meta: [{ title: "입구 보정 · 관리자" }] }),
  component: Entrances,
});

type GpsState = "idle" | "searching" | "done" | "error";

function Entrances() {
  const listFn = useServerFn(adminListEntrances);
  const recFn  = useServerFn(adminRecordEntrance);
  const { data: entrances = [], refetch } = useQuery({
    queryKey: ["entrances"], queryFn: () => listFn(),
  });

  // 입구별 GPS 상태
  const [gpsState, setGpsState] = useState<Record<string, GpsState>>({});
  const [gpsMsg,   setGpsMsg]   = useState<Record<string, string>>({});

  function record(code: string, name: string) {
    setGpsState(s => ({ ...s, [code]: "searching" }));
    setGpsMsg(s => ({ ...s, [code]: "현재 위치 측정 중…" }));

    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const acc = Math.round(p.coords.accuracy);
        try {
          await recFn({ data: {
            code,
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
          }});
          await refetch();
          setGpsState(s => ({ ...s, [code]: "done" }));
          setGpsMsg(s => ({
            ...s,
            [code]: `✓ ${name} 좌표 저장 완료 (추정 오차 약 ${acc}m)`,
          }));
        } catch (e: unknown) {
          setGpsState(s => ({ ...s, [code]: "error" }));
          setGpsMsg(s => ({
            ...s,
            [code]: `저장 실패: ${e instanceof Error ? e.message : "오류"}`,
          }));
        }
      },
      (e) => {
        setGpsState(s => ({ ...s, [code]: "error" }));
        setGpsMsg(s => ({ ...s, [code]: `위치 실패: ${e.message}` }));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <AppShell title="입구 좌표 보정" back={{ to: "/admin" }}>
      <StatusCard tone="info" icon={<MapPin aria-hidden size={28} />}
        eyebrow="안내"
        title="각 입구에 서서 버튼을 누르세요"
        description="현재 위치를 입구 기준 좌표로 저장합니다. GPS 정확도가 낮을 경우 여러 번 측정해 가장 오차가 작은 값을 사용하세요." />

      {(entrances as any[]).map((e) => {
        const state = gpsState[e.code] ?? "idle";
        const msg   = gpsMsg[e.code];
        return (
          <div key={e.id} className="status-card space-y-3">
            <div>
              <p className="text-xl font-extrabold">{e.name}</p>
              <p className="text-sm text-muted-foreground">{e.code}</p>
              <p className="mt-2 text-base">
                마지막 측정: {e.measured_at
                  ? new Date(e.measured_at).toLocaleString("ko-KR")
                  : "없음"} ·
                오차: {e.accuracy != null ? `약 ${Math.round(e.accuracy)}m` : "—"}
              </p>
            </div>

            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => record(e.code, e.name)}
              disabled={state === "searching"}
              aria-busy={state === "searching"}
              aria-label={`${e.name} 위치 측정`}>
              {state === "searching"
                ? <Loader2 aria-hidden size={20} className="animate-spin" />
                : state === "done"
                ? <CheckCircle aria-hidden size={20} className="text-green-600" />
                : <MapPin aria-hidden size={20} />}
              {state === "searching" ? "측정 중…" : "현재 위치를 이 입구로 기록"}
            </button>

            {msg && (
              <p
                role="status"
                aria-live="polite"
                className={`rounded-xl px-4 py-3 text-base font-bold ${
                  state === "done"
                    ? "bg-green-50 text-green-900"
                    : state === "error"
                    ? "bg-red-50 text-red-900"
                    : "bg-card"
                }`}>
                {msg}
              </p>
            )}
          </div>
        );
      })}
    </AppShell>
  );
}
