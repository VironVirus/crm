import { z } from "zod";
import { COOPERATIVE_ROLES } from "@/lib/auth/roles";
import { LOAN_INTEREST_TYPES } from "@/lib/loans";

export const cooperativeMemberStatusSchema = z.enum([
  "active",
  "inactive",
  "suspended",
]);

export const loanProductManagementSchema = z
  .object({
    name: z.string().trim().min(3, "Enter the loan product name.").max(120),
    description: z.string().trim().max(500).optional().nullable(),
    termsSummary: z.string().trim().max(500).optional().nullable(),
    interestRate: z.coerce
      .number()
      .finite()
      .min(0, "Interest rate cannot be negative."),
    interestType: z.enum(LOAN_INTEREST_TYPES),
    minAmount: z.coerce.number().finite().positive("Enter a valid minimum amount."),
    maxAmount: z.coerce.number().finite().positive("Enter a valid maximum amount."),
    minTenureMonths: z.coerce
      .number()
      .int("Minimum tenure must be a whole number.")
      .positive("Minimum tenure must be at least 1 month."),
    maxTenureMonths: z.coerce
      .number()
      .int("Maximum tenure must be a whole number.")
      .positive("Maximum tenure must be at least 1 month."),
    maxLoanToSavingsRatio: z.coerce
      .number()
      .finite()
      .positive("Enter a valid savings ratio."),
    maximumDisbursableAmount: z.coerce
      .number()
      .finite()
      .positive("Enter a valid disbursable amount.")
      .optional()
      .nullable(),
    processingFeeRate: z.coerce
      .number()
      .finite()
      .min(0, "Processing fee cannot be negative."),
    penaltyRate: z.coerce
      .number()
      .finite()
      .min(0, "Penalty rate cannot be negative."),
    isActive: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.maxAmount < value.minAmount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum amount must be greater than or equal to minimum amount.",
        path: ["maxAmount"],
      });
    }

    if (value.maxTenureMonths < value.minTenureMonths) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Maximum tenure must be greater than or equal to minimum tenure.",
        path: ["maxTenureMonths"],
      });
    }

    if (
      typeof value.maximumDisbursableAmount === "number" &&
      value.maximumDisbursableAmount > value.maxAmount
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Maximum disbursable amount cannot be greater than the maximum product amount.",
        path: ["maximumDisbursableAmount"],
      });
    }
  });

export const adminMemberUpdateSchema = z.object({
  role: z.enum(COOPERATIVE_ROLES),
  status: cooperativeMemberStatusSchema,
  isVerified: z.boolean(),
  verificationNote: z.string().trim().max(500).optional().nullable(),
});

export const adminMeetingSchema = z
  .object({
    title: z.string().trim().min(3, "Enter the meeting title.").max(160),
    agenda: z.string().trim().max(2000).optional().nullable(),
    location: z.string().trim().max(160).optional().nullable(),
    startsAt: z.string().datetime("Choose a valid meeting start time."),
    latenessStartsAt: z
      .string()
      .datetime("Choose a valid lateness start time."),
    attendanceClosesAt: z
      .string()
      .datetime("Choose a valid attendance close time."),
    reminderMessage: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, context) => {
    const startsAt = new Date(value.startsAt);
    const latenessStartsAt = new Date(value.latenessStartsAt);
    const closesAt = new Date(value.attendanceClosesAt);

    if (latenessStartsAt.getTime() < startsAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Lateness cannot start counting before the meeting start time.",
        path: ["latenessStartsAt"],
      });
    }

    if (closesAt.getTime() <= latenessStartsAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Attendance close time must be after the lateness start time.",
        path: ["attendanceClosesAt"],
      });
    }

    if (closesAt.getTime() <= startsAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attendance close time must be after the meeting start time.",
        path: ["attendanceClosesAt"],
      });
    }
  });

export const adminMeetingActionSchema = z.object({
  action: z.enum(["close", "cancel"]),
});

export const adminMeetingAttendanceApprovalSchema = z.object({
  isApproved: z.boolean(),
});

export const shareConfigUpdateSchema = z.object({
  shareValue: z.coerce
    .number()
    .finite()
    .positive("Enter a valid share unit price."),
  minimumShares: z.coerce
    .number()
    .int("Minimum shares must be a whole number.")
    .positive("Minimum shares must be at least 1."),
});
