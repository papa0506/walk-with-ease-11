import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Footprints, PhoneCall, ChevronRight, LogIn, LogOut, ShieldAlert,
  AlertTriangle, Settings as SettingsIcon,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { logout } from "@/lib/namsan.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "남산 산책 동반자" },
      { name: "description", content: "시각장애인을 위한 음성 안내 산책 동반자" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: me } = useMe();
  const invalidate = useInvalidateMe();
  const navigate = useNavigate();
  const logoutFn = useServerFn(logout);
  const isApproved = me?.status === "APPROVED";
  const isAdmin = me?.role === "ADMIN";

  const topRight = me ? (
    <button
      type="button"
      onClick={async () => { await logoutFn(); await invalidate(); navigate({ to: "/" }); }}
      className="inline-flex min-h-11 items-center gap-1 rounded-xl border-2 border-foreground bg-background px-3 text-sm font-extrabold"
      aria-label="로그아웃"
    >
      <LogOut aria-hidden size={18} /> 로그아웃
    </button>
  ) : (
    <Link
      to="/auth"
      className="inline-flex min-h-11 items-center gap-1 rounded-xl border-2 border-foreground bg-foreground px-3 text-sm font-extrabold text-background"
      aria-label="로그인 또는 회원가입"
    >
      <LogIn aria-hidden size={18} /> 로그인
    </Link>
  );

  const handleOnetouch = (e: React.MouseEvent) => {
    if (!me) {
      e.preventDefault();
      alert("원터치 복지콜은 로그인 후 관리자 승인을 받은 사용자만 사용할 수 있습니다. 먼저 로그인해 주세요.");
      navigate({ to: "/auth" });
    } else if (!isApproved) {
      e.preventDefault();
      alert("원터치 복지콜은 관리자 승인 후 사용할 수 있습니다. 현재 상태: 승인 대기 중.");
    }
  };

  return (
    <AppShell
      title={me ? `${me.name}님,\n오늘도 안전하게 걸어요` : "남산 산책 동반자"}
      topRight={topRight}
      bottomAction={
        <Link to="/walk/start" className="btn-primary" aria-label="산책로 기본 안내 시작">
          <Footprints aria-hidden="true" size={28} /> 산책로 기본 안내 시작
        </Link>
      }
    >
      <nav aria-label="주요 메뉴" className="space-y-3">
        <MenuRow
          to="/walk/start"
          icon={<Footprints aria-hidden size={28} />}
          title="산책 시작"
          subtitle="경로를 고르고 음성 안내를 시작합니다"
        />
        <MenuRow
          to="/report-hazard"
          icon={<AlertTriangle aria-hidden size={28} />}
          title="공사 및 위험 신고"
          subtitle="공사·차량·장애물·미끄럼 위험을 알려 주세요"
        />
        <MenuRow
          to="/onetouch"
          onClick={handleOnetouch}
          icon={<PhoneCall aria-hidden size={28} />}
          title="원터치 복지콜"
          subtitle="픽업·도착 위치를 골라 호출합니다"
        />
        <MenuRow
          to="/settings"
          icon={<SettingsIcon aria-hidden size={28} />}
          title="설정"
          subtitle="내 정보 공개 범위를 설정합니다"
        />
        {isAdmin && (
          <MenuRow to="/admin" icon={<ShieldAlert aria-hidden size={28} />} title="관리자" subtitle="가입 승인 · 현장 측량 · 입구/거리표지 보정" />
        )}
      </nav>
    </AppShell>
  );
}

function MenuRow({
  to, icon, title, subtitle, onClick,
}: { to: string; icon: React.ReactNode; title: string; subtitle: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <Link to={to} onClick={onClick} className="status-card flex items-center gap-4" aria-label={`${title}. ${subtitle}`}>
      <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-foreground bg-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight aria-hidden size={28} />
    </Link>
  );
}
