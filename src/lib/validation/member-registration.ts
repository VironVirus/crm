import { z } from "zod";

export const KYC_STORAGE_BUCKET = "member-kyc";
export const MAX_KYC_FILE_SIZE = 10 * 1024 * 1024;

export const KYC_FIELD_CONFIG = {
  nationalId: {
    label: "National ID",
    description: "Government-issued ID card, slip, or PDF export.",
    accept: ["image/jpeg", "image/png", "application/pdf"],
  },
  passportPhoto: {
    label: "Passport Photo",
    description: "Recent passport-style image in JPG, PNG, or WebP format.",
    accept: ["image/jpeg", "image/png", "image/webp"],
  },
  utilityBill: {
    label: "Utility Bill",
    description: "Recent utility bill or proof of address document.",
    accept: ["image/jpeg", "image/png", "application/pdf"],
  },
} as const;

export type KycFieldName = keyof typeof KYC_FIELD_CONFIG;

const registrationShape = {
  fullName: z.string().trim().min(3, "Enter your full name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
  phone: z.string().trim().min(7, "Enter a valid phone number."),
  dateOfBirth: z
    .string()
    .min(1, "Enter your date of birth.")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Enter a valid date of birth.",
    })
    .refine((value) => new Date(value) <= new Date(), {
      message: "Date of birth cannot be in the future.",
    }),
  address: z.string().trim().min(10, "Enter your address."),
  occupation: z.string().trim().min(2, "Enter your occupation."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long."),
  confirmPassword: z.string().min(8, "Confirm your password."),
};

const nextOfKinShape = {
  nextOfKinName: z.string().trim().min(3, "Enter your next of kin's name."),
  nextOfKinPhone: z
    .string()
    .trim()
    .min(7, "Enter a valid next of kin phone number."),
  nextOfKinRelationship: z
    .string()
    .trim()
    .min(2, "Enter the relationship to your next of kin."),
};

function validatePasswordConfirmation(
  value: Pick<MemberRegistrationValues, "password" | "confirmPassword">,
  ctx: z.RefinementCtx,
) {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Passwords do not match.",
    });
  }
}

function isFileLike(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export function validateKycFile(
  fieldName: KycFieldName,
  value: unknown,
): string | null {
  const config = KYC_FIELD_CONFIG[fieldName];

  if (!isFileLike(value) || value.size === 0) {
    return `${config.label} is required.`;
  }

  if (!config.accept.some((mimeType) => mimeType === value.type)) {
    return `${config.label} must be a JPG, PNG, WebP, or PDF file as applicable.`;
  }

  if (value.size > MAX_KYC_FILE_SIZE) {
    return `${config.label} must be 10MB or smaller.`;
  }

  return null;
}

function createFileSchema(fieldName: KycFieldName) {
  return z.any().superRefine((value, ctx) => {
    const errorMessage = validateKycFile(fieldName, value);

    if (errorMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
      });
    }
  });
}

export const memberRegistrationSchema = z
  .object(registrationShape)
  .superRefine(validatePasswordConfirmation);

export const memberNextOfKinSchema = z.object(nextOfKinShape);

export const memberKycSchema = z.object({
  nationalId: createFileSchema("nationalId"),
  passportPhoto: createFileSchema("passportPhoto"),
  utilityBill: createFileSchema("utilityBill"),
});

export type MemberRegistrationValues = z.infer<typeof memberRegistrationSchema>;
export type MemberNextOfKinValues = z.infer<typeof memberNextOfKinSchema>;
export type MemberKycValues = {
  nationalId: File | null;
  passportPhoto: File | null;
  utilityBill: File | null;
};

export function sanitizeStorageFilename(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
