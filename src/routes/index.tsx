import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Footprints, PhoneCall, LogIn, LogOut, ShieldAlert,
  AlertTriangle, Settings as SettingsIcon, ArrowUpRight,
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
      onClick={async () => {
        await logoutFn();
        window.localStorage.removeItem("nw_session_token");
        await invalidate();
        navigate({ to: "/" });
      }}
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
      title={me ? `${me.name}님,\n안전한 산책` : "남산\n산책 동반자"}
      topRight={topRight}
      bottomAction={
        <Link to="/walk/start" className="btn-primary" aria-label="산책로 기본 안내 시작">
          <Footprints aria-hidden="true" size={28} /> 산책 시작하기
        </Link>
      }
    >
      <nav aria-label="주요 메뉴" className="grid grid-cols-2 gap-4">
        <BentoTile
          to="/walk/start"
          variant="primary"
          colSpan={2}
          icon={<Footprints aria-hidden size={44} />}
          title="산책 시작"
          subtitle="경로 선택 · 음성 안내"
        />
        <BentoTile
          to="/report-hazard"
          variant="dark"
          icon={<AlertTriangle aria-hidden size={36} />}
          title="위험 신고"
          subtitle="공사 · 장애물"
        />
        <BentoTile
          to="/onetouch"
          onClick={handleOnetouch}
          variant="accent"
          icon={<PhoneCall aria-hidden size={36} />}
          title="원터치 복지콜"
          subtitle="픽업 호출"
        />
        <BentoTile
          to="/settings"
          variant="default"
          colSpan={isAdmin ? 1 : 2}
          icon={<SettingsIcon aria-hidden size={36} />}
          title="설정"
          subtitle="공개 범위"
        />
        {isAdmin && (
          <BentoTile
            to="/admin"
            variant="default"
            icon={<ShieldAlert aria-hidden size={36} />}
            title="관리자"
            subtitle="승인 · 측량"
          />
        )}
      </nav>
    </AppShell>
  );
}

function BentoTile({
  to, icon, title, subtitle, onClick, variant = "default", colSpan = 1,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "default" | "primary" | "dark" | "accent";
  colSpan?: 1 | 2;
}) {
  const variantClass =
    variant === "primary" ? "bento-tile-primary"
    : variant === "dark" ? "bento-tile-dark"
    : variant === "accent" ? "bento-tile-accent"
    : "";
  const span = colSpan === 2 ? "col-span-2" : "";
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`bento-tile ${variantClass} ${span}`}
      aria-label={`${title}. ${subtitle}`}
    >
      <div className="flex items-start justify-between">
        <div aria-hidden>{icon}</div>
        <ArrowUpRight aria-hidden size={24} className="opacity-70" />
      </div>
      <div className="mt-3">
        <p className="text-2xl font-black leading-none tracking-tight">{title}</p>
        <p className="mt-2 text-base font-semibold opacity-80">{subtitle}</p>
      </div>
    </Link>
  );
}
