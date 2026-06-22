import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/walk/AppShell";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { updateMyShareMode } from "@/lib/namsan.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 · 남산 산책" }] }),
  component: SettingsPage,
});

type Mode = "PRIVATE" | "FRIENDS" | "PUBLIC";

const OPTIONS: { key: Mode; title: string; subtitle: string }[] = [
  { key: "PRIVATE", title: "비공개", subtitle: "내 정보와 산책 기록을 나만 봅니다" },
  { key: "FRIENDS", title: "지인 공개", subtitle: "내가 허락한 지인에게만 공개합니다" },
  { key: "PUBLIC", title: "전체 공개", subtitle: "모든 이용자에게 공개합니다" },
];

function SettingsPage() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const invalidate = useInvalidateMe();
  const fn = useServerFn(updateMyShareMode);
  const [mode, setMode] = useState<Mode>("PRIVATE");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (me?.default_share_mode) setMode(me.default_share_mode);
  }, [me?.default_share_mode]);

  if (!me) {
    return (
      <AppShell title="설정" back={{ to: "/" }}
        bottomAction={
          <button className="btn-primary" onClick={() => navigate({ to: "/auth" })}>
            로그인하러 가기
          </button>
        }>
        <p className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">
          설정을 변경하려면 먼저 로그인하세요.
        </p>
      </AppShell>
    );
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await fn({ data: { mode } });
      await invalidate();
      setMsg("저장되었습니다.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "저장 실패");
    } finally { setBusy(false); }
  }

  return (
    <AppShell title="설정" back={{ to: "/" }}
      bottomAction={
        <button className="btn-primary" onClick={save} disabled={busy}>
          <Save aria-hidden size={26} /> {busy ? "저장 중..." : "저장"}
        </button>
      }>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xl font-extrabold">내 정보 공개 범위</legend>
        {OPTIONS.map((o) => {
          const selected = mode === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(o.key)}
              className="status-card flex w-full items-start gap-4 text-left"
              style={selected ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold leading-tight">{o.title}</p>
                <p className="mt-1 text-base opacity-90">{o.subtitle}</p>
              </div>
              <span className="text-sm">{selected ? "선택됨" : ""}</span>
            </button>
          );
        })}
      </fieldset>

      <div role="alert" aria-live="polite" className="min-h-[1px]">
        {msg && <p className="rounded-xl border-2 border-foreground bg-card px-4 py-3 text-lg font-bold">{msg}</p>}
      </div>
    </AppShell>
  );
}
