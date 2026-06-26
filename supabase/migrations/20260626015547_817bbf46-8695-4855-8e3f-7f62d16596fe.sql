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
CREATE INDEX IF NOT EXISTS walk_locations_updated_idx ON public.walk_locations (updated_at);