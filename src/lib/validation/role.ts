import { z } from "zod";
import { emptyToUndefined } from "./common";
import { PERMISSION_KEYS } from "@/lib/permission-catalog";

const KEY_SET = new Set<string>(PERMISSION_KEYS);

/** Create/edit a role: name + optional description + a set of permission keys
 *  (unknown keys are dropped, so a stale form can't grant a retired capability). */
export const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  description: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(200).optional(),
  ),
  permissions: z
    .array(z.string())
    .default([])
    .transform((keys) => [...new Set(keys.filter((k) => KEY_SET.has(k)))]),
});

export type RoleInput = z.infer<typeof roleSchema>;
