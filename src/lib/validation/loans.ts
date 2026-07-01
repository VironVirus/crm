import { z } from "zod";

export const loanApplicationSchema = z.object({
  loanProductId: z.string().uuid("Select a loan product."),
  amountRequested: z
    .number()
    .finite()
    .positive("Enter a loan amount greater than zero."),
  tenureMonths: z
    .number()
    .int("Tenure must be a whole number of months.")
    .positive("Tenure must be at least 1 month."),
  purpose: z
    .string()
    .trim()
    .min(10, "Provide a little more context for this loan request.")
    .max(500, "Keep the purpose within 500 characters."),
  guarantorMemberIds: z
    .array(z.string().uuid("Choose valid guarantors from the member list."))
    .max(2, "You can add up to 2 guarantors to one application.")
    .default([])
    .refine(
      (value) => new Set(value).size === value.length,
      "Choose different members for each guarantor slot.",
    ),
});

export const loanStatusUpdateSchema = z.object({
  status: z.enum(["submitted", "under_review"]),
});

export const loanRejectionSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(10, "Add a clear reason for the rejection.")
    .max(500, "Keep the rejection reason within 500 characters."),
});

export const loanDisbursementSchema = z.object({
  amount: z.coerce
    .number()
    .finite()
    .positive("Enter the amount being disbursed."),
  narration: z
    .string()
    .trim()
    .min(5, "Add a short narration for this disbursement.")
    .max(200, "Keep the narration within 200 characters."),
  transferReference: z
    .string()
    .trim()
    .min(3, "Enter the Flutterwave transfer reference.")
    .max(120, "Keep the transfer reference within 120 characters."),
});

export const guarantorResponseSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
});

export type LoanApplicationFormValues = z.input<typeof loanApplicationSchema>;
