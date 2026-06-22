// App-internal server functions for the closed RC.
// Auth uses app-owned phone + 4-digit PIN flow; sessions live in a cookie.
// All server-only modules are loaded inside .handler() to keep the client bundle clean.
import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  setResponseHeader,
} from "@tanstack/react-start/server";

// ---------- AUTH ----------

export const signup = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; phone: string; pin: string; pinConfirm: string }) => {
    if (!input?.name?.trim()) throw new Error("이름을 입력해 주세요.");
    if (input.pin !== input.pinConfirm) throw new Error("PIN이 일치하지 않습니다.");
    return input;
  })
  .handler(async ({ data }) => {
    const { normalizePhone, isValidPin, hashPin, createSession, sessionCookieHeader, publicUser } =
      await import("@/lib/namsan-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const phone = normalizePhone(data.phone);
    if (phone.length < 10) throw new Error("전화번호 형식이 올바르지 않습니다.");
    if (!isValidPin(data.pin)) throw new Error("PIN은 4자리 숫자여야 합니다.");

    const { data: exists } = await supabaseAdmin
      .from("app_users").select("id").eq("phone", phone).maybeSingle();
    if (exists) throw new Error("이미 가입된 전화번호입니다.");

    const password_hash = await hashPin(data.pin);
    const { data: user, error } = await supabaseAdmin
      .from("app_users")
      .insert({ name: data.name.trim(), phone, password_hash })
      .select("*").single();
    if (error || !user) throw new Error(error?.message ?? "가입 실패");

    const token = await createSession(user.id);
    setResponseHeader("set-cookie", sessionCookieHeader(token));
    return { user: publicUser(user) };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; phone: string; pin: string }) => input)
  .handler(async ({ data }) => {
    const {
      normalizePhone, isValidPin, verifyPin, createSession, sessionCookieHeader, publicUser,
    } = await import("@/lib/namsan-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const FAIL = "로그인에 실패했습니다. 이름, 전화번호, 비밀번호를 확인해 주세요.";
    const phone = normalizePhone(data.phone);
    const name = (data.name ?? "").trim();
    if (!name) return { user: null, error: FAIL };
    if (!isValidPin(data.pin)) return { user: null, error: FAIL };

    const { data: user, error } = await supabaseAdmin
      .from("app_users").select("*").eq("phone", phone).maybeSingle();
    if (error || !user) return { user: null, error: FAIL };
    if (user.name.trim() !== name) return { user: null, error: FAIL };

    const ok = await verifyPin(data.pin, user.password_hash);
    if (!ok) return { user: null, error: FAIL };
    if (user.status === "REJECTED") return { user: null, error: "사용이 거부된 계정입니다. 관리자에게 문의하세요." };
    if (user.status === "SUSPENDED") return { user: null, error: "사용이 정지된 계정입니다. 관리자에게 문의하세요." };

    const token = await createSession(user.id);
    setResponseHeader("set-cookie", sessionCookieHeader(token));
    return { user: publicUser(user), error: null };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { getSessionTokenFromCookie, revokeToken, clearSessionCookieHeader } =
    await import("@/lib/namsan-auth.server");
  const token = getSessionTokenFromCookie(getRequestHeader("cookie"));
  await revokeToken(token);
  setResponseHeader("set-cookie", clearSessionCookieHeader());
  return { ok: true };
});

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionTokenFromCookie, userFromToken, publicUser } =
    await import("@/lib/namsan-auth.server");
  const token = getSessionTokenFromCookie(getRequestHeader("cookie"));
  const user = await userFromToken(token);
  return { user: user ? publicUser(user) : null };
});

// ---------- Helper: require user / admin ----------
async function requireUser() {
  const { getSessionTokenFromCookie, userFromToken } = await import(
    "@/lib/namsan-auth.server"
  );
  const token = getSessionTokenFromCookie(getRequestHeader("cookie"));
  const user = await userFromToken(token);
  if (!user) throw new Error("로그인이 필요합니다.");
  return user;
}
async function requireApproved() {
  const u = await requireUser();
  if (u.status !== "APPROVED") throw new Error("관리자 승인이 필요합니다.");
  return u;
}
async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new Error("관리자만 사용할 수 있습니다.");
  return u;
}

// ---------- ADMIN ----------

export const adminListUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { maskPhone } = await import("@/lib/namsan-auth.server");
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,phone,role,status,created_at,approved_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({ ...u, phone: maskPhone(u.phone) }));
});

export const adminSetStatus = createServerFn({ method: "POST" })
  .inputValidator((i: { userId: string; status: "APPROVED" | "REJECTED" | "SUSPENDED" | "PENDING" }) => i)
  .handler(async ({ data }) => {
    const me = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch =
      data.status === "APPROVED"
        ? { status: data.status, approved_at: new Date().toISOString(), approved_by: me.id }
        : { status: data.status };
    const { error } = await supabaseAdmin
      .from("app_users").update(patch).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- FIELD SURVEY ----------

export const adminListEntrances = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("entrances").select("*").order("code");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminRecordEntrance = createServerFn({ method: "POST" })
  .inputValidator((i: { code: string; lat: number; lng: number; accuracy: number }) => i)
  .handler(async ({ data }) => {
    const me = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("entrances").update({
      lat: data.lat, lng: data.lng, accuracy: data.accuracy,
      measured_at: new Date().toISOString(), measured_by: me.id, verified: false,
    }).eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSaveLandmark = createServerFn({ method: "POST" })
  .inputValidator((i: {
    name: string; type: string; custom_name?: string | null;
    announcement: string; direction_hint?: string;
    side: "LEFT"|"RIGHT"|"FRONT"|"BOTH"|"ALL"|"UNKNOWN";
    survey_direction: "THEATER_TO_CABLECAR"|"CABLECAR_TO_THEATER"|"UNSPEC";
    lat: number; lng: number; accuracy: number; route_meter?: number | null;
  }) => i)
  .handler(async ({ data }) => {
    const me = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("landmarks").insert({
      name: data.name, type: data.type, custom_name: data.custom_name ?? null,
      announcement: data.announcement, direction_hint: data.direction_hint ?? null,
      side: data.side, survey_direction: data.survey_direction,
      lat: data.lat, lng: data.lng, accuracy: data.accuracy,
      route_meter: data.route_meter ?? null,
      verified: false, created_by: me.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSaveMilestone = createServerFn({ method: "POST" })
  .inputValidator((i: {
    basis_entrance_code: string; meter: number;
    survey_direction: "THEATER_TO_CABLECAR"|"CABLECAR_TO_THEATER"|"UNSPEC";
    lat: number; lng: number; accuracy: number;
  }) => i)
  .handler(async ({ data }) => {
    const me = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ent } = await supabaseAdmin
      .from("entrances").select("id").eq("code", data.basis_entrance_code).maybeSingle();
    if (!ent) throw new Error("기준 입구를 찾을 수 없습니다.");
    const { error } = await supabaseAdmin.from("milestones").insert({
      basis_entrance: ent.id, meter: data.meter,
      survey_direction: data.survey_direction,
      lat: data.lat, lng: data.lng, accuracy: data.accuracy,
      verification_status: "FIELD_MEASURED", verified: false, measured_by: me.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- WALK ----------

export const startWalk = createServerFn({ method: "POST" })
  .inputValidator((i: { startEntranceCode: string | null }) => i)
  .handler(async ({ data }) => {
    const me = await requireApproved();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let start_entrance_id: string | null = null;
    if (data.startEntranceCode) {
      const { data: ent } = await supabaseAdmin
        .from("entrances").select("id").eq("code", data.startEntranceCode).maybeSingle();
      start_entrance_id = ent?.id ?? null;
    }
    const { data: walk, error } = await supabaseAdmin.from("walk_sessions").insert({
      user_id: me.id, start_entrance_id, direction: "UNSPEC", status: "ACTIVE",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { walkId: walk.id };
  });

export const endWalk = createServerFn({ method: "POST" })
  .inputValidator((i: { walkId: string }) => i)
  .handler(async ({ data }) => {
    const me = await requireApproved();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("walk_sessions").update({
      ended_at: new Date().toISOString(), status: "DONE",
    }).eq("id", data.walkId).eq("user_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ONETOUCH ----------

export const createOnetouchHandoff = createServerFn({ method: "POST" })
  .inputValidator((i: { pickupEntranceCode: string; dropoffEntranceCode?: string | null }) => i)
  .handler(async ({ data }) => {
    const me = await requireApproved();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pickupEnt } = await supabaseAdmin
      .from("entrances").select("id").eq("code", data.pickupEntranceCode).maybeSingle();
    if (!pickupEnt) throw new Error("픽업 입구를 찾을 수 없습니다.");
    let dropoff_entrance_id: string | null = null;
    if (data.dropoffEntranceCode) {
      const { data: dEnt } = await supabaseAdmin
        .from("entrances").select("id").eq("code", data.dropoffEntranceCode).maybeSingle();
      if (!dEnt) throw new Error("도착 입구를 찾을 수 없습니다.");
      dropoff_entrance_id = dEnt.id;
    }
    const handoff_token =
      Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
        b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabaseAdmin.from("onetouch_handoffs").insert({
      user_id: me.id, pickup_entrance_id: pickupEnt.id, dropoff_entrance_id,
      handoff_token, status: "CREATED",
    });
    if (error) throw new Error(error.message);
    return { handoff_token };
  });

// ---------- SETTINGS ----------

export const updateMyShareMode = createServerFn({ method: "POST" })
  .inputValidator((i: { mode: "PRIVATE" | "FRIENDS" | "PUBLIC" }) => {
    if (!["PRIVATE", "FRIENDS", "PUBLIC"].includes(i.mode)) throw new Error("잘못된 공개 범위");
    return i;
  })
  .handler(async ({ data }) => {
    const me = await requireUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ default_share_mode: data.mode })
      .eq("id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- HAZARDS ----------

type HazardType = "CONSTRUCTION" | "VEHICLE" | "OBSTACLE" | "SLIPPERY";
type HazardSubtype = "TEMP" | "LONG" | null;
type Side = "LEFT" | "RIGHT" | "FRONT" | "BOTH" | "ALL" | "UNKNOWN";

const HAZARD_LABELS: Record<HazardType, string> = {
  CONSTRUCTION: "공사 주의",
  VEHICLE: "차량 주의",
  OBSTACLE: "장애물 주의",
  SLIPPERY: "미끄럼 주의",
};

function computeExpiresAt(type: HazardType, subtype: HazardSubtype): string {
  const hours =
    type === "CONSTRUCTION" ? (subtype === "LONG" ? 72 : 24)
    : type === "VEHICLE" ? 2
    : 6;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

export const reportHazard = createServerFn({ method: "POST" })
  .inputValidator((i: {
    type: HazardType; subtype?: HazardSubtype; side: Side;
    description?: string | null;
    lat: number; lng: number; accuracy: number;
    route_meter?: number | null;
  }) => i)
  .handler(async ({ data }) => {
    const { getSessionTokenFromCookie, userFromToken } = await import("@/lib/namsan-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const user = await userFromToken(getSessionTokenFromCookie(getRequestHeader("cookie")));
    const reporter_type = !user ? "ANONYMOUS" : user.role === "ADMIN" ? "ADMIN" : "USER";
    const subtype = data.type === "CONSTRUCTION" ? (data.subtype ?? "TEMP") : null;
    const expires_at = computeExpiresAt(data.type, subtype);
    const label = HAZARD_LABELS[data.type] + (subtype === "LONG" ? " (장기 공사)" : subtype === "TEMP" ? " (일시 공사)" : "");
    const { data: row, error } = await supabaseAdmin.from("hazards").insert({
      type: data.type, subtype, label, side: data.side,
      description: data.description ?? null,
      lat: data.lat, lng: data.lng, accuracy: data.accuracy,
      route_meter: data.route_meter ?? null,
      reporter_type, verification_status: reporter_type === "ADMIN" ? "ADMIN_CONFIRMED" : "USER_REPORTED",
      verified: reporter_type === "ADMIN", active: true, expires_at,
      created_by: user?.id ?? null,
    }).select("id, expires_at").single();
    if (error) throw new Error(error.message);
    return { id: row.id, expires_at: row.expires_at };
  });

export const nearbyHazards = createServerFn({ method: "POST" })
  .inputValidator((i: { lat: number; lng: number; radiusM?: number }) => i)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("hazards")
      .select("id,type,subtype,label,side,description,lat,lng,verified,verification_status,reporter_type,expires_at,created_at")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const R = data.radiusM ?? 100;
    const filtered = (rows ?? []).filter((h) => {
      if (h.lat == null || h.lng == null) return false;
      const d = haversine(data.lat, data.lng, h.lat, h.lng);
      return d <= R;
    });
    return filtered;
  });

export const hazardFeedback = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; vote: "STILL_THERE" | "GONE" }) => i)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.vote === "STILL_THERE") {
      // Extend by 1 hour from now, but never shorten
      const { data: h } = await supabaseAdmin.from("hazards").select("expires_at").eq("id", data.id).maybeSingle();
      const cur = h?.expires_at ? new Date(h.expires_at).getTime() : 0;
      const ext = Date.now() + 3600 * 1000;
      const next = new Date(Math.max(cur, ext)).toISOString();
      await supabaseAdmin.from("hazards").update({ expires_at: next }).eq("id", data.id);
    } else {
      // "없어졌어요" — mark needs review (keep active until admin confirms)
      await supabaseAdmin.from("hazards").update({
        description: "[사용자: 없어졌어요 신고됨]",
      }).eq("id", data.id);
    }
    return { ok: true };
  });

export const adminListHazards = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("hazards")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminUpdateHazard = createServerFn({ method: "POST" })
  .inputValidator((i: {
    id: string;
    action: "CONFIRM" | "CLEAR" | "EXTEND";
    extendHours?: number;
  }) => i)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q;
    if (data.action === "CONFIRM") {
      q = supabaseAdmin.from("hazards").update({
        verification_status: "ADMIN_CONFIRMED" as const,
        verified: true,
      }).eq("id", data.id);
    } else if (data.action === "CLEAR") {
      q = supabaseAdmin.from("hazards").update({
        active: false,
        verification_status: "CLEARED" as const,
        cleared_at: new Date().toISOString(),
      }).eq("id", data.id);
    } else {
      const hours = data.extendHours ?? 6;
      q = supabaseAdmin.from("hazards").update({
        expires_at: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
        active: true,
      }).eq("id", data.id);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
