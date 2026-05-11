import type { Request } from "express";

export function parseId(req: Request): number | null {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
