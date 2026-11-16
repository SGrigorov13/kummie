import { z } from "zod";

export const Health = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["ok", "error", "not_configured"]),
  uptimeSeconds: z.number().int().nonnegative(),
  time: z.string(),
});
export type Health = z.infer<typeof Health>;
