import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, MapPin, Ruler, Trash2 } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe } from "@/hooks/useMe";
import {
  adminListMilestones,
  adminListLandmarks,
  adminListEntrances,
  adminDeleteMilestone,
  adminDeleteAllMilestones,
  adminDeleteLandmark,
} from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/data-status")({
  head: () => ({ meta: [{ title: "데이터 현황 · 관리자" }] }),
  component: DataStatus,
});

function DataStatus() {
  const { data: me } = useMe();
  const listMsFn   = useServerFn(adminListMilestones);
  const listLmFn   = useServerFn(adminListLandmarks);
  const listEntFn  = useServerFn(adminListEntrances);
  const delMsFn    = useServerFn(adminDeleteMilestone);
  const delAllMsFn = useServerFn(adminDeleteAllMilestones);
  const delLmFn    = useServerFn(adminDeleteLandmark);

  const { data: milestones = [], refetch: refMs } = useQuery({ queryKey: ["ms-status"], queryFn: () => listMsFn() });
  const { data: landmarks  = [], refetch: refLm } = useQuery({ queryKey: ["lm-status"], queryFn: () => listLmFn() });
  const { data: entrances  = [] }                  = useQuery({ queryKey: ["ent-status"], queryFn: () => listEntFn() });

  const [deleting, setDeleting] = useState<string | null>(null);

  if (me?.role !== "ADMIN") return (
    <AppShell title="접근 제한" back={{ to: "/admin" }}>
      <StatusCard tone="warning" icon={<Database size={28} />} title="관리자만 사용 가능합니다" />
    </AppShell>
  );

  const msCount = (milestones as any[]).length;
  const lmCount = (landmarks  as any[]).length;

  return (
    <AppShell title="레코딩 데이터 현황" back={{ to: "/admin" }}>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "입구",       count: (entrances as any[]).length, icon: "🚪" },
          { label: "마일스톤",   count: msCount,                     icon: "📍" },
          { label: "랜드마크",   count: lmCount,                     icon: "🏷️" },
        ].map(item => (
          <div key={item.label} className="status-card text-center">
            <p className="text-3xl">{item.icon}</p>
            <p className="text-2xl font-extrabold">{item.count}</p>
            <p className="text-sm text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 입구 */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <MapPin size={20} /> 입구 좌표
        </h2>
        {(entrances as any[]).length === 0 && <p className="text-muted-foreground">기록 없음</p>}
        {(entrances as any[]).map(e => (
          <div key={e.id} className="status-card">
            <p className="font-extrabold">{e.name}</p>
            <p className="text-sm text-muted-foreground">
              {e.lat != null ? `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}` : "좌표 없음"} ·
              오차 {e.accuracy != null ? `약 ${Math.round(e.accuracy)}m` : "—"} ·
              {e.measured_at ? ` ${new Date(e.measured_at).toLocaleString("ko-KR")}` : " 미측정"}
            </p>
          </div>
        ))}
      </section>

      {/* 마일스톤 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <Ruler size={20} /> 마일스톤 ({msCount}개)
          </h2>
          {msCount > 0 && (
            <button className="btn-secondary flex items-center gap-1 px-3 py-1 text-sm"
              onClick={async () => {
                if (!confirm(`마일스톤 ${msCount}개를 모두 삭제합니까?`)) return;
                setDeleting("all-ms");
                try { await delAllMsFn(); await refMs(); } finally { setDeleting(null); }
              }}
              disabled={deleting !== null}>
              <Trash2 size={14} /> 전체 삭제
            </button>
          )}
        </div>
        {msCount === 0 && <p className="text-muted-foreground">기록 없음</p>}
        {(milestones as any[]).map(m => (
          <div key={m.id} className="status-card flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">
                {m.meter}m — {(m.basis_entrance as any)?.name ?? (m.basis_entrance as any)?.code ?? "?"}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.survey_direction} · 오차 {m.accuracy != null ? `약 ${Math.round(m.accuracy)}m` : "—"}
                {m.measured_at ? ` · ${new Date(m.measured_at).toLocaleString("ko-KR")}` : ""}
              </p>
            </div>
            <button className="shrink-0 rounded-lg border-2 border-foreground p-1"
              onClick={async () => {
                if (!confirm(`${m.meter}m 마일스톤을 삭제합니까?`)) return;
                setDeleting(m.id);
                try { await delMsFn({ data: { id: m.id } }); await refMs(); } finally { setDeleting(null); }
              }}
              disabled={deleting !== null}
              aria-label={`${m.meter}m 삭제`}>
              <Trash2 size={16} className="text-red-500" />
            </button>
          </div>
        ))}
      </section>

      {/* 랜드마크 */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <MapPin size={20} /> 랜드마크 ({lmCount}개)
        </h2>
        {lmCount === 0 && <p className="text-muted-foreground">기록 없음</p>}
        {(landmarks as any[]).map(lm => (
          <div key={lm.id} className="status-card flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{lm.name}</p>
              <p className="text-sm text-muted-foreground">
                {lm.type ? `${lm.type} · ` : ""}{lm.side} · {lm.survey_direction}
                · 오차 {lm.accuracy != null ? `약 ${Math.round(lm.accuracy)}m` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(lm.created_at).toLocaleString("ko-KR")}
                {lm.verified ? " · ✓검증됨" : " · 미검증"}
              </p>
            </div>
            <button className="shrink-0 rounded-lg border-2 border-foreground p-1"
              onClick={async () => {
                if (!confirm(`"${lm.name}"을(를) 삭제합니까?`)) return;
                setDeleting(lm.id);
                try { await delLmFn({ data: { id: lm.id } }); await refLm(); } finally { setDeleting(null); }
              }}
              disabled={deleting !== null}
              aria-label={`${lm.name} 삭제`}>
              <Trash2 size={16} className="text-red-500" />
            </button>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
