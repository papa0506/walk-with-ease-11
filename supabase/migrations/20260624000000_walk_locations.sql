-- walk_locations: 현재 산책 중인 이용자의 실시간 위치 (1인 1행 upsert)
CREATE TABLE IF NOT EXISTS public.walk_locations (
  user_id uuid PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  walk_session_id uuid REFERENCES public.walk_sessions(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.walk_locations TO service_role;
ALTER TABLE public.walk_locations ENABLE ROW LEVEL SECURITY;

-- 5분 이상 지난 위치는 자동 삭제 (선택: 배치 or 클라이언트에서 필터링)
CREATE INDEX IF NOT EXISTS walk_locations_updated_idx ON public.walk_locations (updated_at);
