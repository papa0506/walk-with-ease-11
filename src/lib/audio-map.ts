/**
 * audio-map.ts
 * 사전 생성된 모든 오디오 파일 목록.
 * 각 항목: { key, file, text }
 *   key  : 코드에서 참조하는 식별자
 *   file : public/audio/ 아래 파일명
 *   text : ElevenLabs로 생성할 한국어 원문
 */

export interface AudioEntry {
  key:  string;
  file: string;   // /audio/{file} 로 서빙
  text: string;
}

// ── 거리 안내 (200m~3400m, 매 200m) ──────────────────────────
function distEntry(m: number): AudioEntry {
  const next = m + 200;
  return {
    key:  `d${m}`,
    file: `d${m}.mp3`,
    text: m < 3400
      ? `${m}미터 지점입니다. 다음 안내는 ${next}미터입니다.`
      : `${m}미터 지점입니다. 종점 근처입니다.`,
  };
}
export const DISTANCE_ENTRIES: AudioEntry[] = Array.from(
  { length: 17 }, (_, i) => distEntry((i + 1) * 200)
);

// ── 방향(측면) 세그먼트 ──────────────────────────────────────
export const SIDE_ENTRIES: AudioEntry[] = [
  { key: "side-left",  file: "side-left.mp3",  text: "진행 방향 왼쪽에" },
  { key: "side-right", file: "side-right.mp3", text: "진행 방향 오른쪽에" },
  { key: "side-front", file: "side-front.mp3", text: "정면에" },
  { key: "side-both",  file: "side-both.mp3",  text: "양쪽에" },
  { key: "side-all",   file: "side-all.mp3",   text: "길 전체에" },
  { key: "side-near",  file: "side-near.mp3",  text: "근처에" },
];

// ── 동사 세그먼트 ──────────────────────────────────────────────
export const VERB_ENTRIES: AudioEntry[] = [
  { key: "v-here",    file: "v-here.mp3",    text: "있습니다." },
  { key: "v-caution", file: "v-caution.mp3", text: "있습니다. 주의하세요." },
  { key: "v-warn",    file: "v-warn.mp3",    text: "주의하세요." },
];

// ── 입구 / 감지 ────────────────────────────────────────────────
export const ENTRANCE_ENTRIES: AudioEntry[] = [
  {
    key: "ent-start-theater",
    file: "ent-start-theater.mp3",
    text: "국립극장 입구에서 출발합니다. 케이블카 방면 입구 방향으로 안내합니다.",
  },
  {
    key: "ent-start-cablecar",
    file: "ent-start-cablecar.mp3",
    text: "케이블카 방면 입구에서 출발합니다. 국립극장 입구 방향으로 안내합니다.",
  },
  {
    key: "ent-detect-theater",
    file: "ent-detect-theater.mp3",
    text: "이곳은 국립극장 입구입니다. 산책을 시작하려면 산책 시작 버튼을 누르세요.",
  },
  {
    key: "ent-detect-cablecar",
    file: "ent-detect-cablecar.mp3",
    text: "이곳은 케이블카 방면 입구입니다. 산책을 시작하려면 산책 시작 버튼을 누르세요.",
  },
];

// ── 방향 전환 ──────────────────────────────────────────────────
export const DIRECTION_ENTRIES: AudioEntry[] = [
  {
    key: "dir-return-theater",
    file: "dir-return-theater.mp3",
    text: "국립극장 입구 방향으로 돌아가고 있습니다.",
  },
  {
    key: "dir-fwd-cablecar",
    file: "dir-fwd-cablecar.mp3",
    text: "케이블카 방면 입구 방향으로 다시 진행합니다.",
  },
];

// ── 시스템 ─────────────────────────────────────────────────────
export const SYSTEM_ENTRIES: AudioEntry[] = [
  { key: "sys-start",  file: "sys-start.mp3",  text: "산책을 시작합니다. 음성 안내가 시작됩니다." },
  { key: "sys-end",    file: "sys-end.mp3",    text: "산책을 종료합니다. 수고하셨습니다." },
];

// ── 전체 목록 ──────────────────────────────────────────────────
export const ALL_AUDIO_ENTRIES: AudioEntry[] = [
  ...DISTANCE_ENTRIES,
  ...SIDE_ENTRIES,
  ...VERB_ENTRIES,
  ...ENTRANCE_ENTRIES,
  ...DIRECTION_ENTRIES,
  ...SYSTEM_ENTRIES,
];

// ── Supabase Storage 베이스 URL ──────────────────────────────
// 환경변수에서 읽어 클라이언트에서도 접근 가능 (public 버킷)
const STORAGE_BASE =
  typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL
    ? `${(import.meta as any).env.VITE_SUPABASE_URL}/storage/v1/object/public/walk-audio`
    : "/audio"; // 로컬 fallback (gen-audio 스크립트로 생성 시)

// ── key → Supabase Storage URL 맵 ────────────────────────────
export const AUDIO_URL: Record<string, string> = Object.fromEntries(
  ALL_AUDIO_ENTRIES.map(e => [e.key, `${STORAGE_BASE}/${e.file}`])
);

// ── DB side 값 → side 세그먼트 key ────────────────────────────
export function sideKey(side: string): string {
  switch (side) {
    case "LEFT":  return "side-left";
    case "RIGHT": return "side-right";
    case "FRONT": return "side-front";
    case "BOTH":  return "side-both";
    case "ALL":   return "side-all";
    default:      return "side-near";
  }
}

// ── 거리 → 해당 거리 key ─────────────────────────────────────
export function distKey(meters: number): string | null {
  if (meters % 200 !== 0 || meters < 200 || meters > 3400) return null;
  return `d${meters}`;
}

// ── key → 원문 텍스트 맵 (정적 파일 실패 시 on-demand fallback용) ─
export const AUDIO_TEXT: Record<string, string> = Object.fromEntries(
  ALL_AUDIO_ENTRIES.map(e => [e.key, e.text])
);
