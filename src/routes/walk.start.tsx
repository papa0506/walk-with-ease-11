import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Volume2, ShieldAlert, Play } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";

export const Route = createFileRoute("/walk/start")({
  head: () => ({ meta: [{ title: "산책 시작 · UI 시안" }] }),
  component: WalkStart,
});

const ROUTES = [
  { id: "namsan-loop", name: "남산 둘레길 (짧은 코스)", meta: "약 1.2 km · 평탄" },
  { id: "namsan-tower", name: "남산타워 방면", meta: "약 2.4 km · 오르막 포함" },
  { id: "free-walk", name: "자유 산책", meta: "경로 없이 음성 안내만" },
];

function WalkStart() {
  const [selected, setSelected] = useState("namsan-loop");
  const [voice, setVoice] = useState(true);
  const [hazard, setHazard] = useState(true);

  return (
    <AppShell
      title="산책 시작"
      back={{ to: "/" }}
      bottomAction={
        <Link to="/walk" className="btn-primary" aria-label="선택한 설정으로 산책 시작">
          <Play aria-hidden="true" size={28} />
          이 설정으로 시작
        </Link>
      }
    >
      <StatusCard
        tone="warning"
        icon={<MapPin aria-hidden="true" size={28} />}
        eyebrow="시안 안내"
        title="표시된 경로/거리 정보는 예시입니다"
        description="검증된 남산 데이터로 교체되기 전까지는 실제 안전 안내로 사용하지 마세요."
      />

      <fieldset className="space-y-3">
        <legend className="sr-only">산책 경로 선택</legend>
        {ROUTES.map((r) => {
          const active = selected === r.id;
          return (
            <label
              key={r.id}
              className="status-card flex items-center gap-4"
              style={
                active
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : undefined
              }
            >
              <input
                type="radio"
                name="route"
                value={r.id}
                checked={active}
                onChange={() => setSelected(r.id)}
                className="h-7 w-7 shrink-0 accent-foreground"
                aria-describedby={`${r.id}-meta`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold leading-tight">{r.name}</p>
                <p id={`${r.id}-meta`} className="mt-1 text-base font-semibold">
                  {r.meta}
                </p>
              </div>
              {active && (
                <span className="rounded-lg border-2 border-foreground px-2 py-1 text-sm font-extrabold">
                  선택됨
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      <h2 className="px-1 pt-4 text-2xl font-extrabold">안내 설정</h2>

      <ToggleRow
        icon={<Volume2 aria-hidden="true" size={28} />}
        title="음성 안내"
        desc="방향과 거리를 소리로 알려 줍니다"
        on={voice}
        onToggle={() => setVoice((v) => !v)}
      />
      <ToggleRow
        icon={<ShieldAlert aria-hidden="true" size={28} />}
        title="위험 구간 안내"
        desc="계단, 차도, 공사 구간을 미리 알립니다"
        on={hazard}
        onToggle={() => setHazard((v) => !v)}
      />
    </AppShell>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  on,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={`${title}. ${desc}. 현재 ${on ? "켜짐" : "꺼짐"}`}
      className="status-card flex w-full items-center gap-4 text-left"
    >
      <div
        aria-hidden="true"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-foreground bg-muted"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base text-muted-foreground">{desc}</p>
      </div>
      <span
        className="shrink-0 rounded-xl border-2 border-foreground px-3 py-2 text-base font-extrabold"
        style={
          on
            ? { background: "var(--success)", color: "var(--success-foreground)" }
            : { background: "var(--muted)", color: "var(--foreground)" }
        }
      >
        {on ? "켜짐" : "꺼짐"}
      </span>
    </button>
  );
}
