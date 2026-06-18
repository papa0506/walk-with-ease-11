
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('USER','ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('PENDING','APPROVED','REJECTED','SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.share_mode AS ENUM ('PRIVATE','FRIENDS','PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.walk_status AS ENUM ('ACTIVE','DONE','ABORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.walk_direction AS ENUM ('CW','CCW','UNSPEC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.milestone_verification AS ENUM ('NONE','FIELD_MEASURED','VERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.handoff_status AS ENUM ('CREATED','SENT','DONE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- app_users
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role public.user_role NOT NULL DEFAULT 'USER',
  status public.user_status NOT NULL DEFAULT 'PENDING',
  default_share_mode public.share_mode NOT NULL DEFAULT 'PRIVATE',
  public_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.app_users(id)
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- app_sessions
CREATE TABLE public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT ALL ON public.app_sessions TO service_role;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

-- entrances
CREATE TABLE public.entrances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  lat double precision,
  lng double precision,
  accuracy double precision,
  verified boolean NOT NULL DEFAULT false,
  measured_at timestamptz,
  measured_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.entrances TO service_role;
ALTER TABLE public.entrances ENABLE ROW LEVEL SECURITY;

-- landmarks
CREATE TABLE public.landmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text,
  announcement text,
  direction_hint text,
  lat double precision,
  lng double precision,
  accuracy double precision,
  route_meter double precision,
  verified boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.landmarks TO service_role;
ALTER TABLE public.landmarks ENABLE ROW LEVEL SECURITY;

-- milestones
CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basis_entrance uuid NOT NULL REFERENCES public.entrances(id) ON DELETE CASCADE,
  meter integer NOT NULL,
  lat double precision,
  lng double precision,
  accuracy double precision,
  verification_status public.milestone_verification NOT NULL DEFAULT 'FIELD_MEASURED',
  verified boolean NOT NULL DEFAULT false,
  measured_by uuid REFERENCES public.app_users(id),
  measured_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- walk_sessions
CREATE TABLE public.walk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_entrance_id uuid REFERENCES public.entrances(id),
  direction public.walk_direction NOT NULL DEFAULT 'UNSPEC',
  status public.walk_status NOT NULL DEFAULT 'ACTIVE'
);
GRANT ALL ON public.walk_sessions TO service_role;
ALTER TABLE public.walk_sessions ENABLE ROW LEVEL SECURITY;

-- hazards
CREATE TABLE public.hazards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  description text,
  lat double precision,
  lng double precision,
  route_meter double precision,
  verified boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hazards TO service_role;
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;

-- onetouch_handoffs
CREATE TABLE public.onetouch_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  pickup_entrance_id uuid REFERENCES public.entrances(id),
  return_url text,
  handoff_token text NOT NULL UNIQUE,
  status public.handoff_status NOT NULL DEFAULT 'CREATED',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.onetouch_handoffs TO service_role;
ALTER TABLE public.onetouch_handoffs ENABLE ROW LEVEL SECURITY;

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_app_users_updated BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_entrances_updated BEFORE UPDATE ON public.entrances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed entrances
INSERT INTO public.entrances (code, name, description) VALUES
  ('NTH_THEATER', '국립극장 입구', '북측순환로 동쪽 시작점'),
  ('NTH_CABLECAR', '북측순환로 입구, 남산케이블카 방면', '북측순환로 서쪽 시작점')
ON CONFLICT (code) DO NOTHING;

-- Seed admin: 조재형 / 01039279900 / PIN 3752
INSERT INTO public.app_users (name, phone, password_hash, role, status, approved_at)
VALUES (
  '조재형',
  '01039279900',
  crypt('3752', gen_salt('bf', 10)),
  'ADMIN',
  'APPROVED',
  now()
)
ON CONFLICT (phone) DO NOTHING;
