import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  KYC_FIELD_CONFIG,
  KYC_STORAGE_BUCKET,
  type KycFieldName,
  memberRegistrationTextSchema,
  sanitizeStorageFilename,
  validateKycFile,
} from "@/lib/validation/member-registration";

export const runtime = "nodejs";

type FieldErrors = Record<string, string[]>;

type CreateMemberRegistrationSuccess = {
  email: string;
  fullName: string;
  memberNumber: string;
};

const KYC_FIELD_NAMES = Object.keys(KYC_FIELD_CONFIG) as KycFieldName[];

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

async function uploadKycDocument(
  memberId: string,
  fieldName: KycFieldName,
  file: File,
) {
  const admin = createSupabaseAdminClient();
  const timestamp = Date.now();
  const filename = sanitizeStorageFilename(file.name || `${fieldName}-${timestamp}`);
  const objectPath = `${memberId}/${fieldName}/${timestamp}-${filename}`;

  const { error } = await admin.storage
    .from(KYC_STORAGE_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Unable to upload ${KYC_FIELD_CONFIG[fieldName].label}.`);
  }

  return objectPath;
}

async function removeUploadedFiles(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const admin = createSupabaseAdminClient();
  await admin.storage.from(KYC_STORAGE_BUCKET).remove(paths);
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

  const textPayload = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    address: String(formData.get("address") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    nextOfKinName: String(formData.get("nextOfKinName") ?? ""),
    nextOfKinPhone: String(formData.get("nextOfKinPhone") ?? ""),
    nextOfKinRelationship: String(formData.get("nextOfKinRelationship") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsedTextPayload = memberRegistrationTextSchema.safeParse(textPayload);

  if (!parsedTextPayload.success) {
    return jsonError(
      "Please review the highlighted registration fields.",
      400,
      extractFieldErrors(parsedTextPayload.error),
    );
  }

  const kycFiles = KYC_FIELD_NAMES.reduce(
    (accumulator, fieldName) => {
      accumulator[fieldName] = formData.get(fieldName);
      return accumulator;
    },
    {} as Record<KycFieldName, FormDataEntryValue | null>,
  );

  const fileErrors: FieldErrors = {};

  KYC_FIELD_NAMES.forEach((fieldName) => {
    const errorMessage = validateKycFile(fieldName, kycFiles[fieldName]);

    if (errorMessage) {
      fileErrors[fieldName] = [errorMessage];
    }
  });

  if (Object.keys(fileErrors).length > 0) {
    return jsonError(
      "Please upload each required KYC document before submitting.",
      400,
      fileErrors,
    );
  }

  const admin = createSupabaseAdminClient();
  const uploadedPaths: string[] = [];
  let createdUserId: string | null = null;

  try {
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: parsedTextPayload.data.email,
        password: parsedTextPayload.data.password,
        email_confirm: true,
        user_metadata: {
          full_name: parsedTextPayload.data.fullName,
          phone: parsedTextPayload.data.phone,
        },
      });

    if (authError || !authData.user) {
      const emailTaken =
        authError?.message?.toLowerCase().includes("already") ||
        authError?.message?.toLowerCase().includes("exists");

      return jsonError(
        authError?.message || "Unable to create the member's auth account.",
        emailTaken ? 409 : 400,
        emailTaken
          ? {
              email: ["An account with this email already exists."],
            }
          : undefined,
      );
    }

    createdUserId = authData.user.id;

    const uploadedDocumentPaths = {} as Record<KycFieldName, string>;

    for (const fieldName of KYC_FIELD_NAMES) {
      const path = await uploadKycDocument(
        createdUserId,
        fieldName,
        kycFiles[fieldName] as File,
      );

      uploadedDocumentPaths[fieldName] = path;
      uploadedPaths.push(path);
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: createdUserId,
        full_name: parsedTextPayload.data.fullName,
        email: parsedTextPayload.data.email,
        phone: parsedTextPayload.data.phone,
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
        date_of_birth: parsedTextPayload.data.dateOfBirth,
        address: parsedTextPayload.data.address,
        occupation: parsedTextPayload.data.occupation,
        next_of_kin_name: parsedTextPayload.data.nextOfKinName,
        next_of_kin_phone: parsedTextPayload.data.nextOfKinPhone,
        next_of_kin_relationship: parsedTextPayload.data.nextOfKinRelationship,
        national_id_path: uploadedDocumentPaths.nationalId,
        passport_photo_path: uploadedDocumentPaths.passportPhoto,
        utility_bill_path: uploadedDocumentPaths.utilityBill,
        onboarding_status: "pending",
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
      email: parsedTextPayload.data.email,
      fullName: parsedTextPayload.data.fullName,
      memberNumber,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    await removeUploadedFiles(uploadedPaths);

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
