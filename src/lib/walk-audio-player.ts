/**
 * walk-audio-player.ts
 *
 * 세 가지 재생 경로를 통합 제공:
 *  1. playStatic(key)         → public/audio/ 사전 생성 파일 재생 (무료)
 *  2. playSegments(keys[])    → 여러 세그먼트를 이어 재생 (방향+랜드마크명+동사)
 *  3. playDynamic(text)       → /api/tts 온디맨드 (브라우저 캐시 후 무료)
 *
 * 모든 함수는 playBeep()를 먼저 호출하지 않습니다.
 * 호출부에서 playBeep() → play*() 순서로 사용하세요.
 */

import { AUDIO_URL } from "./audio-map";

// ── 내부 상태 ──────────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _currentEl: HTMLAudioElement | null = null;

/** iOS AudioContext 잠금 해제 (사용자 제스처 핸들러 안에서 호출) */
export function initAudioContext(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (_ctx.state === "suspended") {
    _ctx.resume();
  }
  return _ctx;
}

/** 현재 재생 중인 오디오 정지 */
export function stopAudio(): void {
  if (_currentEl) {
    _currentEl.pause();
    _currentEl.currentTime = 0;
    _currentEl = null;
  }
}

// ── 내부: 단일 URL 재생 ───────────────────────────────────
function _playUrl(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stopAudio();
    const el = new Audio(url);
    _currentEl = el;
    el.onended = () => { _currentEl = null; resolve(); };
    el.onerror = () => { _currentEl = null; reject(new Error(`Audio load failed: ${url}`)); };
    el.play().catch(reject);
  });
}

// ── 1. 사전 생성 파일 재생 ────────────────────────────────
export function playStatic(key: string): Promise<void> {
  const url = AUDIO_URL[key];
  if (!url) return Promise.reject(new Error(`Unknown audio key: ${key}`));
  return _playUrl(url);
}

// ── 2. 세그먼트 조합 재생 ─────────────────────────────────
/** 여러 키를 순서대로 재생. 세그먼트 사이 50ms 간격 */
export async function playSegments(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i++) {
    await playStatic(keys[i]);
    if (i < keys.length - 1) {
      await new Promise<void>(r => setTimeout(r, 50));
    }
  }
}

// ── 3. 온디맨드 TTS (브라우저 캐시 활용) ─────────────────
export function playDynamic(text: string, voice?: string): Promise<void> {
  const url = `/api/tts?text=${encodeURIComponent(text)}${voice ? `&voice=${voice}` : ""}`;
  return _playUrl(url);
}

// ── 띵동 비프음 (Web Audio API, 외부 파일 불필요) ─────────
export function playBeep(): Promise<void> {
  const ctx = _ctx ?? initAudioContext();
  return new Promise<void>(resolve => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);

    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };

    playTone(880, 0,    0.18);   // 딩
    playTone(660, 0.22, 0.22);   // 동

    setTimeout(resolve, 480);
  });
}

// ── 랜드마크 조합: side + 이름(온디맨드) + 동사 ─────────
/**
 * 예: announceLandmark("RIGHT", "화장실", false)
 *   → playStatic("side-right") → playDynamic("화장실이") → playStatic("v-here")
 *
 * @param side    DB의 side 값 ("LEFT"|"RIGHT"|"FRONT"|"BOTH"|"ALL"|"NEAR")
 * @param name    랜드마크 이름 (짧을수록 좋음)
 * @param caution 주의 필요 여부
 */
export async function announceLandmark(
  side: string,
  name: string,
  caution = false,
): Promise<void> {
  const sideMap: Record<string, string> = {
    LEFT: "side-left", RIGHT: "side-right", FRONT: "side-front",
    BOTH: "side-both", ALL: "side-all",
  };
  const sideAudioKey = sideMap[side] ?? "side-near";
  const verb = caution ? "v-caution" : "v-here";

  // side 세그먼트
  await playStatic(sideAudioKey);
  await new Promise<void>(r => setTimeout(r, 50));

  // 이름 (온디맨드 TTS, 브라우저 캐시 → 첫 번만 API 호출)
  // 이(가) 조사 자동 부착: 받침 있으면 "이", 없으면 "가"
  const particle = hasTrailingConsonant(name) ? "이" : "가";
  await playDynamic(`${name}${particle}`);
  await new Promise<void>(r => setTimeout(r, 50));

  // 동사
  await playStatic(verb);
}

/** 한글 받침 여부 판별 */
function hasTrailingConsonant(str: string): boolean {
  const last = str[str.length - 1];
  const code = last?.charCodeAt(0);
  if (!code || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

// ── 사전 로드 (Service Worker 없이 fetch로 캐시 시드) ────
/**
 * 앱 시작 시 정적 파일들을 브라우저 캐시에 올려두기.
 * 서버가 Cache-Control: immutable 을 반환하면 이후 재생이 즉각.
 */
export async function preloadStaticAudio(keys: string[]): Promise<void> {
  for (const key of keys) {
    const url = AUDIO_URL[key];
    if (!url) continue;
    try {
      await fetch(url, { cache: "force-cache" });
      await new Promise<void>(r => setTimeout(r, 80));
    } catch {
      // 사전 로드 실패해도 재생 시 시도하므로 무시
    }
  }
}
