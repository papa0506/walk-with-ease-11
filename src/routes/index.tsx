import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Footprints, PhoneCall, ChevronRight, LogIn, LogOut, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { logout } from "@/lib/namsan.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "남산 산책 동반자 (비공개 RC)" },
      { name: "description", content: "시각장애인을 위한 음성 안내 산책 동반자 — 비공개 릴리즈 후보" },
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

  return (
    <AppShell
      title={me ? `${me.name}님,\n오늘도 안전하게 걸어요` : "안녕하세요,\n남산 산책 동반자"}
      bottomAction={
        isApproved ? (
          <Link to="/walk/start" className="btn-primary" aria-label="산책 시작 화면으로 이동">
            <Footprints aria-hidden="true" size={28} /> 산책 시작하기
          </Link>
        ) : me ? (
          <Link to="/auth/pending" className="btn-secondary" aria-label="승인 대기 안내 보기">
            승인 대기 안내
          </Link>
        ) : (
          <Link to="/auth" className="btn-primary" aria-label="로그인 또는 회원가입">
            <LogIn aria-hidden="true" size={28} /> 로그인 / 회원가입
          </Link>
        )
      }
    >
      <StatusCard
        tone={isApproved ? "success" : me ? "warning" : "info"}
        icon={<ShieldCheck aria-hidden="true" size={28} />}
        eyebrow="계정 상태"
        title={
          isApproved ? "승인됨 — 산책 기능 사용 가능"
          : me ? "승인 대기 중 — 관리자 승인 후 사용 가능"
          : "로그인이 필요합니다"
        }
        description={
          me ? `${me.name} · ${me.phone_masked} · ${me.role}`
          : "회원가입 후 관리자 승인이 필요합니다. 위치 공유 기본값은 비공개입니다."
        }
      />

      <nav aria-label="주요 메뉴" className="space-y-3">
        {isApproved && (
          <>
            <MenuRow to="/walk/start" icon={<Footprints aria-hidden size={28} />} title="산책 시작" subtitle="경로를 고르고 음성 안내를 시작합니다" />
            <MenuRow to="/onetouch" icon={<PhoneCall aria-hidden size={28} />} title="원터치 복지콜" subtitle="픽업 위치를 골라 핸드오프를 준비합니다" />
          </>
        )}
        {isAdmin && (
          <MenuRow to="/admin" icon={<ShieldAlert aria-hidden size={28} />} title="관리자" subtitle="가입 승인 · 현장 측량 · 입구/거리표지 보정" />
        )}
        {me && (
          <button
            type="button"
            className="status-card flex w-full items-center gap-4 text-left"
            onClick={async () => {
              await logoutFn();
              await invalidate();
              navigate({ to: "/" });
            }}
          >
            <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-foreground bg-muted">
              <LogOut size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold leading-tight">로그아웃</p>
              <p className="mt-1 text-base text-muted-foreground">현재 계정에서 로그아웃합니다</p>
            </div>
          </button>
        )}
      </nav>
    </AppShell>
  );
}

function MenuRow({
  to, icon, title, subtitle,
}: { to: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link to={to} className="status-card flex items-center gap-4" aria-label={`${title}. ${subtitle}`}>
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
