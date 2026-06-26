import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const attachNamsanSession = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = window.localStorage.getItem("nw_session_token");
  const safeToken = token && /^[a-f0-9]{64}$/i.test(token) ? token : null;
  if (token && !safeToken) window.localStorage.removeItem("nw_session_token");
  return next({ headers: safeToken ? { "x-nw-session": safeToken } : {} });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, attachNamsanSession],
  requestMiddleware: [errorMiddleware],
}));
