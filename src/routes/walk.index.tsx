import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Volume2,
  Navigation,
  Users,
  AlertTriangle,
  Square,
} from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";

export const Route = createFileRoute("/walk/")({
  head: () => ({ meta: [{ title: "산책 중 · UI 시안" }] }),
  component: WalkActive,
});

function WalkActive() {
  return (
    <AppShell
      title="산책 중"
      back={{ to: "/walk/start", label: "산책 시작 화면으로" }}
      bottomAction={
        <div className="space-y-3">
          <button type="button" className="btn-danger" aria-label="산책을 종료합니다">
            <Square aria-hidden="true" size={28} />
            산책 종료
          </button>
          <Link to="/" className="btn-secondary" aria-label="홈으로 이동">
            잠시 멈춤
          </Link>
        </div>
      }
    >
      {/* 음성 안내 상태 */}
      <StatusCard
        tone="info"
        icon={<Volume2 aria-hidden="true" size={28} />}
        eyebrow="음성 안내"
        title="잠시 후 우회전입니다"
        description="약 20 미터 앞에서 오른쪽으로 도세요."
      >
        <p
          aria-live="polite"
          className="rounded-xl border-2 px-3 py-2 text-base font-bold"
          style={{ borderColor: "currentColor" }}
        >
          마지막 안내: 5초 전
        </p>
      </StatusCard>

      {/* 거리 안내 */}
      <StatusCard
        tone="neutral"
        icon={<Navigation aria-hidden="true" size={28} />}
        eyebrow="거리 안내"
        title="다음 지점까지 120 m"
      >
        <dl className="grid grid-cols-2 gap-3">
          <Metric label="총 이동" value="340 m" />
          <Metric label="남은 거리" value="860 m" />
        </dl>
      </StatusCard>

      {/* 주변 사람 / 친구 */}
      <StatusCard
        tone="success"
        icon={<Users aria-hidden="true" size={28} />}
        eyebrow="주변 동반자"
        title="가까이 친구 1명이 있습니다"
        description="민수 님 · 약 30 m 앞"
      >
        <button
          type="button"
          className="rounded-xl border-2 border-current bg-card px-4 py-3 text-base font-extrabold text-foreground"
        >
          호출 보내기
        </button>
      </StatusCard>

      {/* 위험 안내 */}
      <StatusCard
        tone="danger"
        icon={<AlertTriangle aria-hidden="true" size={28} />}
        eyebrow="위험 안내"
        title="10 m 앞 계단 시작"
        description="천천히 멈춰 주세요. 손잡이는 오른쪽에 있습니다."
        ariaLabel="위험: 10미터 앞에서 계단이 시작됩니다. 천천히 멈추세요."
      />
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-foreground bg-card px-3 py-3">
      <dt className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-extrabold text-foreground">{value}</dd>
    </div>
  );
}
