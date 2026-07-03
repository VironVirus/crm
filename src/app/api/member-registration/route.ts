import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { memberRegistrationSchema } from "@/lib/validation/member-registration";

export const runtime = "nodejs";

type FieldErrors = Record<string, string[]>;

type RegistrationPreflightSuccess = {
  email: string;
  status: "ready" | "resume";
};

type ExistingProfileRecord = {
  id: string;
  member_number: string | null;
  role: "admin" | "loan_officer" | "treasurer" | "member";
};

function jsonError(
  message: string,
  status: number,
  fieldErrors?: FieldErrors,
) {
  return NextResponse.json(
    {
      message,
      fieldErrors,
    },
    { status },
  );
}

function extractFieldErrors(error: unknown): FieldErrors | undefined {
  if (
    error &&
    typeof error === "object" &&
    "flatten" in error &&
    typeof error.flatten === "function"
  ) {
    const flattened = error.flatten();

    if (
      flattened &&
      typeof flattened === "object" &&
      "fieldErrors" in flattened &&
      flattened.fieldErrors &&
      typeof flattened.fieldErrors === "object"
    ) {
      return flattened.fieldErrors as FieldErrors;
    }
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError("Unable to read the registration form submission.", 400);
  }

  const parsedPayload = memberRegistrationSchema.safeParse({
    address: String(formData.get("address") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    email: String(formData.get("email") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });

  if (!parsedPayload.success) {
    return jsonError(
      "Please review the highlighted registration fields.",
      400,
      extractFieldErrors(parsedPayload.error),
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: existingProfileError } = await admin
    .from("profiles")
    .select("id, member_number, role")
    .eq("email", parsedPayload.data.email)
    .maybeSingle();

  if (existingProfileError) {
    return jsonError(
      "We could not verify whether this email address is available right now.",
      500,
    );
  }

  const profileRecord = existingProfile as ExistingProfileRecord | null;

  if (profileRecord?.role && profileRecord.role !== "member") {
    return jsonError(
      "This email address is already linked to an existing cooperative account.",
      409,
      {
        email: ["This email address already belongs to an existing account."],
      },
    );
  }

  if (profileRecord?.member_number) {
    return jsonError(
      "This email address is already registered. Please sign in instead.",
      409,
      {
        email: ["This email address already belongs to a registered member."],
      },
    );
  }

  const response: RegistrationPreflightSuccess = {
    email: parsedPayload.data.email,
    status: profileRecord ? "resume" : "ready",
  };

  return NextResponse.json(response, { status: 200 });
}
