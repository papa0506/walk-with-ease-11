import { createFileRoute, Link } from "@tanstack/react-router";
import { Hourglass, ShieldCheck, LogOut } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";

export const Route = createFileRoute("/auth/pending")({
  head: () => ({ meta: [{ title: "승인 대기 · UI 시안" }] }),
  component: PendingScreen,
});

function PendingScreen() {
  return (
    <AppShell
      title="승인 대기 중"
      bottomAction={
        <Link to="/auth" className="btn-secondary" aria-label="로그아웃하고 로그인 화면으로">
          <LogOut aria-hidden="true" size={24} />
          로그아웃
        </Link>
      }
    >
      <StatusCard
        tone="warning"
        icon={<Hourglass aria-hidden="true" size={28} />}
        eyebrow="대기 중"
        title="관리자 승인을 기다리고 있어요"
        description="승인이 완료되면 산책, 위치 공유, 친구 찾기, 원터치 복지콜 기능을 사용할 수 있습니다."
      />

      <StatusCard
        tone="info"
        icon={<ShieldCheck aria-hidden="true" size={28} />}
        title="개인정보는 안전하게 보호됩니다"
        description="위치 공유 기본값은 비공개입니다. 본인이 동의한 친구에게만 공유됩니다."
      />

      <section
        aria-label="승인 진행 안내"
        className="status-card space-y-3"
      >
        <h2 className="text-xl font-extrabold">진행 안내</h2>
        <ol className="space-y-3 text-lg">
          <Step n={1} done>가입 신청 완료</Step>
          <Step n={2} current>관리자 검토 중</Step>
          <Step n={3}>승인 완료 알림</Step>
        </ol>
      </section>
    </AppShell>
  );
}

function Step({
  n,
  done,
  current,
  children,
}: {
  n: number;
  done?: boolean;
  current?: boolean;
  children: React.ReactNode;
}) {
  const status = done ? "완료" : current ? "진행 중" : "대기";
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-foreground font-extrabold"
        style={
          done
            ? { background: "var(--success)", color: "var(--success-foreground)" }
            : current
            ? { background: "var(--warning)", color: "var(--warning-foreground)" }
            : { background: "var(--muted)", color: "var(--foreground)" }
        }
      >
        {n}
      </span>
      <span className="flex-1 font-bold">{children}</span>
      <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {status}
      </span>
    </li>
  );
}
