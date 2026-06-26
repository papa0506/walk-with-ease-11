#!/usr/bin/env node
/**
 * scripts/gen-audio.mjs
 *
 * ElevenLabs로 모든 사전 생성 오디오 파일을 생성합니다.
 * 한 번만 실행하면 됩니다. 이미 있는 파일은 건너뜁니다.
 *
 * 사용법:
 *   ELEVENLABS_API_KEY=sk-... node scripts/gen-audio.mjs
 *
 * 결과: public/audio/*.mp3 생성
 * 생성 후 Git 커밋하면 Lovable 배포 시 정적 파일로 서빙됩니다.
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "audio");

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("❌ ELEVENLABS_API_KEY 환경변수를 설정하세요.");
  console.error("   예: ELEVENLABS_API_KEY=sk-... node scripts/gen-audio.mjs");
  process.exit(1);
}

const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah (기존 설정 유지)
const MODEL_ID = "eleven_multilingual_v2";
const DELAY_MS = 600; // API rate limit 방지

mkdirSync(OUT_DIR, { recursive: true });

// ── 오디오 목록 (audio-map.ts 와 동기화) ────────────────
function distEntries() {
  return Array.from({ length: 17 }, (_, i) => {
    const m = (i + 1) * 200;
    const next = m + 200;
    return {
      key: `d${m}`,
      file: `d${m}.mp3`,
      text: m < 3400
        ? `${m}미터 지점입니다. 다음 안내는 ${next}미터입니다.`
        : `${m}미터 지점입니다. 종점 근처입니다.`,
    };
  });
}

const ENTRIES = [
  // 거리 안내 17개
  ...distEntries(),

  // 방향 세그먼트 6개
  { key: "side-left",  file: "side-left.mp3",  text: "진행 방향 왼쪽에" },
  { key: "side-right", file: "side-right.mp3", text: "진행 방향 오른쪽에" },
  { key: "side-front", file: "side-front.mp3", text: "정면에" },
  { key: "side-both",  file: "side-both.mp3",  text: "양쪽에" },
  { key: "side-all",   file: "side-all.mp3",   text: "길 전체에" },
  { key: "side-near",  file: "side-near.mp3",  text: "근처에" },

  // 동사 세그먼트 3개
  { key: "v-here",    file: "v-here.mp3",    text: "있습니다." },
  { key: "v-caution", file: "v-caution.mp3", text: "있습니다. 주의하세요." },
  { key: "v-warn",    file: "v-warn.mp3",    text: "주의하세요." },

  // 입구 감지 / 출발 안내 4개
  {
    key: "ent-start-theater", file: "ent-start-theater.mp3",
    text: "국립극장 입구에서 출발합니다. 케이블카 방면 입구 방향으로 안내합니다.",
  },
  {
    key: "ent-start-cablecar", file: "ent-start-cablecar.mp3",
    text: "케이블카 방면 입구에서 출발합니다. 국립극장 입구 방향으로 안내합니다.",
  },
  {
    key: "ent-detect-theater", file: "ent-detect-theater.mp3",
    text: "이곳은 국립극장 입구입니다. 산책을 시작하려면 산책 시작 버튼을 누르세요.",
  },
  {
    key: "ent-detect-cablecar", file: "ent-detect-cablecar.mp3",
    text: "이곳은 케이블카 방면 입구입니다. 산책을 시작하려면 산책 시작 버튼을 누르세요.",
  },

  // 방향 전환 2개
  {
    key: "dir-return-theater", file: "dir-return-theater.mp3",
    text: "국립극장 입구 방향으로 돌아가고 있습니다.",
  },
  {
    key: "dir-fwd-cablecar", file: "dir-fwd-cablecar.mp3",
    text: "케이블카 방면 입구 방향으로 다시 진행합니다.",
  },

  // 시스템 2개
  { key: "sys-start", file: "sys-start.mp3", text: "산책을 시작합니다. 음성 안내가 시작됩니다." },
  { key: "sys-end",   file: "sys-end.mp3",   text: "산책을 종료합니다. 수고하셨습니다." },
];

// ── ElevenLabs TTS 호출 ──────────────────────────────────
async function generateMp3(text) {
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.85 },
      }),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs API 오류 ${resp.status}: ${err}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log(`\n🎙️  ElevenLabs 오디오 생성 시작 (총 ${ENTRIES.length}개)`);
  console.log(`   저장 위치: ${OUT_DIR}\n`);

  let generated = 0;
  let skipped   = 0;

  for (const { key, file, text } of ENTRIES) {
    const outPath = join(OUT_DIR, file);

    if (existsSync(outPath)) {
      console.log(`⏭  [${key}] 이미 존재, 건너뜀`);
      skipped++;
      continue;
    }

    process.stdout.write(`⏳ [${key}] 생성 중... `);
    try {
      const buf = await generateMp3(text);
      writeFileSync(outPath, buf);
      console.log(`✅ ${buf.length.toLocaleString()}bytes`);
      generated++;
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.log(`❌ 실패: ${err.message}`);
    }
  }

  console.log(`\n완료: ${generated}개 생성, ${skipped}개 건너뜀`);
  console.log(`\n다음 단계:`);
  console.log(`  git add public/audio/`);
  console.log(`  git commit -m "chore: 사전 생성 오디오 파일 추가"`);
  console.log(`  git push`);
}

main().catch(e => { console.error(e); process.exit(1); });
