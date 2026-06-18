import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hourglass, ShieldCheck, LogOut } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { logout } from "@/lib/namsan.functions";

export const Route = createFileRoute("/auth/pending")({
  head: () => ({ meta: [{ title: "승인 대기 · 남산 산책" }] }),
  component: PendingScreen,
});

function PendingScreen() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const invalidate = useInvalidateMe();
  const logoutFn = useServerFn(logout);

  return (
    <AppShell
      title="승인 대기 중"
      bottomAction={
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await logoutFn(); await invalidate(); navigate({ to: "/" });
          }}
          aria-label="로그아웃"
        >
          <LogOut aria-hidden size={24} /> 로그아웃
        </button>
      }
    >
      <StatusCard
        tone="warning"
        icon={<Hourglass aria-hidden size={28} />}
        eyebrow="대기"
        title="관리자 승인 후 사용할 수 있습니다."
        description={
          me
            ? `${me.name} · ${me.phone_masked} · 현재 상태: ${me.status}`
            : "로그인 정보를 불러오는 중입니다."
        }
      />

      <StatusCard
        tone="info"
        icon={<ShieldCheck aria-hidden size={28} />}
        title="개인정보 보호"
        description="위치 공유 기본값은 비공개입니다. 승인된 사용자만 산책, 위치 공유, 친구 찾기, 원터치 복지콜 기능을 사용할 수 있습니다."
      />
    </AppShell>
  );
}
