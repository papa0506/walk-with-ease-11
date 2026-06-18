import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { adminListEntrances, adminRecordEntrance } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/entrances")({
  head: () => ({ meta: [{ title: "입구 보정 · 관리자" }] }),
  component: Entrances,
});

function Entrances() {
  const listFn = useServerFn(adminListEntrances);
  const recFn = useServerFn(adminRecordEntrance);
  const { data: entrances = [], refetch } = useQuery({
    queryKey: ["entrances"], queryFn: () => listFn(),
  });
  const [msg, setMsg] = useState<string | null>(null);

  function record(code: string) {
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await recFn({ data: { code,
            lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } });
          await refetch();
          setMsg(`${code}: 현재 위치를 입구 좌표로 기록했습니다 (verified=false).`);
        } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "실패"); }
      },
      (e) => setMsg(`위치 실패: ${e.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <AppShell title="입구 좌표 보정" back={{ to: "/admin" }}>
      <StatusCard tone="info" icon={<MapPin aria-hidden size={28} />}
        eyebrow="안내"
        title="현재 위치를 각 입구의 기준 좌표로 저장합니다"
        description="저장값은 verified=false로 기록되며, 검증 후 안내에 사용됩니다." />

      {entrances.map((e) => (
        <div key={e.id} className="status-card space-y-3">
          <div>
            <p className="text-xl font-extrabold">{e.name}</p>
            <p className="text-base text-muted-foreground">{e.code}</p>
            <p className="mt-2 text-base">
              마지막 측정: {e.measured_at ? new Date(e.measured_at).toLocaleString("ko-KR") : "없음"} ·
              정확도: {e.accuracy != null ? `${Math.round(e.accuracy)} m` : "—"} ·
              검증: {e.verified ? "Y" : "N"}
            </p>
          </div>
          <button className="btn-secondary" onClick={() => record(e.code)}>
            <MapPin aria-hidden size={22} /> 현재 위치를 이 입구로 기록
          </button>
        </div>
      ))}

      {msg && (
        <p role="status" className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">{msg}</p>
      )}
    </AppShell>
  );
}
