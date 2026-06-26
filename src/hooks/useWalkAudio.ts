/**
 * useWalkAudio
 *
 * ElevenLabs TTS(/api/tts) + 띵동 비프음(Web Audio API) 통합 훅.
 * useAudioAnnouncer(Web Speech API) 를 대체합니다.
 *
 * 동작 원리:
 *  1. speak(text) → 띵동 비프 → /api/tts 캐시 오디오 재생
 *  2. 첫 재생 시 ElevenLabs API 호출, 이후 브라우저 캐시(immutable) 즉시 재생
 *  3. preload() 로 앱 시작 시 자주 쓰는 문구를 백그라운드에서 미리 받아 둠
 *  4. iOS AudioContext 잠금은 unlockAudio()로 user-gesture 내에서 해제
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { playTts, stopTts, ttsUrl } from "@/lib/tts-client";

// 띵동 비프 설정
const BEEP_HIGH  = 880;   // 첫 음 (Hz)
const BEEP_LOW   = 660;   // 둘째 음 (Hz)
const BEEP_DUR   = 0.18;  // 각 음 길이 (초)
const BEEP_GAP   = 0.10;  // 음 사이 간격 (초)
const BEEP_VOL   = 0.55;

export function useWalkAudio() {
  const [voiceOn, _setVoiceOn]   = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const voiceOnRef   = useRef(false);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const liveRef      = useRef<HTMLElement | null>(null);
  const busyRef      = useRef(false);
  const queueRef     = useRef<string[]>([]);

  const setVoiceOn = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    _setVoiceOn(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      voiceOnRef.current = next;
      return next;
    });
  }, []);

  // ── AudioContext 언락 (iOS: 반드시 user-gesture 내에서 호출) ──────────
  const unlockAudio = useCallback(() => {
    try {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      // 무음 버퍼 재생 → 완전 언락
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      setAudioUnlocked(true);
    } catch { /* 무시 */ }
  }, []);

  // ── 띵동 비프음 ────────────────────────────────────────────────────────
  const playBeep = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;

      const tone = (freq: number, start: number) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(BEEP_VOL, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + BEEP_DUR);
        osc.start(start);
        osc.stop(start + BEEP_DUR + 0.05);
      };

      tone(BEEP_HIGH, now);                      // 띵
      tone(BEEP_LOW,  now + BEEP_DUR + BEEP_GAP); // 동
    } catch { /* noop */ }
  }, []);

  // ── 큐 처리 ────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (busyRef.current || queueRef.current.length === 0) return;
    if (!voiceOnRef.current) return;

    const text = queueRef.current.shift()!;

    // aria-live 백업
    if (liveRef.current) {
      liveRef.current.textContent = "";
      requestAnimationFrame(() => {
        if (liveRef.current) liveRef.current.textContent = text;
      });
    }

    busyRef.current = true;
    try {
      await playTts(text);
    } catch {
      /* 재생 실패 시 조용히 다음으로 */
    } finally {
      busyRef.current = false;
      if (queueRef.current.length > 0) {
        setTimeout(flush, 80);
      }
    }
  }, []);

  // ── 공개 API: speak ────────────────────────────────────────────────────
  const speak = useCallback((text: string, opts: { urgent?: boolean; beep?: boolean } = {}) => {
    if (!voiceOnRef.current) return;
    const { urgent = false, beep = true } = opts;

    if (urgent) {
      // 즉시 큐 비우고 최우선 재생
      stopTts();
      queueRef.current = [];
      busyRef.current  = false;
    }

    if (beep) {
      playBeep();
      // 비프 후 0.55초 뒤 TTS 시작 (BEEP_DUR*2 + BEEP_GAP + 여유)
      setTimeout(() => {
        queueRef.current.push(text);
        flush();
      }, (BEEP_DUR * 2 + BEEP_GAP) * 1000 + 120);
    } else {
      queueRef.current.push(text);
      flush();
    }
  }, [playBeep, flush]);

  // ── 공개 API: preload ──────────────────────────────────────────────────
  // 백그라운드에서 오디오 파일을 미리 브라우저 캐시에 저장
  const preload = useCallback((phrases: string[]) => {
    // 동시 요청 폭주를 방지하기 위해 순차 지연
    phrases.forEach((text, i) => {
      setTimeout(() => {
        const audio = new Audio(ttsUrl(text));
        audio.preload = "auto";
        audio.load();
        // 오류 무시 (캐싱 실패해도 on-demand 재생으로 fallback)
        audio.onerror = () => {};
      }, i * 150); // 150ms 간격
    });
  }, []);

  // ── voiceOn 해제 시 오디오 중지 ───────────────────────────────────────
  useEffect(() => {
    if (!voiceOn) {
      stopTts();
      queueRef.current = [];
      busyRef.current  = false;
    }
  }, [voiceOn]);

  return {
    voiceOn,
    setVoiceOn,
    audioUnlocked,
    unlockAudio,
    speak,
    preload,
    playBeep,
    liveRef,
  };
}
