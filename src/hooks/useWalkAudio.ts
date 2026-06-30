import { useRef, useState, useCallback } from "react";
import {
  initAudioContext, stopAudio, playBeep,
  playStatic, playDynamic, announceLandmark, preloadStaticAudio, enqueue,
} from "../lib/walk-audio-player";
import { AUDIO_URL, AUDIO_TEXT, sideKey, distKey } from "../lib/audio-map";

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
  const voiceOn = true; // 시각장애인 앱 기본값: 항상 켜짐
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  const unlockAudio = useCallback(() => {
    initAudioContext();
    setAudioUnlocked(true);
    preloadStaticAudio(PRELOAD_PRIORITY).catch(() => {});
  }, []);

  const updateLive = useCallback((text: string) => {
    if (!liveRef.current) return;
    liveRef.current.textContent = "";
    requestAnimationFrame(() => {
      if (liveRef.current) liveRef.current.textContent = text;
      // 5초 후 지움 → VoiceOver가 이전 안내를 계속 읽지 않도록
      setTimeout(() => { if (liveRef.current) liveRef.current.textContent = ""; }, 5000);
    });
  }, []);

  /** 고정 key 또는 임의 텍스트 재생. 정적 실패 시 on-demand fallback */
  const speakByKey = useCallback((keyOrText: string) => {
    if (!voiceOn) return;
    updateLive(AUDIO_TEXT[keyOrText] ?? keyOrText);
    enqueue(async () => {
      try {
        await playBeep();
        if (AUDIO_URL[keyOrText]) {
          await playStatic(keyOrText); // 내부에서 fallback 처리
        } else {
          await playDynamic(keyOrText);
        }
      } catch (e) {
        console.warn("[useWalkAudio] speakByKey error:", e);
      }
    });
  }, [voiceOn, updateLive]);

  const speak = useCallback((text: string) => speakByKey(text), [speakByKey]);

  /** 랜드마크 안내: side + name(on-demand) + 동사 세그먼트 조합 */
  const speakLandmark = useCallback((
    side: string,
    name: string,
    caution: boolean,
    customAnnouncement?: string | null,
  ) => {
    if (!voiceOn) return;
    updateLive(customAnnouncement ?? `${name} 안내`);
    enqueue(async () => {
      try {
        await playBeep();
        if (customAnnouncement) {
          await playDynamic(customAnnouncement);
        } else {
          await announceLandmark(side, name, caution);
        }
      } catch (e) {
        console.warn("[useWalkAudio] speakLandmark error:", e);
      }
    });
  }, [voiceOn, updateLive]);

  /** 거리 안내 (200m 배수 → 정적 파일, 그 외 → on-demand) */
  const speakDistance = useCallback((meters: number) => {
    if (!voiceOn) return;
    const key = distKey(meters);
    if (key) {
      speakByKey(key);
    } else {
      const text = `${meters}미터 지점입니다.`;
      updateLive(text);
      enqueue(async () => {
        try { await playBeep(); await playDynamic(text); } catch { /* 무시 */ }
      });
    }
  }, [voiceOn, speakByKey, updateLive]);

  const preload = useCallback((keys: string[]) => {
    preloadStaticAudio(keys).catch(() => {});
  }, []);

  return {
    voiceOn,
    audioUnlocked, unlockAudio,
    speak, speakByKey, speakLandmark, speakDistance,
    preload, playBeep, stopAudio, liveRef,
  };
}
