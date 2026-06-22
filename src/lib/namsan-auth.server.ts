// Server-only helpers for the app-owned auth flow (name + phone + 4-digit PIN).
// Never import from a route, component, or *.functions.ts top-level — only via dynamic import.
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export type AppUser = Database["public"]["Tables"]["app_users"]["Row"];

export const SESSION_COOKIE = "nw_session";
const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 86400;

export function normalizePhone(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin ?? "");
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pin, hash);
  } catch {
    return false;
  }
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const token_hash = await sha256(token);
  const expires_at = new Date(
    Date.now() + SESSION_TTL_DAYS * 86400 * 1000,
  ).toISOString();
  const { error } = await supabaseAdmin
    .from("app_sessions")
    .insert({ user_id: userId, token_hash, expires_at });
  if (error) throw new Error(error.message);
  return token;
}

export function sessionCookieHeader(token: string): string {
  const maxAge = SESSION_TTL_DAYS * 86400;
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export function getSessionTokenFromCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const [k, v] = part.split("=");
    if (k === SESSION_COOKIE && v) return v;
  }
  return null;
}

export async function userFromToken(token: string | null): Promise<AppUser | null> {
  if (!token) return null;
  const token_hash = await sha256(token);
  const { data: session } = await supabaseAdmin
    .from("app_sessions")
    .select("user_id, expires_at, revoked_at")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  const { data: user } = await supabaseAdmin
    .from("app_users")
    .select("*")
    .eq("id", session.user_id)
    .maybeSingle();
  return user ?? null;
}

export async function revokeToken(token: string | null): Promise<void> {
  if (!token) return;
  const token_hash = await sha256(token);
  await supabaseAdmin
    .from("app_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", token_hash);
}

export function maskPhone(phone: string): string {
  const p = normalizePhone(phone);
  if (p.length < 7) return p.replace(/\d/g, "•");
  return `${p.slice(0, 3)}-****-${p.slice(-4)}`;
}

export function publicUser(u: AppUser) {
  const shareMode = (u as { default_share_mode?: string }).default_share_mode;
  return {
    id: u.id,
    name: u.name,
    phone_masked: maskPhone(u.phone),
    role: u.role,
    status: u.status,
    created_at: u.created_at,
    approved_at: u.approved_at,
    default_share_mode: shareMode === "FRIENDS" || shareMode === "PUBLIC" ? shareMode : "PRIVATE",
  };
}
