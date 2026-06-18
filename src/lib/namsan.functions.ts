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
    if (!name) throw new Error(FAIL);
    if (!isValidPin(data.pin)) throw new Error(FAIL);

    const { data: user } = await supabaseAdmin
      .from("app_users").select("*").eq("phone", phone).maybeSingle();
    if (!user) throw new Error(FAIL);
    if (user.name.trim() !== name) throw new Error(FAIL);

    const ok = await verifyPin(data.pin, user.password_hash);
    if (!ok) throw new Error(FAIL);
    if (user.status === "REJECTED") throw new Error("사용이 거부된 계정입니다. 관리자에게 문의하세요.");
    if (user.status === "SUSPENDED") throw new Error("사용이 정지된 계정입니다. 관리자에게 문의하세요.");

    const token = await createSession(user.id);
    setResponseHeader("set-cookie", sessionCookieHeader(token));
    return { user: publicUser(user) };
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
    name: string; type: string; announcement: string; direction_hint: string;
    lat: number; lng: number; accuracy: number;
  }) => i)
  .handler(async ({ data }) => {
    const me = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("landmarks").insert({
      name: data.name, type: data.type, announcement: data.announcement,
      direction_hint: data.direction_hint,
      lat: data.lat, lng: data.lng, accuracy: data.accuracy,
      verified: false, created_by: me.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSaveMilestone = createServerFn({ method: "POST" })
  .inputValidator((i: {
    basis_entrance_code: string; meter: number;
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
  .inputValidator((i: { pickupEntranceCode: string }) => i)
  .handler(async ({ data }) => {
    const me = await requireApproved();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ent } = await supabaseAdmin
      .from("entrances").select("id").eq("code", data.pickupEntranceCode).maybeSingle();
    if (!ent) throw new Error("픽업 입구를 찾을 수 없습니다.");
    const handoff_token =
      Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
        b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabaseAdmin.from("onetouch_handoffs").insert({
      user_id: me.id, pickup_entrance_id: ent.id, handoff_token, status: "CREATED",
    });
    if (error) throw new Error(error.message);
    return { handoff_token };
  });
