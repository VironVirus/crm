import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { memberRegistrationSchema } from "@/lib/validation/member-registration";

export const runtime = "nodejs";

type FieldErrors = Record<string, string[]>;

type CreateMemberRegistrationSuccess = {
  email: string;
  fullName: string;
  memberNumber: string;
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

async function assignMemberNumber(memberId: string) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("assign_member_number", {
    target_profile_id: memberId,
  });

  if (error || typeof data !== "string" || data.length === 0) {
    throw new Error("Unable to generate the member number.");
  }

  return data;
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
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    email: String(formData.get("email") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    password: String(formData.get("password") ?? ""),
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
  let createdUserId: string | null = null;

  try {
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: parsedPayload.data.email,
        password: parsedPayload.data.password,
        email_confirm: true,
        user_metadata: {
          full_name: parsedPayload.data.fullName,
          phone: parsedPayload.data.phone,
        },
      });

    if (authError || !authData.user) {
      const emailTaken =
        authError?.message?.toLowerCase().includes("already") ||
        authError?.message?.toLowerCase().includes("exists");

      return jsonError(
        authError?.message || "Unable to create the member auth account.",
        emailTaken ? 409 : 400,
        emailTaken
          ? {
              email: ["An account with this email already exists."],
            }
          : undefined,
      );
    }

    createdUserId = authData.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: createdUserId,
        full_name: parsedPayload.data.fullName,
        email: parsedPayload.data.email,
        phone: parsedPayload.data.phone,
        role: "member",
        status: "active",
      },
      {
        onConflict: "id",
      },
    );

    if (profileError) {
      throw new Error("Unable to save the member profile.");
    }

    const { error: memberError } = await admin.from("members").upsert(
      {
        id: createdUserId,
        address: parsedPayload.data.address,
        date_of_birth: parsedPayload.data.dateOfBirth,
        national_id_path: null,
        next_of_kin_name: null,
        next_of_kin_phone: null,
        next_of_kin_relationship: null,
        occupation: parsedPayload.data.occupation,
        onboarding_status: "pending",
        passport_photo_path: null,
        utility_bill_path: null,
      },
      {
        onConflict: "id",
      },
    );

    if (memberError) {
      throw new Error("Unable to save the member registration record.");
    }

    const memberNumber = await assignMemberNumber(createdUserId);

    const response: CreateMemberRegistrationSuccess = {
      email: parsedPayload.data.email,
      fullName: parsedPayload.data.fullName,
      memberNumber,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId);
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unable to complete member registration right now.";

    return jsonError(message, 500);
  }
}
