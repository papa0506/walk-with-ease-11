
-- Extend enums & tables for hazards, landmarks, milestones

CREATE TYPE public.hazard_reporter AS ENUM ('ANONYMOUS','USER','ADMIN');
CREATE TYPE public.hazard_verification AS ENUM ('USER_REPORTED','ADMIN_CONFIRMED','CLEARED','EXPIRED');
CREATE TYPE public.side_dir AS ENUM ('LEFT','RIGHT','FRONT','BOTH','ALL','UNKNOWN');
CREATE TYPE public.survey_dir AS ENUM ('THEATER_TO_CABLECAR','CABLECAR_TO_THEATER','UNSPEC');

ALTER TABLE public.hazards
  ADD COLUMN subtype text,
  ADD COLUMN label text,
  ADD COLUMN side public.side_dir NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN accuracy double precision,
  ADD COLUMN reporter_type public.hazard_reporter NOT NULL DEFAULT 'ANONYMOUS',
  ADD COLUMN verification_status public.hazard_verification NOT NULL DEFAULT 'USER_REPORTED',
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN cleared_at timestamptz;

CREATE INDEX hazards_active_expires_idx ON public.hazards (active, expires_at);

ALTER TABLE public.landmarks
  ADD COLUMN side public.side_dir NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN survey_direction public.survey_dir NOT NULL DEFAULT 'UNSPEC',
  ADD COLUMN custom_name text;

ALTER TABLE public.milestones
  ADD COLUMN survey_direction public.survey_dir NOT NULL DEFAULT 'UNSPEC';
