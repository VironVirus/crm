import { z } from "zod";
import { PAYMENT_TYPES } from "@/lib/payments";

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use dates in YYYY-MM-DD format.");

export const uuidSchema = z.string().uuid("Invalid record identifier.");

export const applicationIdParamsSchema = z.object({
  applicationId: uuidSchema,
});

export const guarantorRequestIdParamsSchema = z.object({
  guarantorRequestId: uuidSchema,
});

export const adminMemberStatementQuerySchema = z
  .object({
    end_date: isoDateSchema,
    member_id: uuidSchema,
    start_date: isoDateSchema,
  })
  .refine((value) => value.start_date <= value.end_date, {
    message: "The statement start date cannot be after the end date.",
    path: ["start_date"],
  });

export const portalMemberStatementQuerySchema = z
  .object({
    end_date: isoDateSchema,
    start_date: isoDateSchema,
  })
  .refine((value) => value.start_date <= value.end_date, {
    message: "The statement start date cannot be after the end date.",
    path: ["start_date"],
  });

export const flutterwaveWebhookPayloadSchema = z
  .object({
    data: z
      .object({
        id: z.union([z.string(), z.number()]).nullish(),
        meta: z.record(z.string(), z.unknown()).nullish(),
        meta_data: z.record(z.string(), z.unknown()).nullish(),
        metadata: z.record(z.string(), z.unknown()).nullish(),
        tx_ref: z.string().trim().min(1).nullish(),
      })
      .passthrough()
      .nullish(),
    tx_ref: z.string().trim().min(1).nullish(),
  })
  .passthrough();

export const flutterwaveWebhookMetadataSchema = z
  .object({
    expected_amount: z.union([z.string(), z.number()]).nullish(),
    member_id: uuidSchema,
    payment_type: z.enum(PAYMENT_TYPES),
  })
  .passthrough();

export function searchParamsToObject(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}
