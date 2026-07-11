import { z } from "zod";

/** Create/edit an organization (tenant). `slug` is a url-safe key used for
 *  display + future subdomain routing; it must be globally unique. */
export const organizationSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .max(40)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens.",
    ),
  isActive: z.boolean(),
});

export type OrganizationInput = z.infer<typeof organizationSchema>;
