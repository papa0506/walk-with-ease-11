/**
 * walk-audio-player.ts
 * 모든 오디오를 AudioContext (decodeAudioData) 로 재생 → iOS HTMLAudio 차단 문제 해결
 * 정적 파일 → 실패 시 on-demand TTS 자동 fallback
 */

import { AUDIO_URL, AUDIO_TEXT } from "./audio-map";

let _ctx: AudioContext | null = null;
let _currentSource: AudioBufferSourceNode | null = null;

// 동시 안내 방지용 큐
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
    if (_queue.length > 0) setTimeout(_processQueue, 80);
  }
}

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
  _queue.length = 0;
  if (_currentSource) {
    try { _currentSource.stop(); } catch { /* already ended */ }
    _currentSource = null;
  }
}

/**
 * URL → AudioContext 디코딩 후 재생 (iOS 완전 호환)
 * HTMLAudioElement 대신 AudioContext.decodeAudioData 사용
 */
async function _playUrl(url: string): Promise<void> {
  const ctx = _ctx ?? initAudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const arrayBuf = await res.arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);

  // 이전 재생 중지
  if (_currentSource) {
    try { _currentSource.stop(); } catch { /* already ended */ }
    _currentSource = null;
  }

  return new Promise<void>((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    src.onended = () => { _currentSource = null; resolve(); };
    src.start();
    _currentSource = src;
  });
}

/** 온디맨드 TTS (/api/tts) */
export function playDynamic(text: string): Promise<void> {
  return _playUrl(`/api/tts?text=${encodeURIComponent(text)}`);
}

/**
 * 정적 파일 재생. 실패 시 on-demand TTS fallback
 */
export async function playStatic(key: string): Promise<void> {
  const url = AUDIO_URL[key];
  if (!url) {
    const text = AUDIO_TEXT[key];
    if (text) return playDynamic(text);
    throw new Error(`Unknown audio key: ${key}`);
  }
  try {
    await _playUrl(url);
  } catch {
    const text = AUDIO_TEXT[key];
    if (text) {
      console.warn(`[audio] static failed "${key}", fallback to TTS`);
      await playDynamic(text);
    }
  }
}

/** 세그먼트 순서 재생 */
export async function playSegments(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i++) {
    await playStatic(keys[i]);
    if (i < keys.length - 1) await new Promise<void>(r => setTimeout(r, 60));
  }
}

/** 비프음 (Web Audio API) */
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
 * 실패 시 전체를 하나의 문장으로 on-demand fallback
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

export function hasTrailingConsonant(str: string): boolean {
  const code = str[str.length - 1]?.charCodeAt(0) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export async function preloadStaticAudio(keys: string[]): Promise<void> {
  // AudioContext 방식에서는 fetch + cache 로 사전 로드
  for (const key of keys) {
    const url = AUDIO_URL[key];
    if (!url) continue;
    try {
      await fetch(url, { cache: "force-cache" });
      await new Promise<void>(r => setTimeout(r, 80));
    } catch { /* 사전 로드 실패 무시 */ }
  }
}
