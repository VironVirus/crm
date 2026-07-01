import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .max(240, "Please keep this entry under 240 characters.")
  .transform((value) => value || undefined)
  .optional();

export const sharePurchaseSchema = z.object({
  memberId: z.string().uuid("Select a valid member."),
  sharesCount: z.coerce
    .number()
    .int("Share units must be a whole number.")
    .positive("Enter at least 1 share unit."),
  paymentReference: optionalTrimmedString,
  notes: optionalTrimmedString,
});

export const shareTransferSchema = z
  .object({
    fromMemberId: z.string().uuid("Select a valid sender."),
    toMemberId: z.string().uuid("Select a valid recipient."),
    sharesCount: z.coerce
      .number()
      .int("Share units must be a whole number.")
      .positive("Enter at least 1 share unit."),
    paymentReference: optionalTrimmedString,
    notes: optionalTrimmedString,
  })
  .refine((value) => value.fromMemberId !== value.toMemberId, {
    message: "Shares can only be transferred between different members.",
    path: ["toMemberId"],
  });

export const dividendDeclarationSchema = z.object({
  financialYear: z
    .string()
    .trim()
    .min(4, "Enter the financial year.")
    .max(30, "Keep the financial year under 30 characters."),
  totalProfit: z.coerce
    .number()
    .positive("Enter a total profit greater than zero."),
});

export type SharePurchaseInput = z.infer<typeof sharePurchaseSchema>;
export type ShareTransferInput = z.infer<typeof shareTransferSchema>;
export type DividendDeclarationInput = z.infer<
  typeof dividendDeclarationSchema
>;
