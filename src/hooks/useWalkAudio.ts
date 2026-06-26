/**
 * useWalkAudio.ts
 *
 * 산책 화면의 통합 오디오 훅.
 * - 모든 고정 문구 → 사전 생성 static 파일 재생 (무료)
 * - 랜드마크 이름 → 세그먼트 조합 (방향 + 이름 on-demand + 동사)
 * - 동적 내용 → /api/tts 온디맨드 (브라우저 캐시)
 */

import { useRef, useState, useCallback, useEffect } from "react";
import {
  initAudioContext,
  stopAudio,
  playBeep,
  playStatic,
  playSegments,
  playDynamic,
  announceLandmark,
  preloadStaticAudio,
} from "../lib/walk-audio-player";
import { AUDIO_URL, sideKey, distKey } from "../lib/audio-map";

// 앱 시작 시 사전 로드할 핵심 파일
const PRELOAD_PRIORITY = [
  "sys-start",
  "ent-detect-theater", "ent-detect-cablecar",
  "ent-start-theater",  "ent-start-cablecar",
  "dir-return-theater", "dir-fwd-cablecar",
  "side-left", "side-right", "side-front", "side-both", "side-near",
  "v-here", "v-caution",
  "d200", "d400", "d600", "d800", "d1000",
];

export function useWalkAudio() {
  const [voiceOn, setVoiceOn] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  // iOS AudioContext 잠금 해제 + 사전 로드 시작
  const unlockAudio = useCallback(() => {
    initAudioContext();
    setAudioUnlocked(true);
    // 잠금 해제 후 바로 사전 로드 (비동기, 에러 무시)
    preloadStaticAudio(PRELOAD_PRIORITY).catch(() => {});
  }, []);

  // aria-live 업데이트 (스크린 리더 백업)
  const updateLive = useCallback((text: string) => {
    if (liveRef.current) {
      liveRef.current.textContent = "";
      requestAnimationFrame(() => {
        if (liveRef.current) liveRef.current.textContent = text;
      });
    }
  }, []);

  /**
   * 고정 문구 재생 (static 파일 우선, 없으면 on-demand)
   * @param keyOrText audio-map 키 또는 임의 한국어 텍스트
   */
  const speakByKey = useCallback(async (keyOrText: string) => {
    if (!voiceOn) return;
    updateLive(keyOrText);
    try {
      await playBeep();
      if (AUDIO_URL[keyOrText]) {
        await playStatic(keyOrText);
      } else {
        // 사전 생성 파일 없는 경우 on-demand (첫 번만 API 호출)
        await playDynamic(keyOrText);
      }
    } catch (e) {
      console.warn("[useWalkAudio] playback error:", e);
    }
  }, [voiceOn, updateLive]);

  /**
   * 랜드마크 안내 (세그먼트 조합)
   * custom announcement 가 있으면 on-demand TTS
   */
  const speakLandmark = useCallback(async (
    side: string,
    name: string,
    caution: boolean,
    customAnnouncement?: string | null,
  ) => {
    if (!voiceOn) return;
    const displayText = customAnnouncement ?? `${name} 안내`;
    updateLive(displayText);
    try {
      await playBeep();
      if (customAnnouncement) {
        await playDynamic(customAnnouncement);
      } else {
        await announceLandmark(side, name, caution);
      }
    } catch (e) {
      console.warn("[useWalkAudio] landmark error:", e);
    }
  }, [voiceOn, updateLive]);

  /**
   * 거리 안내 (200m 단위 사전 파일 우선)
   */
  const speakDistance = useCallback(async (meters: number) => {
    if (!voiceOn) return;
    const key = distKey(meters);
    if (key) {
      await speakByKey(key);
    } else {
      // 200m 비배수 → on-demand
      const text = `${meters}미터 지점입니다.`;
      updateLive(text);
      try {
        await playBeep();
        await playDynamic(text);
      } catch { /* ignore */ }
    }
  }, [voiceOn, speakByKey, updateLive]);

  // 기존 코드와의 호환성을 위해 speak() 도 제공
  const speak = useCallback((text: string) => speakByKey(text), [speakByKey]);

  // 배경 사전 로드 (unlockAudio 호출 후 잔여 파일)
  const preload = useCallback((keys: string[]) => {
    preloadStaticAudio(keys).catch(() => {});
  }, []);

  return {
    voiceOn, setVoiceOn,
    audioUnlocked, unlockAudio,
    speak,           // 범용 (key 또는 임의 텍스트)
    speakByKey,      // audio-map 키 전용
    speakLandmark,   // 랜드마크 조합 재생
    speakDistance,   // 거리 안내 (사전 파일)
    preload,
    playBeep,
    stopAudio,
    liveRef,
  };
}
