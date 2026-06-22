/**
 * §B1 contacts live under one of three parent kinds. Kept in a plain module
 * (NOT the `"use server"` actions file) because a `"use server"` module may only
 * export async functions — exporting this runtime array from there throws
 * "A 'use server' file can only export async functions, found object" and takes
 * down every page that pulls the contacts module into its graph (e.g. Settings).
 */
export const CONTACT_KINDS = ["client", "vendor", "source"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
