/**
 * POST /api/generate-audio
 * 관리자 전용: ElevenLabs로 모든 안내 음성 생성 → Supabase Storage 저장.
 * 이미 있는 파일은 건너뜁니다 (force=true 시 덮어쓰기).
 */

import { createAPIFileRoute } from "@tanstack/react-start/api";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALL_AUDIO_ENTRIES } from "@/lib/audio-map";

const BUCKET = "walk-audio";
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_multilingual_v2";

export const APIRoute = createAPIFileRoute("/api/generate-audio")({
  POST: async ({ request }) => {
    // 세션 쿠키로 관리자 확인
    const cookie = request.headers.get("cookie") ?? "";
    const sbToken = cookie.match(/sb-[^=]+-auth-token=([^;]+)/)?.[1];

    if (sbToken) {
      const decoded = decodeURIComponent(sbToken);
      try {
        const parsed = JSON.parse(decoded);
        const token = parsed[0] ?? parsed?.access_token ?? parsed;
        const { data: { user } } = await supabaseAdmin.auth.getUser(
          typeof token === "string" ? token : token?.access_token
        );
        const { data: profile } = await supabaseAdmin
          .from("users").select("role").eq("id", user?.id ?? "").single();
        if (profile?.role !== "ADMIN") {
          return new Response(JSON.stringify({ error: "관리자만 사용 가능합니다" }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "인증 오류" }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY 미설정" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    // 버킷 없으면 생성
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find(b => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    const results: { key: string; status: "ok"|"skip"|"error"; detail?: string }[] = [];

    for (const entry of ALL_AUDIO_ENTRIES) {
      if (!force) {
        const { data: existing } = await supabaseAdmin.storage
          .from(BUCKET).list("", { search: entry.file });
        if (existing?.find(f => f.name === entry.file)) {
          results.push({ key: entry.key, status: "skip" });
          continue;
        }
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

    const ok   = results.filter(r => r.status === "ok").length;
    const skip = results.filter(r => r.status === "skip").length;
    const err  = results.filter(r => r.status === "error").length;
    return new Response(JSON.stringify({ ok, skip, error: err, results }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  },
});
