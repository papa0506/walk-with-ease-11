import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/namsan.functions";

export type Me = {
  id: string;
  name: string;
  phone_masked: string;
  role: "USER" | "ADMIN";
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  created_at: string;
  approved_at: string | null;
  default_share_mode: "PRIVATE" | "FRIENDS" | "PUBLIC";
} | null;

export function useMe() {
  const fn = useServerFn(getMe);
  const q = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await fn()).user as Me,
    staleTime: 30_000,
  });
  return q;
}

export function useInvalidateMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["me"] });
}
