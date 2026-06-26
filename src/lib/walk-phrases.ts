/**
 * walk-phrases.ts
 * 산책 중 반복 사용되는 고정 문구 목록.
 * 앱 시작 시 /api/tts 를 통해 미리 가져와 브라우저에 캐시합니다.
 * (Cache-Control: immutable 로 두 번째부터는 즉시 재생)
 */

// 200m 단위 거리 안내 — 북측순환로 3.5km
export const DISTANCE_PHRASES: string[] = Array.from({ length: 17 }, (_, i) => {
  const cur  = (i + 1) * 200;
  const next = cur + 200;
  return cur <= 3400
    ? `${cur}미터 지점입니다. 다음 안내는 ${next}미터입니다.`
    : `${cur}미터 지점입니다.`;
});

// 입구 관련 고정 문구
export const ENTRANCE_PHRASES: string[] = [
  "국립극장 입구에서 출발합니다. 케이블카 방면 입구 방향으로 안내합니다.",
  "케이블카 방면 입구에서 출발합니다. 국립극장 입구 방향으로 안내합니다.",
  "이곳은 국립극장 입구입니다. 이 지점에서 산책을 시작하려면 산책 시작 버튼을 누르세요.",
  "이곳은 케이블카 방면 입구입니다. 이 지점에서 산책을 시작하려면 산책 시작 버튼을 누르세요.",
];

// 방향 전환 안내
export const DIRECTION_PHRASES: string[] = [
  "국립극장 입구 방향으로 돌아가고 있습니다.",
  "케이블카 방면 입구 방향으로 다시 진행합니다.",
];

// 시스템 / 시작
export const SYSTEM_PHRASES: string[] = [
  "산책을 시작합니다. 음성 안내가 시작됩니다.",
  "음성 안내를 종료합니다.",
];

// 자주 쓰는 랜드마크 방향 표현
export const LANDMARK_SIDE_PHRASES: string[] = [
  "진행 방향 우측에",
  "진행 방향 좌측에",
  "정면에",
  "양쪽에",
  "근처에",
];

// 전체 사전 로딩 대상 (고정 문구만 — 동적 문구는 on-demand 캐시)
export const ALL_PRELOAD_PHRASES: string[] = [
  ...DISTANCE_PHRASES,
  ...ENTRANCE_PHRASES,
  ...DIRECTION_PHRASES,
  ...SYSTEM_PHRASES,
];
