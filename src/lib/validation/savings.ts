import { z } from "zod";
import { SAVINGS_ACCOUNT_TYPES } from "@/lib/savings";

const optionalTrimmedString = z
  .string()
  .trim()
  .max(240, "Please keep this entry under 240 characters.")
  .transform((value) => value || undefined)
  .optional();

export const savingsTransactionSchema = z.object({
  memberId: z.string().uuid("Select a valid member."),
  accountType: z.enum(SAVINGS_ACCOUNT_TYPES, {
    message: "Choose a savings account type.",
  }),
  transactionType: z.enum(["deposit", "withdrawal"]),
  amount: z.coerce.number().positive("Enter an amount greater than zero."),
  paymentReference: optionalTrimmedString,
  narration: optionalTrimmedString,
});

export type SavingsTransactionInput = z.infer<typeof savingsTransactionSchema>;
