/**
 * audio-generate.ts
 * 오디오 생성 서버 함수 (관리자 전용)
 */
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { ALL_AUDIO_ENTRIES } from "@/lib/audio-map";

const SESSION_COOKIE_NAME = "nw_session";
const BUCKET   = "walk-audio";
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_multilingual_v2";

async function sessionTokenFromRequest(): Promise<string | null> {
  const { getSessionTokenFromCookie } = await import("@/lib/namsan-auth.server");
  return (
    getCookie(SESSION_COOKIE_NAME)
    ?? getRequestHeader("x-nw-session")
    ?? getSessionTokenFromCookie(getRequestHeader("cookie"))
  );
}

export const generateAudioFn = createServerFn({ method: "POST" })
  .inputValidator((data: { force?: boolean }) => data)
  .handler(async ({ data }) => {
    // 관리자 확인
    const { userFromToken } = await import("@/lib/namsan-auth.server");
    const token = await sessionTokenFromRequest();
    const user  = await userFromToken(token);
    if (!user || user.role !== "ADMIN") throw new Error("관리자만 사용할 수 있습니다.");

    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) throw new Error("ELEVENLABS_API_KEY 미설정");

    const force = data?.force ?? false;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 버킷 없으면 생성
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b: any) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    // 기존 파일 목록 한 번만 조회
    const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 200 });
    const existingSet = new Set(existing?.map((f: any) => f.name) ?? []);

    const results: { key: string; status: "ok"|"skip"|"error"; detail?: string }[] = [];

    for (const entry of ALL_AUDIO_ENTRIES) {
      if (!force && existingSet.has(entry.file)) {
        results.push({ key: entry.key, status: "skip" });
        continue;
      }
      try {
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
          {
            method: "POST",
            headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: entry.text,
              model_id: MODEL_ID,
              voice_settings: { stability: 0.5, similarity_boost: 0.85 },
            }),
          }
        );
        if (!ttsRes.ok) {
          results.push({ key: entry.key, status: "error", detail: await ttsRes.text() });
          continue;
        }
        const buf = await ttsRes.arrayBuffer();
        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET).upload(entry.file, buf, { contentType: "audio/mpeg", upsert: true });
        results.push({ key: entry.key, status: upErr ? "error" : "ok", detail: upErr?.message });
        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        results.push({ key: entry.key, status: "error", detail: e.message });
      }
    }

    return {
      ok:    results.filter(r => r.status === "ok").length,
      skip:  results.filter(r => r.status === "skip").length,
      error: results.filter(r => r.status === "error").length,
    };
  });
