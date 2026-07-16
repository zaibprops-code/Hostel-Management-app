import { NextFunction, Request, Response } from "express";
import { ZodTypeAny, z } from "zod";

// Validates and replaces req.body with the parsed result.
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

// Common query helpers.
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function parsePagination(query: unknown): Pagination {
  return paginationSchema.parse(query);
}
