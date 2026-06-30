import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAudioFn } from "@/lib/audio-generate";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ClipboardCheck, MapPin, Ruler, AlertTriangle, Footprints, Volume2, Database } from "lucide-react";
import { AppShell } from "@/components/walk/AppShell";
import { StatusCard } from "@/components/walk/StatusCard";
import { useMe } from "@/hooks/useMe";
import { adminListUsers, adminSetStatus } from "@/lib/namsan.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "관리자 · 남산 산책" }] }),
  component: AdminHome,
});

function AdminHome() {
  const { data: me } = useMe();
  const [audioStatus, setAudioStatus] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [audioResult, setAudioResult] = useState<string>("");

  async function generateAudio(force = false) {
    setAudioStatus("loading");
    setAudioResult("");
    try {
      // x-admin-key: 서비스 롤 키 마지막 12자리 (서버에서 검증)
      const res = await fetch(`/api/generate-audio${force ? "?force=true" : ""}`, {
        method: "POST",
        credentials: "include",   // 세션 쿠키 자동 전송
      });
      const json = await res.json();
      if (!res.ok) { setAudioStatus("error"); setAudioResult(json.error ?? "오류"); return; }
      setAudioStatus("done");
      setAudioResult(`완료 ${json.ok}개 / 건너뜀 ${json.skip}개 / 오류 ${json.error}개`);
    } catch (e: any) {
      setAudioStatus("error");
      setAudioResult(e.message);
    }
  }

  const listFn = useServerFn(adminListUsers);
  const setStatusFn = useServerFn(adminSetStatus);
  const { data: users = [], refetch, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: me?.role === "ADMIN",
  });

  if (me && me.role !== "ADMIN") {
    return (
      <AppShell title="접근 제한" back={{ to: "/" }}>
        <StatusCard tone="warning" icon={<ShieldAlert aria-hidden size={28} />}
          title="관리자만 사용할 수 있습니다" />
      </AppShell>
    );
  }

  async function act(id: string, status: "APPROVED" | "REJECTED" | "SUSPENDED" | "PENDING") {
    await setStatusFn({ data: { userId: id, status } });
    await refetch();
  }

  const pending = users.filter((u) => u.status === "PENDING");

  return (
    <AppShell title="관리자" back={{ to: "/" }}>
      <nav aria-label="관리자 메뉴" className="grid grid-cols-1 gap-3">
        <AdminMenuRow to="/admin/field-mode" icon={<Footprints size={28} />}
          title="현장 실측 모드" subtitle="200m 표지 연속 + 지형지물 + 위험 기록" />
        <AdminMenuRow to="/admin/hazards" icon={<AlertTriangle size={28} />}
          title="위험 관리" subtitle="제보 확인 · 해제 · 만료 연장" />
        <AdminMenuRow to="/admin/field-survey" icon={<MapPin size={28} />}
          title="단건 현장 측량" subtitle="개별 랜드마크 저장 (구버전)" />
        <AdminMenuRow to="/admin/entrances" icon={<ClipboardCheck size={28} />}
          title="입구 좌표 보정" subtitle="국립극장 / 케이블카 방면 입구" />
        <AdminMenuRow to="/admin/milestones" icon={<Ruler size={28} />}
          title="200m 거리 표지 보정" subtitle="기준 입구 + 미터" />
        <AdminMenuRow to="/admin/data-status" icon={<Database size={28} />}
          title="레코딩 데이터 현황" subtitle="입구·마일스톤·랜드마크 확인 & 삭제" />
      </nav>

      <StatusCard tone={pending.length ? "warning" : "neutral"}
        icon={<ClipboardCheck aria-hidden size={28} />}
        eyebrow="가입 승인"
        title={`승인 대기 ${pending.length}명`}
        description="새 가입자를 검토하고 승인 또는 거부합니다." />

      {/* 오디오 생성 카드 */}
      <div className="status-card space-y-3">
        <div className="flex items-center gap-3">
          <Volume2 aria-hidden size={24} />
          <p className="text-xl font-extrabold">안내 음성 파일 생성</p>
        </div>
        <p className="text-base text-muted-foreground">
          ElevenLabs로 35개 안내 음성을 생성해 Supabase Storage에 저장합니다.
          최초 한 번만 실행하면 이후 모든 이용자가 무료로 재생합니다.
        </p>
        {audioResult && (
          <p role="status" className={`rounded-xl px-4 py-2 font-bold text-base ${
            audioStatus === "done" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
          }`}>{audioResult}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            className="btn-primary"
            onClick={() => generateAudio(false)}
            disabled={audioStatus === "loading"}
            aria-busy={audioStatus === "loading"}>
            {audioStatus === "loading" ? "생성 중..." : "오디오 생성 (신규만)"}
          </button>
          <button
            className="btn-secondary"
            onClick={() => generateAudio(true)}
            disabled={audioStatus === "loading"}>
            전체 재생성
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border-2 border-foreground bg-[var(--danger)] px-4 py-3 font-bold text-[var(--danger-foreground)]">
          불러오기 실패: {(error as Error).message}
        </p>
      )}

      <section aria-label="사용자 목록" className="space-y-3">
        <h2 className="text-xl font-extrabold">사용자 ({users.length})</h2>
        {isLoading && <p>불러오는 중...</p>}
        {users.map((u) => (
          <div key={u.id} className="status-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">{u.name} <span className="ml-2 text-sm font-bold uppercase">{u.role}</span></p>
                <p className="text-base text-muted-foreground">{u.phone}</p>
                <p className="mt-1 text-base">
                  상태: <span className="font-extrabold">{u.status}</span>
                </p>
                <p className="text-xs text-muted-foreground">가입: {new Date(u.created_at).toLocaleString("ko-KR")}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {u.status !== "APPROVED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "APPROVED")}>승인</button>
              )}
              {u.status !== "REJECTED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "REJECTED")}>거부</button>
              )}
              {u.status !== "SUSPENDED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "SUSPENDED")}>정지</button>
              )}
              {u.status === "SUSPENDED" && (
                <button className="btn-secondary" onClick={() => act(u.id, "APPROVED")}>정지 해제</button>
              )}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function AdminMenuRow({ to, icon, title, subtitle }: { to: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link to={to} className="status-card flex items-center gap-4">
      <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-foreground bg-muted">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}
