/**
 * useGpsAverage
 *
 * 여러 GPS 샘플을 수집하여 정확도 가중평균으로 최적 좌표를 계산합니다.
 * weight = 1 / acc²  (정확도가 좋을수록 더 높은 가중치)
 *
 * 용도: 위험 신고, 현장 측량 등 단일 지점을 정확히 기록할 때 사용.
 * 산책 중 연속 추적은 walk.index.tsx의 EMA 방식을 사용.
 */

import { useCallback, useRef, useState } from "react";

export type GpsAvgResult = {
  lat: number;
  lng: number;
  accuracy: number;       // 추정 오차(m)
  sampleCount: number;
  confidence: "poor" | "fair" | "good" | "excellent";
};

type Reading = { lat: number; lng: number; acc: number; ts: number };

const REJECT_ABOVE_M = 50;   // 50m 초과 오차는 버림
const WINDOW_MS = 40_000;    // 최근 40초 샘플만 사용

function confidenceLabel(acc: number): GpsAvgResult["confidence"] {
  if (acc < 5)  return "excellent";
  if (acc < 10) return "good";
  if (acc < 20) return "fair";
  return "poor";
}

function compute(buf: Reading[]): GpsAvgResult | null {
  const good = buf.filter(r => r.acc <= REJECT_ABOVE_M);
  if (good.length === 0) return null;

  // 정확도 역제곱 가중합
  let wSum = 0, latSum = 0, lngSum = 0;
  for (const r of good) {
    const w = 1 / (r.acc * r.acc);
    wSum   += w;
    latSum += r.lat * w;
    lngSum += r.lng * w;
  }

  const lat = latSum / wSum;
  const lng = lngSum / wSum;

  // 추정 오차: 가중 표준편차 + 분산에 루트 (단순화)
  let varLat = 0, varLng = 0;
  for (const r of good) {
    const w = 1 / (r.acc * r.acc);
    varLat += w * (r.lat - lat) ** 2;
    varLng += w * (r.lng - lng) ** 2;
  }
  const spreadM = Math.sqrt((varLat + varLng) / wSum) * 111_000; // 도→미터 근사
  const estimatedAcc = Math.max(
    Math.sqrt(1 / wSum) * 111_000,
    spreadM
  );

  return {
    lat, lng,
    accuracy: Math.round(estimatedAcc * 10) / 10,
    sampleCount: good.length,
    confidence: confidenceLabel(estimatedAcc),
  };
}

export function useGpsAverage(targetSamples = 10) {
  const [status, setStatus]     = useState<"idle" | "collecting" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);   // 현재까지 수집한 좋은 샘플 수
  const [result, setResult]     = useState<GpsAvgResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const watchId  = useRef<number | null>(null);
  const buf      = useRef<Reading[]>([]);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setErrorMsg("이 기기에서 GPS를 사용할 수 없습니다.");
      return;
    }
    stop();
    buf.current = [];
    setStatus("collecting");
    setProgress(0);
    setResult(null);
    setErrorMsg(null);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const r: Reading = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
          ts:  Date.now(),
        };

        // 윈도우 밖 샘플 제거 후 추가
        const cutoff = Date.now() - WINDOW_MS;
        buf.current = buf.current
          .filter(x => x.ts > cutoff)
          .concat(r)
          .slice(-30); // 최대 30개 유지

        const goodCount = buf.current.filter(x => x.acc <= REJECT_ABOVE_M).length;
        setProgress(goodCount);

        // 충분히 모이면 완료
        if (goodCount >= targetSamples) {
          const avg = compute(buf.current);
          if (avg) {
            setResult(avg);
            setStatus("done");
            stop();
          }
        }
      },
      (err) => {
        setStatus("error");
        setErrorMsg(
          err.code === 1 ? "GPS 권한이 거부됐습니다."
          : err.code === 2 ? "GPS 신호를 받을 수 없습니다."
          : "GPS 시간 초과"
        );
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 20_000 }
    );
  }, [stop, targetSamples]);

  /** 수집 중 현재까지의 중간 결과 (미리보기용) */
  const partialResult = useCallback((): GpsAvgResult | null => {
    return compute(buf.current);
  }, []);

  return {
    status,
    progress,
    targetSamples,
    result,
    errorMsg,
    start,
    stop,
    partialResult,
  };
}
