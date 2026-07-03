import { z } from "zod";

export const internalRedirectPathSchema = z
  .string()
  .trim()
  .optional()
  .default("/portal")
  .transform((value) => value || "/portal")
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "Redirect path must stay within the app.",
  });

export const authEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.");

export const emailOtpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

export const loginOtpRequestSchema = z.object({
  email: authEmailSchema,
});

export const loginOtpVerificationSchema = z.object({
  email: authEmailSchema,
  token: emailOtpCodeSchema,
});

export type LoginOtpRequestValues = z.infer<typeof loginOtpRequestSchema>;
export type LoginOtpVerificationValues = z.infer<
  typeof loginOtpVerificationSchema
>;
