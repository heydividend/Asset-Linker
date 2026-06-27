import { useQuery } from "@tanstack/react-query";

// Shape returned by GET /api/games/questions (a read-only sampler used by the
// question-driven games; the endpoint isn't in the OpenAPI spec, so we type it
// locally and fetch it directly — same pattern the dashboard uses for
// /api/plan/schedule).
export interface GameQuestion {
  id: number;
  stem: string;
  choices: string[];
  correctIndex: number;
  correctIndices: number[] | null;
  multiSelect: boolean;
  rationale: string;
  domain: string | null;
}

export function useGameQuestions(opts: { domain?: string; limit?: number; single?: boolean; mode?: string; seed?: number }) {
  const params = new URLSearchParams();
  if (opts.domain) params.set("domain", opts.domain);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.single) params.set("single", "1");
  if (opts.mode) params.set("mode", opts.mode);
  return useQuery<GameQuestion[]>({
    queryKey: ["game-questions", opts.domain ?? "", opts.limit ?? 0, !!opts.single, opts.mode ?? "", opts.seed ?? 0],
    queryFn: () => fetch(`/api/games/questions?${params.toString()}`).then((r) => r.json()),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
