import { createFileRoute } from "@tanstack/react-router";

// ElevenLabs TTS 프록시 (서버 전용)
// GET /api/tts?text=...&voice=...   → audio/mpeg
// URL이 같으면 브라우저 HTTP 캐시(immutable)에 의해 재요청이 없으므로
// 동일 문구는 1회만 생성됩니다.

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah (다국어 v2에서 한국어 양호)
const MODEL_ID = "eleven_multilingual_v2";

async function synth(text: string, voiceId: string): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("ELEVENLABS_API_KEY missing", { status: 500 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
          speed: 1.0,
        },
      }),
    },
  );

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return new Response(`TTS upstream failed: ${upstream.status} ${errText}`, {
      status: 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      // 동일 text/voice URL은 영구 캐시
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text")?.trim();
        const voice = url.searchParams.get("voice")?.trim() || DEFAULT_VOICE;
        if (!text) return new Response("missing text", { status: 400 });
        if (text.length > 500) return new Response("text too long", { status: 400 });
        return synth(text, voice);
      },
    },
  },
});
