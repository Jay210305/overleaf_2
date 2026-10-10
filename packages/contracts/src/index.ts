import { z } from "zod";
export const healthSchema = z.strictObject({
  status: z.enum(["live", "ready"]),
  requestId: z.string().min(1).max(10000),
});
export type HealthView = z.infer<typeof healthSchema>;
export const problemSchema = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
  requestId: z.string(),
});
