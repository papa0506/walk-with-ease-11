/**
 * useAudioAnnouncer
 *
 * iOS / Android 모두에서 확실하게 동작하는 음성 안내 훅.
 *
 * 해결한 문제들:
 * 1. iOS speechSynthesis 15초 멈춤 버그 → keepalive 타이머
 * 2. Android 음성 목록 지연 로딩 → voiceschanged 대기
 * 3. AudioContext 잠금 → 사용자 제스처 시 unlockAudio() 호출 필요
 * 4. onend 미발화(Android) → watchdog 타이머로 강제 진행
 * 5. 중복 발화 / 큐 꼬임 → ref 기반 단일 큐
 * 6. 비프음 → Web Audio API로 파일 없이 생성 (가장 신뢰도 높음)
 * 7. 스크린리더(VoiceOver/TalkBack) 백업 → aria-live 영역 동시 업데이트
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── 타입 ─────────────────────────────────────────────────────
export type AnnounceOptions = {
  beep?: boolean;    // 비프음 먼저 (기본 true)
  urgent?: boolean;  // 즉시 큐 비우고 최우선 재생
};

// ── 상수 ─────────────────────────────────────────────────────
const BEEP_HZ        = 880;
const BEEP_SEC       = 0.13;
const BEEP_VOL       = 0.65;
const KEEPALIVE_MS   = 10_000;  // iOS 버그 대응
const WATCHDOG_BASE  = 6_000;   // 최소 watchdog 대기(ms)
const WATCHDOG_PER_CHAR = 120;  // 글자당 watchdog 추가(ms)

// ── 유틸 ─────────────────────────────────────────────────────
function pickKoreanVoice(): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const vs = window.speechSynthesis.getVoices();
  return (
    vs.find(v => v.lang === "ko-KR" && !v.name.toLowerCase().includes("google")) ??
    vs.find(v => v.lang === "ko-KR") ??
    vs.find(v => v.lang.startsWith("ko")) ??
    null
  );
}

// ── 훅 ───────────────────────────────────────────────────────
export function useAudioAnnouncer() {
  const [voiceOn, _setVoiceOn] = useState(false);

  // ref 로도 최신 값 유지 (클로저 stale 방지)
  const voiceOnRef  = useRef(false);
  const audioCtx    = useRef<AudioContext | null>(null);
  const queue       = useRef<string[]>([]);
  const busy        = useRef(false);
  const keepalive   = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdog    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef     = useRef<HTMLElement | null>(null);  // aria-live DOM node

  // voiceOn 상태↔ref 동기화
  const setVoiceOn = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    _setVoiceOn(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      voiceOnRef.current = next;
      return next;
    });
  }, []);

  // ── AudioContext 언락 (반드시 버튼 클릭 등 user-gesture에서 호출) ──
  const unlockAudio = useCallback(() => {
    try {
      const Cls = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Cls) return;
      if (!audioCtx.current) {
        audioCtx.current = new Cls();
      }
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      // 무음 버퍼 재생 → 완전 언락
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* 일부 브라우저 무시 */ }
  }, []);

  // ── 비프음 (Web Audio API) ────────────────────────────────
  const playBeep = useCallback((hz = BEEP_HZ, sec = BEEP_SEC, vol = BEEP_VOL) => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(hz, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + sec);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + sec + 0.05);
    } catch { /* noop */ }
  }, []);

  // ── 내부: 큐에서 다음 발화 처리 ──────────────────────────
  const flush = useCallback(() => {
    if (busy.current || queue.current.length === 0) return;
    if (!("speechSynthesis" in window)) return;

    const text = queue.current.shift()!;

    // ① aria-live 업데이트 (스크린리더 백업)
    if (liveRef.current) {
      liveRef.current.textContent = "";
      requestAnimationFrame(() => {
        if (liveRef.current) liveRef.current.textContent = text;
      });
    }

    busy.current = true;

    const u = new SpeechSynthesisUtterance(text);
    u.lang   = "ko-KR";
    u.rate   = 1.05;
    u.volume = 1.0;
    u.pitch  = 1.0;
    const voice = pickKoreanVoice();
    if (voice) u.voice = voice;

    // ② watchdog: onend 미발화 대비
    const ms = WATCHDOG_BASE + text.length * WATCHDOG_PER_CHAR;
    watchdog.current = setTimeout(() => {
      busy.current = false;
      flush();
    }, ms);

    u.onend = () => {
      clearTimeout(watchdog.current!);
      busy.current = false;
      setTimeout(flush, 80);
    };
    u.onerror = (e) => {
      clearTimeout(watchdog.current!);
      busy.current = false;
      // 'interrupted' / 'canceled' 은 정상 취소 — 무시
      if (e.error !== "interrupted" && e.error !== "canceled") {
        console.warn("[TTS]", e.error);
      }
      setTimeout(flush, 150);
    };

    // ③ Android: speak 직전에 한번만 cancel 하여 stuck 방지
    //    (iOS에서는 오히려 문제가 되므로 isSpeaking 확인 후 조건부)
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    setTimeout(() => {
      try { window.speechSynthesis.speak(u); } catch {
        busy.current = false;
        setTimeout(flush, 200);
      }
    }, 30);
  }, []);

  // ── iOS keepalive ─────────────────────────────────────────
  useEffect(() => {
    if (!voiceOn) {
      if (keepalive.current) clearInterval(keepalive.current);
      return;
    }
    keepalive.current = setInterval(() => {
      if (!window.speechSynthesis) return;
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, KEEPALIVE_MS);
    return () => { if (keepalive.current) clearInterval(keepalive.current); };
  }, [voiceOn]);

  // ── voiceOn 해제 시 초기화 ───────────────────────────────
  useEffect(() => {
    if (!voiceOn) {
      if (watchdog.current) clearTimeout(watchdog.current);
      window.speechSynthesis?.cancel();
      queue.current = [];
      busy.current  = false;
    }
  }, [voiceOn]);

  // ── Android: voices 로드 지연 대응 ──────────────────────
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const handler = () => { /* 로드 완료: 필요 시 다음 flush 유도 */ flush(); };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
  }, [flush]);

  // ── 공개 API: announce ────────────────────────────────────
  const announce = useCallback((text: string, opts: AnnounceOptions = {}) => {
    if (!voiceOnRef.current) return;
    const { beep = true, urgent = false } = opts;

    if (urgent) {
      // 모든 큐 비우고 즉시
      if (watchdog.current) clearTimeout(watchdog.current);
      window.speechSynthesis?.cancel();
      queue.current = [];
      busy.current  = false;
      if (beep) {
        playBeep(); setTimeout(() => playBeep(), 200);
        setTimeout(() => { queue.current.push(text); flush(); }, 500);
      } else {
        queue.current.push(text);
        setTimeout(flush, 50);
      }
    } else {
      if (beep) {
        playBeep();
        setTimeout(() => { queue.current.push(text); flush(); }, 220);
      } else {
        queue.current.push(text);
        flush();
      }
    }
  }, [playBeep, flush]);

  return {
    voiceOn,
    setVoiceOn,
    unlockAudio,
    announce,
    playBeep,
    liveRef,        // 이 ref를 aria-live 엘리먼트에 연결
  };
}
