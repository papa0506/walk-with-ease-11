// 화면 꺼짐 방지 (Wake Lock) — 산책·실측 중 GPS가 끊기지 않도록 함
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ("wakeLock" in navigator) {
      return await (
        navigator as unknown as {
          wakeLock: { request: (t: string) => Promise<WakeLockSentinel> };
        }
      ).wakeLock.request("screen");
    }
  } catch {
    /* 지원하지 않는 기기 무시 */
  }
  return null;
}
