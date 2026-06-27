import { useQuery } from "@tanstack/react-query";

export type Me = {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
};

// Identity of the signed-in user, including whether they are an admin. Cached
// for a few minutes — role rarely changes within a session.
export function useMe() {
  return useQuery<Me>({
    queryKey: ["/api/me"],
    queryFn: () =>
      fetch("/api/me", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load identity");
        return r.json();
      }),
    staleTime: 5 * 60 * 1000,
  });
}
