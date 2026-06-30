/**
 * walk-audio-player.ts
 * 정적 파일 → 실패 시 on-demand TTS 자동 fallback
 */

import { AUDIO_URL, AUDIO_TEXT } from "./audio-map";

let _ctx: AudioContext | null = null;
let _currentEl: HTMLAudioElement | null = null;

// 동시 안내 방지용 락
let _speaking = false;
const _queue: Array<() => Promise<void>> = [];

async function _processQueue() {
  if (_speaking || _queue.length === 0) return;
  _speaking = true;
  try {
    const task = _queue.shift()!;
    await task();
  } finally {
    _speaking = false;
    if (_queue.length > 0) setTimeout(_processQueue, 100);
  }
}

/** 다음 안내를 큐에 추가. 이미 말하는 중이면 대기 */
export function enqueue(task: () => Promise<void>): void {
  _queue.push(task);
  _processQueue();
}

export function initAudioContext(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

export function stopAudio(): void {
  _queue.length = 0; // 큐도 비움
  if (_currentEl) { _currentEl.pause(); _currentEl.currentTime = 0; _currentEl = null; }
}

function _playUrl(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (_currentEl) { _currentEl.pause(); _currentEl = null; }
    const el = new Audio(url);
    _currentEl = el;
    el.onended  = () => { _currentEl = null; resolve(); };
    el.onerror  = () => { _currentEl = null; reject(new Error(`load failed: ${url}`)); };
    el.play().catch(reject);
  });
}

/** 온디맨드 TTS (/api/tts) */
export function playDynamic(text: string): Promise<void> {
  const url = `/api/tts?text=${encodeURIComponent(text)}`;
  return _playUrl(url);
}

/**
 * 정적 파일 재생. 파일 없거나 로드 실패 시 on-demand TTS로 자동 fallback.
 */
export async function playStatic(key: string): Promise<void> {
  const url = AUDIO_URL[key];
  if (!url) {
    // 키가 없으면 텍스트로 on-demand
    const text = AUDIO_TEXT[key];
    if (text) return playDynamic(text);
    throw new Error(`Unknown audio key: ${key}`);
  }
  try {
    await _playUrl(url);
  } catch {
    // 정적 파일 실패 (404 등) → on-demand TTS fallback
    const text = AUDIO_TEXT[key];
    if (text) {
      console.warn(`[audio] static failed for "${key}", falling back to TTS`);
      await playDynamic(text);
    }
    // fallback도 없으면 무음 통과
  }
}

/** 세그먼트 순서 재생 */
export async function playSegments(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i++) {
    await playStatic(keys[i]);
    if (i < keys.length - 1) await new Promise<void>(r => setTimeout(r, 60));
  }
}

/** 비프음 (Web Audio API, 외부 파일 불필요) */
export function playBeep(): Promise<void> {
  const ctx = _ctx ?? initAudioContext();
  return new Promise<void>(resolve => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    const tone = (freq: number, t: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = "sine"; o.frequency.value = freq; o.connect(gain);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + dur);
    };
    tone(880, 0, 0.18); tone(660, 0.22, 0.22);
    setTimeout(resolve, 480);
  });
}

/**
 * 랜드마크 안내: 방향 세그먼트 + 이름(on-demand) + 동사
 * 정적 세그먼트 실패 시 전체를 하나의 문장으로 on-demand fallback
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
  const sideKey  = sideMap[side] ?? "side-near";
  const verbKey  = caution ? "v-caution" : "v-here";
  const particle = hasTrailingConsonant(name) ? "이" : "가";
  const sideText = AUDIO_TEXT[sideKey] ?? "근처에";
  const verbText = AUDIO_TEXT[verbKey] ?? "있습니다.";

  // 정적 세그먼트 시도 후 실패하면 전체 문장 on-demand
  try {
    await playStatic(sideKey);
    await new Promise<void>(r => setTimeout(r, 60));
    await playDynamic(`${name}${particle}`);
    await new Promise<void>(r => setTimeout(r, 60));
    await playStatic(verbKey);
  } catch {
    await playDynamic(`${sideText} ${name}${particle} ${verbText}`);
  }
}

function hasTrailingConsonant(str: string): boolean {
  const code = str[str.length - 1]?.charCodeAt(0) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export async function preloadStaticAudio(keys: string[]): Promise<void> {
  for (const key of keys) {
    const url = AUDIO_URL[key];
    if (!url) continue;
    try { await fetch(url, { cache: "force-cache" }); await new Promise<void>(r => setTimeout(r, 80)); }
    catch { /* 사전 로드 실패 무시 */ }
  }
}
