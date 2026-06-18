import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ClipboardCheck, MapPin, Ruler, AlertTriangle, Footprints } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe } from "@/hooks/useMe";
import { adminListUsers, adminSetStatus } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "관리자 · 남산 산책" }] }),
  component: AdminHome,
});

function AdminHome() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const listFn = useServerFn(adminListUsers);
  const setStatusFn = useServerFn(adminSetStatus);
  const { data: users = [], refetch, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: me?.role === "ADMIN",
  });

  if (me && me.role !== "ADMIN") {
    return (
      <AppShell title="접근 제한" back={{ to: "/" }}>
        <StatusCard tone="warning" icon={<ShieldAlert aria-hidden size={28} />}
          title="관리자만 사용할 수 있습니다" />
      </AppShell>
    );
  }

  async function act(id: string, status: "APPROVED" | "REJECTED" | "SUSPENDED" | "PENDING") {
    await setStatusFn({ data: { userId: id, status } });
    await refetch();
  }

  const pending = users.filter((u) => u.status === "PENDING");

  return (
    <AppShell title="관리자" back={{ to: "/" }}>
      <nav aria-label="관리자 메뉴" className="grid grid-cols-1 gap-3">
        <AdminMenuRow to="/admin/field-survey" icon={<MapPin size={28} />}
          title="현장 측량" subtitle="현재 위치를 랜드마크 후보로 저장" />
        <AdminMenuRow to="/admin/entrances" icon={<ClipboardCheck size={28} />}
          title="입구 좌표 보정" subtitle="국립극장 / 케이블카 방면 입구" />
        <AdminMenuRow to="/admin/milestones" icon={<Ruler size={28} />}
          title="200m 거리 표지 보정" subtitle="기준 입구 + 미터" />
      </nav>

      <StatusCard tone={pending.length ? "warning" : "neutral"}
        icon={<ClipboardCheck aria-hidden size={28} />}
        eyebrow="가입 승인"
        title={`승인 대기 ${pending.length}명`}
        description="새 가입자를 검토하고 승인 또는 거부합니다." />

      {error && (
        <p role="alert" className="rounded-xl border-2 border-foreground bg-[var(--danger)] px-4 py-3 font-bold text-[var(--danger-foreground)]">
          불러오기 실패: {(error as Error).message}
        </p>
      )}

      <section aria-label="사용자 목록" className="space-y-3">
        <h2 className="text-xl font-extrabold">사용자 ({users.length})</h2>
        {isLoading && <p>불러오는 중...</p>}
        {users.map((u) => (
          <div key={u.id} className="status-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">{u.name} <span className="ml-2 text-sm font-bold uppercase">{u.role}</span></p>
                <p className="text-base text-muted-foreground">{u.phone}</p>
                <p className="mt-1 text-base">
                  상태: <span className="font-extrabold">{u.status}</span>
                </p>
                <p className="text-xs text-muted-foreground">가입: {new Date(u.created_at).toLocaleString("ko-KR")}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {u.status !== "APPROVED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "APPROVED")}>승인</button>
              )}
              {u.status !== "REJECTED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "REJECTED")}>거부</button>
              )}
              {u.status !== "SUSPENDED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "SUSPENDED")}>정지</button>
              )}
              {u.status === "SUSPENDED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "APPROVED")}>정지 해제</button>
              )}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function AdminMenuRow({ to, icon, title, subtitle }: { to: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link to={to} className="status-card flex items-center gap-4">
      <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-foreground bg-muted">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}
