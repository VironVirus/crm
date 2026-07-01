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

export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
