/**
 * audio-seed.server.ts
 * 서버 시작 시 Supabase Storage에 오디오 파일이 없으면 자동 생성.
 * server.ts 의 ctx.waitUntil() 로 백그라운드 실행 (요청 처리 지연 없음).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALL_AUDIO_ENTRIES } from "@/lib/audio-map";

const BUCKET   = "walk-audio";
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_multilingual_v2";

let seeded = false; // cold-start 당 한 번만 실행

export async function seedAudioIfNeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) return; // 키 없으면 조용히 종료

  try {
    // 버킷 없으면 생성
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find(b => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    // 기존 파일 목록 한 번만 조회
    const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 200 });
    const existingSet = new Set(existing?.map(f => f.name) ?? []);

    const missing = ALL_AUDIO_ENTRIES.filter(e => !existingSet.has(e.file));
    if (missing.length === 0) {
      console.log("[audio-seed] 모든 오디오 파일 존재 — 건너뜀");
      return;
    }

    console.log(`[audio-seed] ${missing.length}개 파일 생성 시작...`);

    for (const entry of missing) {
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
        if (!ttsRes.ok) { console.warn(`[audio-seed] ${entry.key} 실패`); continue; }
        const buf = await ttsRes.arrayBuffer();
        await supabaseAdmin.storage
          .from(BUCKET)
          .upload(entry.file, buf, { contentType: "audio/mpeg", upsert: false });
        console.log(`[audio-seed] ✓ ${entry.key}`);
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.warn(`[audio-seed] ${entry.key} 오류:`, e);
      }
    }
    console.log("[audio-seed] 완료");
  } catch (e) {
    console.warn("[audio-seed] 초기화 실패:", e);
  }
}
