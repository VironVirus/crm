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

const memberRegistrationBaseShape = {
  fullName: z.string().trim().min(3, "Enter the member's full name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
  phone: z.string().trim().min(7, "Enter a valid phone number."),
  dateOfBirth: z
    .string()
    .min(1, "Enter the member's date of birth.")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Enter a valid date of birth.",
    })
    .refine((value) => new Date(value) <= new Date(), {
      message: "Date of birth cannot be in the future.",
    }),
  address: z.string().trim().min(10, "Enter the member's address."),
  occupation: z.string().trim().min(2, "Enter the member's occupation."),
  nextOfKinName: z
    .string()
    .trim()
    .min(3, "Enter the next of kin's name."),
  nextOfKinPhone: z
    .string()
    .trim()
    .min(7, "Enter a valid next of kin phone number."),
  nextOfKinRelationship: z
    .string()
    .trim()
    .min(2, "Enter the relationship to the next of kin."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long."),
  confirmPassword: z.string().min(8, "Confirm the password."),
};

function validatePasswordConfirmation(
  value: Pick<MemberRegistrationTextValues, "password" | "confirmPassword">,
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

export const memberRegistrationTextSchema = z
  .object(memberRegistrationBaseShape)
  .superRefine(validatePasswordConfirmation);

export const memberRegistrationFormSchema = z
  .object({
    ...memberRegistrationBaseShape,
    nationalId: createFileSchema("nationalId"),
    passportPhoto: createFileSchema("passportPhoto"),
    utilityBill: createFileSchema("utilityBill"),
  })
  .superRefine(validatePasswordConfirmation);

export type MemberRegistrationTextValues = z.infer<
  typeof memberRegistrationTextSchema
>;

export type MemberRegistrationFormValues = MemberRegistrationTextValues & {
  nationalId: File | null;
  passportPhoto: File | null;
  utilityBill: File | null;
};

export const MEMBER_REGISTRATION_STEPS = [
  {
    title: "Personal Info",
    description: "Basic member identity and account access details.",
  },
  {
    title: "Next of Kin",
    description: "Emergency and family contact information.",
  },
  {
    title: "KYC Upload",
    description: "Upload the supporting identity and proof-of-address files.",
  },
  {
    title: "Review & Submit",
    description: "Confirm every detail before the account is created.",
  },
] as const;

export const MEMBER_REGISTRATION_STEP_FIELDS = [
  [
    "fullName",
    "email",
    "phone",
    "dateOfBirth",
    "address",
    "occupation",
    "password",
    "confirmPassword",
  ],
  ["nextOfKinName", "nextOfKinPhone", "nextOfKinRelationship"],
  ["nationalId", "passportPhoto", "utilityBill"],
  [],
] as const;

export function getStepIndexForField(fieldName: string) {
  return MEMBER_REGISTRATION_STEP_FIELDS.findIndex((fields) =>
    (fields as readonly string[]).includes(fieldName),
  );
}

export function sanitizeStorageFilename(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
