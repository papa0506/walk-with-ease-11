import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Footprints,
  PhoneCall,
  Users,
  Bell,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "남산 산책 동반자 (UI 시안)" },
      { name: "description", content: "시각장애인을 위한 음성 안내 산책 동반자 — UI 시안" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell
      title="안녕하세요,&#10;오늘도 안전하게 걸어요"
      bottomAction={
        <Link to="/walk/start" className="btn-primary" aria-label="산책 시작하기 화면으로 이동">
          <Footprints aria-hidden="true" size={28} />
          산책 시작하기
        </Link>
      }
    >
      <StatusCard
        tone="success"
        icon={<span className="text-2xl font-black">OK</span>}
        eyebrow="현재 상태"
        title="동반 안내 준비됨"
        description="음성 안내, 주변 사람 알림, 위험 안내가 모두 켜져 있습니다."
      />

      <nav aria-label="주요 메뉴" className="space-y-3">
        <MenuRow
          to="/walk/start"
          icon={<Footprints aria-hidden="true" size={28} />}
          title="산책 시작"
          subtitle="경로를 고르고 음성 안내를 시작합니다"
        />
        <MenuRow
          to="/walk"
          icon={<Bell aria-hidden="true" size={28} />}
          title="산책 중 화면 미리보기"
          subtitle="안내 카드 레이아웃 확인"
        />
        <MenuRow
          to="/"
          icon={<Users aria-hidden="true" size={28} />}
          title="주변 친구 찾기"
          subtitle="가까이 있는 동반자를 확인합니다 (시안)"
        />
        <MenuRow
          to="/"
          icon={<PhoneCall aria-hidden="true" size={28} />}
          title="원터치 복지콜"
          subtitle="긴급 도움을 요청합니다 (시안)"
        />
      </nav>
    </AppShell>
  );
}

function MenuRow({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="status-card flex items-center gap-4"
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
      <ChevronRight aria-hidden="true" size={28} />
    </Link>
  );
}
