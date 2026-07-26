import { z } from "zod";
import { COOPERATIVE_ROLES } from "@/lib/auth/roles";
import { CHARGE_STATUSES } from "@/lib/cooperative-finance";
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
    lateFee: z.coerce.number().finite().min(0, "Late fee cannot be negative."),
    absenceFee: z.coerce
      .number()
      .finite()
      .min(0, "Absence fee cannot be negative."),
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

const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Choose a valid date.",
  )
  .optional()
  .nullable();

export const adminInvestmentPlanSchema = z
  .object({
    name: z.string().trim().min(3, "Enter the investment plan name.").max(160),
    description: z.string().trim().max(1000).optional().nullable(),
    projectedReturnRate: z.coerce
      .number()
      .finite()
      .min(0, "Projected return cannot be negative.")
      .optional()
      .nullable(),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .superRefine((value, context) => {
    if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The end date cannot be before the start date.",
        path: ["endsOn"],
      });
    }
  });

export const adminMemberInvestmentSchema = z.object({
  memberId: z.string().uuid("Choose a valid member."),
  planId: z.string().uuid("Choose a valid investment plan."),
  amount: z.coerce.number().finite().positive("Enter a valid invested amount."),
  investedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid investment date."),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const adminOccasionLevySchema = z
  .object({
    title: z.string().trim().min(3, "Enter the occasion title.").max(160),
    description: z.string().trim().max(1000).optional().nullable(),
    amount: z.coerce.number().finite().positive("Enter a valid levy amount."),
    dueAt: z.string().datetime("Choose a valid due date and time.").optional().nullable(),
    targetScope: z.enum(["all_members", "single_member"]),
    targetMemberId: z.string().uuid("Choose a valid member.").optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.targetScope === "single_member" && !value.targetMemberId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose the member receiving this levy.",
        path: ["targetMemberId"],
      });
    }
  });

export const adminChargeStatusSchema = z.object({
  chargeId: z.string().uuid("Choose a valid charge."),
  status: z.enum(CHARGE_STATUSES),
});

export const adminCooperativeFinanceActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({
      action: z.literal("create_investment_plan"),
      data: adminInvestmentPlanSchema,
    }),
    z.object({
      action: z.literal("record_member_investment"),
      data: adminMemberInvestmentSchema,
    }),
    z.object({
      action: z.literal("create_occasion_levy"),
      data: adminOccasionLevySchema,
    }),
    z.object({
      action: z.literal("update_charge_status"),
      data: adminChargeStatusSchema,
    }),
    z.object({
      action: z.literal("generate_monthly_dues"),
    }),
  ],
);
