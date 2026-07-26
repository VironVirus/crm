import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env/public";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { memberRegistrationSchema } from "@/lib/validation/member-registration";

export const runtime = "nodejs";

type FieldErrors = Record<string, string[]>;

type CompleteMemberRegistrationSuccess = {
  email: string;
  fullName: string;
  memberNumber: string;
};

type ExistingProfileRecord = {
  member_number: string | null;
  role: "admin" | "loan_officer" | "treasurer" | "member";
  status: "active" | "inactive" | "suspended";
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

async function resolveAuthenticatedUser(request: NextRequest) {
  const sessionClient = await createServerSupabaseClient();
  const cookieUserResult = await sessionClient.auth.getUser();

  if (cookieUserResult.data.user) {
    return cookieUserResult.data.user;
  }

  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, accessToken] = authorizationHeader.split(" ");

  if (!scheme || !accessToken || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const tokenClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const tokenUserResult = await tokenClient.auth.getUser(accessToken.trim());

  return tokenUserResult.data.user ?? null;
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the registration details.", 400);
  }

  const parsedPayload = memberRegistrationSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return jsonError(
      "Please review the highlighted registration fields.",
      400,
      extractFieldErrors(parsedPayload.error),
    );
  }

  const user = await resolveAuthenticatedUser(request);

  if (!user?.id || !user.email) {
    return jsonError(
      "Please confirm your email code before completing registration.",
      401,
    );
  }

  if (!user.email_confirmed_at) {
    return jsonError("Confirm your email code before finishing registration.", 403);
  }

  if (user.email.toLowerCase() !== parsedPayload.data.email) {
    return jsonError(
      "The verified email does not match the registration details you submitted.",
      403,
      {
        email: ["Use the same email address you verified to continue."],
      },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: existingProfileError } = await admin
    .from("profiles")
    .select("member_number, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return jsonError("Your member profile could not be loaded right now.", 500);
  }

  const profileRecord = existingProfile as ExistingProfileRecord | null;

  try {
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: user.id,
        full_name: parsedPayload.data.fullName,
        email: parsedPayload.data.email,
        phone: parsedPayload.data.phone,
        role: profileRecord?.role ?? "member",
        status: profileRecord?.status ?? "active",
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
        id: user.id,
        address: parsedPayload.data.address,
        date_of_birth: parsedPayload.data.dateOfBirth,
        occupation: parsedPayload.data.occupation,
        onboarding_status: "registered",
      },
      {
        onConflict: "id",
      },
    );

    if (memberError) {
      throw new Error("Unable to save the member registration record.");
    }

    const memberNumber =
      profileRecord?.member_number ?? (await assignMemberNumber(user.id));

    revalidatePath("/portal");
    revalidatePath("/portal/profile");
    revalidatePath("/admin/members");

    const response: CompleteMemberRegistrationSuccess = {
      email: parsedPayload.data.email,
      fullName: parsedPayload.data.fullName,
      memberNumber,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to complete member registration right now.";

    return jsonError(message, 500);
  }
}
