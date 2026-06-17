import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ShieldAlert, ClipboardCheck, LogOut } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "관리자 홈 · UI 시안" }] }),
  component: AdminHome,
});

function AdminHome() {
  return (
    <AppShell
      title="관리자"
      back={{ to: "/" }}
      bottomAction={
        <Link to="/auth" className="btn-secondary" aria-label="로그아웃">
          <LogOut aria-hidden="true" size={24} />
          로그아웃
        </Link>
      }
    >
      <StatusCard
        tone="info"
        icon={<ShieldAlert aria-hidden="true" size={28} />}
        title="관리자 전용 화면"
        description="이 화면은 승인된 관리자만 볼 수 있습니다. 시안 단계이며 실제 데이터는 표시되지 않습니다."
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="승인 대기" value="3" tone="warning" />
        <Stat label="활성 사용자" value="12" tone="success" />
        <Stat label="진행 중 산책" value="2" tone="info" />
        <Stat label="신고/이슈" value="0" tone="neutral" />
      </div>

      <nav aria-label="관리자 메뉴" className="space-y-3">
        <AdminRow
          icon={<ClipboardCheck aria-hidden="true" size={28} />}
          title="가입 승인 대기"
          subtitle="신규 가입자 검토 (시안)"
        />
        <AdminRow
          icon={<Users aria-hidden="true" size={28} />}
          title="사용자 관리"
          subtitle="권한, 비활성화 (시안)"
        />
        <AdminRow
          icon={<ShieldAlert aria-hidden="true" size={28} />}
          title="남산 안전 데이터"
          subtitle="검증 전 데이터는 안내에 사용되지 않습니다 (시안)"
        />
      </nav>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "info";
}) {
  const bg =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
      ? "var(--warning)"
      : tone === "info"
      ? "var(--info)"
      : "var(--card)";
  const fg =
    tone === "warning"
      ? "var(--warning-foreground)"
      : tone === "neutral"
      ? "var(--foreground)"
      : "var(--success-foreground)";
  return (
    <div
      className="rounded-2xl border-2 border-foreground p-4"
      style={{ background: bg, color: fg }}
    >
      <p className="text-sm font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-4xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function AdminRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      className="status-card flex w-full items-center gap-4 text-left"
      aria-label={`${title}. ${subtitle}`}
    >
      <div
        aria-hidden="true"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-foreground bg-muted"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
