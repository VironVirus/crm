import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getMemberTier } from "@/lib/member-tier";
import { ensureMemberRecord } from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  KYC_FIELD_CONFIG,
  KYC_STORAGE_BUCKET,
  type KycFieldName,
  memberKycSchema,
  sanitizeStorageFilename,
} from "@/lib/validation/member-registration";

export const runtime = "nodejs";

const KYC_FIELD_NAMES = Object.keys(KYC_FIELD_CONFIG) as KycFieldName[];

type MemberKycRecord = {
  address: string;
  date_of_birth: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  occupation: string;
  onboarding_status: "pending" | "registered";
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
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
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Unable to upload ${KYC_FIELD_CONFIG[fieldName].label}.`);
  }

  return objectPath;
}

async function removeFiles(paths: Array<string | null | undefined>) {
  const filePaths = paths.filter((value): value is string => Boolean(value));

  if (filePaths.length === 0) {
    return;
  }

  const admin = createSupabaseAdminClient();
  await admin.storage.from(KYC_STORAGE_BUCKET).remove(filePaths);
}

export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError("Unable to read your KYC documents.", 400);
  }

  const payload = {
    nationalId: formData.get("nationalId"),
    passportPhoto: formData.get("passportPhoto"),
    utilityBill: formData.get("utilityBill"),
  };
  const parsed = memberKycSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review your KYC documents and try again.",
      400,
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before uploading KYC.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("member_number")
    .eq("id", user.id)
    .maybeSingle();
  const { data: currentMemberData, error: currentMemberError } =
    await ensureMemberRecord(admin, {
      memberId: user.id,
      memberNumber: profile?.member_number ?? null,
      select:
        "address, date_of_birth, occupation, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
    });
  const currentMember = currentMemberData as MemberKycRecord | null;

  if (currentMemberError || !currentMember) {
    return jsonError("Your member profile could not be loaded.", 404);
  }

  const uploadedPaths: Partial<Record<KycFieldName, string>> = {};

  try {
    for (const fieldName of KYC_FIELD_NAMES) {
      const file = parsed.data[fieldName];

      if (!file) {
        continue;
      }

      uploadedPaths[fieldName] = await uploadKycDocument(
        user.id,
        fieldName,
        file as File,
      );
    }

    const { data, error } = await admin
      .from("members")
      .upsert({
        id: user.id,
        address: currentMember.address,
        date_of_birth: currentMember.date_of_birth,
        occupation: currentMember.occupation,
        onboarding_status: currentMember.onboarding_status,
        national_id_path:
          uploadedPaths.nationalId ?? currentMember.national_id_path ?? null,
        passport_photo_path:
          uploadedPaths.passportPhoto ?? currentMember.passport_photo_path ?? null,
        utility_bill_path:
          uploadedPaths.utilityBill ?? currentMember.utility_bill_path ?? null,
      }, {
        onConflict: "id",
      })
      .select(
        "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      )
      .single();

    if (error || !data) {
      throw new Error("Unable to save your KYC documents.");
    }

    await removeFiles([
      uploadedPaths.nationalId ? currentMember.national_id_path : null,
      uploadedPaths.passportPhoto ? currentMember.passport_photo_path : null,
      uploadedPaths.utilityBill ? currentMember.utility_bill_path : null,
    ]);

    revalidatePath("/portal");
    revalidatePath("/portal/loans");
    revalidatePath("/portal/profile");

    return NextResponse.json({
      message: "Your KYC documents have been uploaded.",
      tier: getMemberTier(data),
    });
  } catch (error) {
    await removeFiles([
      uploadedPaths.nationalId,
      uploadedPaths.passportPhoto,
      uploadedPaths.utilityBill,
    ]);

    return jsonError(
      error instanceof Error
        ? error.message
        : "We could not upload your KYC documents right now.",
      500,
    );
  }
}
