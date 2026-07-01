import { z } from "zod";
import { PAYMENT_TYPES } from "@/lib/payments";
import { SAVINGS_ACCOUNT_TYPES } from "@/lib/savings";

const optionalTrimmedString = z
  .string()
  .trim()
  .max(240, "Please keep this entry under 240 characters.")
  .transform((value) => value || undefined)
  .optional();

const paymentAmountSchema = z.coerce
  .number()
  .finite()
  .positive("Enter an amount greater than zero.");

export const initiatePaymentSchema = z.discriminatedUnion("payment_type", [
  z.object({
    member_id: z.string().uuid("Choose a valid member."),
    payment_type: z.literal("savings_deposit"),
    amount: paymentAmountSchema,
    metadata: z.object({
      account_type: z.enum(SAVINGS_ACCOUNT_TYPES, {
        message: "Choose a savings account type.",
      }),
      narration: optionalTrimmedString,
      payment_reference: optionalTrimmedString,
    }),
  }),
  z.object({
    member_id: z.string().uuid("Choose a valid member."),
    payment_type: z.literal("loan_repayment"),
    amount: paymentAmountSchema,
    metadata: z.object({
      loan_id: z.string().uuid("Choose the loan you want to repay."),
      narration: optionalTrimmedString,
      payment_reference: optionalTrimmedString,
    }),
  }),
  z.object({
    member_id: z.string().uuid("Choose a valid member."),
    payment_type: z.literal("share_purchase"),
    amount: paymentAmountSchema,
    metadata: z.object({
      notes: optionalTrimmedString,
      payment_reference: optionalTrimmedString,
    }),
  }),
]);

export const memberPaymentFormSchema = z
  .object({
    paymentType: z.enum(PAYMENT_TYPES, {
      message: "Choose the type of payment you want to make.",
    }),
    amount: paymentAmountSchema,
    accountType: z.enum(SAVINGS_ACCOUNT_TYPES).optional(),
    loanId: z.string().uuid("Choose a valid active loan.").optional(),
    note: optionalTrimmedString,
  })
  .superRefine((value, context) => {
    if (value.paymentType === "savings_deposit" && !value.accountType) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose the savings account you want this deposit to fund.",
        path: ["accountType"],
      });
    }

    if (value.paymentType === "loan_repayment" && !value.loanId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose the active loan you want to repay.",
        path: ["loanId"],
      });
    }
  });

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type MemberPaymentFormValues = z.input<typeof memberPaymentFormSchema>;
