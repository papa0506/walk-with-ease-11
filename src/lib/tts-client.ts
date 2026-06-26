// 클라이언트에서 /api/tts를 호출해 MP3를 재생합니다.
// 같은 문구의 URL은 동일하므로 브라우저 HTTP 캐시(immutable)에 의해
// 두 번째부터는 네트워크 요청 없이 즉시 재생됩니다.

export function ttsUrl(text: string, voice?: string): string {
  const params = new URLSearchParams({ text });
  if (voice) params.set("voice", voice);
  return `/api/tts?${params.toString()}`;
}

// 동시 재생 방지를 위한 단일 Audio 인스턴스
let currentAudio: HTMLAudioElement | null = null;

export function stopTts() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch { /* noop */ }
    currentAudio = null;
  }
}

export function playTts(text: string, voice?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stopTts();
    const audio = new Audio(ttsUrl(text, voice));
    audio.preload = "auto";
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      reject(new Error("TTS audio playback failed"));
    };
    audio.play().catch(reject);
  });
}
