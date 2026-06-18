import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, X, Clock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { adminListHazards, adminUpdateHazard } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/hazards")({
  head: () => ({ meta: [{ title: "위험 관리 · 관리자" }] }),
  component: AdminHazards,
});

type Hazard = {
  id: string; type: string; subtype: string | null; label: string | null;
  description: string | null; side: string;
  lat: number | null; lng: number | null;
  verified: boolean; verification_status: string; reporter_type: string;
  active: boolean; expires_at: string | null; cleared_at: string | null;
  created_at: string;
};

function AdminHazards() {
  const list = useServerFn(adminListHazards);
  const update = useServerFn(adminUpdateHazard);
  const [rows, setRows] = useState<Hazard[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | "EXPIRED" | "USER" | "ADMIN" | "ALL">("ACTIVE");
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try { setRows((await list()) as Hazard[]); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "조회 실패"); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const now = Date.now();
  const filtered = rows.filter((h) => {
    const expired = !h.expires_at || new Date(h.expires_at).getTime() < now;
    if (filter === "ACTIVE") return h.active && !expired;
    if (filter === "EXPIRED") return !h.active || expired;
    if (filter === "USER") return h.reporter_type !== "ADMIN";
    if (filter === "ADMIN") return h.verification_status === "ADMIN_CONFIRMED";
    return true;
  });

  async function act(id: string, action: "CONFIRM" | "CLEAR" | "EXTEND", hours?: number) {
    setMsg(null);
    try {
      await update({ data: { id, action, extendHours: hours } });
      await refresh();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "실패"); }
  }

  return (
    <AppShell title="위험 관리" back={{ to: "/admin" }}>
      <div role="tablist" aria-label="위험 목록 필터" className="grid grid-cols-5 gap-1 rounded-xl border-2 border-foreground bg-muted p-1">
        {([
          ["ACTIVE", "활성"], ["EXPIRED", "만료"], ["USER", "사용자"], ["ADMIN", "관리자"], ["ALL", "전체"],
        ] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
            className="min-h-12 rounded-lg text-base font-extrabold"
            style={filter === k ? { background: "var(--foreground)", color: "var(--background)" } : undefined}>
            {l}
          </button>
        ))}
      </div>

      {msg && <p role="alert" className="rounded-xl border-2 border-foreground bg-card px-4 py-3 font-bold">{msg}</p>}

      {filtered.length === 0 ? (
        <p className="text-lg">표시할 위험이 없습니다.</p>
      ) : filtered.map((h) => {
        const expired = h.expires_at ? new Date(h.expires_at).getTime() < now : true;
        return (
          <article key={h.id} className="status-card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xl font-extrabold">{h.label ?? h.type}</p>
                <p className="text-sm text-muted-foreground">
                  {h.reporter_type} · {h.verification_status} · {h.active ? (expired ? "만료됨" : "활성") : "해제"}
                </p>
              </div>
              <span className="rounded-md border-2 border-foreground px-2 py-1 text-xs font-extrabold">
                {h.side}
              </span>
            </div>
            {h.description && <p className="text-base">{h.description}</p>}
            <p className="text-sm">위치: {h.lat?.toFixed(5)}, {h.lng?.toFixed(5)}</p>
            <p className="text-sm">만료: {h.expires_at ? new Date(h.expires_at).toLocaleString() : "-"}</p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button className="btn-secondary min-h-12" onClick={() => act(h.id, "CONFIRM")}>
                <ShieldCheck aria-hidden size={18} /> 확인
              </button>
              <button className="btn-secondary min-h-12" onClick={() => act(h.id, "EXTEND", 6)}>
                <Clock aria-hidden size={18} /> +6시간
              </button>
              <button className="btn-danger min-h-12" onClick={() => act(h.id, "CLEAR")}>
                <X aria-hidden size={18} /> 해제
              </button>
            </div>
          </article>
        );
      })}

      {filtered.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden size={16} /> 필터를 바꿔보세요.
        </p>
      )}
    </AppShell>
  );
}
