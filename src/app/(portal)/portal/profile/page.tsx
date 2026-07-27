"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import MemberProfilePageView from "@/features/portal/profile/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import { getMemberTier } from "@/lib/member-tier";
import {
  MEMBER_PLACEHOLDER_ADDRESS,
  MEMBER_PLACEHOLDER_OCCUPATION,
  normalizeMemberDate,
  normalizeMemberText,
} from "@/lib/members";
import { KYC_STORAGE_BUCKET } from "@/lib/validation/member-registration";

type ProfileRecord = {
  email: string;
  full_name: string;
  is_verified: boolean;
  member_number: string | null;
  phone: string | null;
};

type MemberRecord = {
  address: string;
  date_of_birth: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  occupation: string;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

async function loadPortalProfilePage(
  supabase: SupabaseClient,
  user: User,
): Promise<ComponentProps<typeof MemberProfilePageView>> {
  const profileResult = await supabase
    .from("profiles")
    .select("email, full_name, member_number, phone, is_verified")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;
  const memberResult = await supabase
    .from("members")
    .select(
      "address, date_of_birth, occupation, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
    )
    .eq("id", user.id)
    .maybeSingle();
  const member = memberResult.data as MemberRecord | null;
  const passportPhotoUrl = member?.passport_photo_path
    ? (
        await supabase.storage
          .from(KYC_STORAGE_BUCKET)
          .createSignedUrl(member.passport_photo_path, 60 * 60)
      ).data?.signedUrl ?? null
    : null;
  const tier = getMemberTier(member);
  const errors = [profileResult.error?.message, memberResult.error?.message].filter(
    Boolean,
  );

  return {
    address: normalizeMemberText(member?.address, MEMBER_PLACEHOLDER_ADDRESS),
    dataError: errors.length > 0 ? errors.join(" ") : null,
    dateOfBirth: normalizeMemberDate(member?.date_of_birth),
    email: profile?.email ?? user.email ?? "",
    kycStatus: {
        nationalId: Boolean(member?.national_id_path),
        passportPhoto: Boolean(member?.passport_photo_path),
        utilityBill: Boolean(member?.utility_bill_path),
      },
    isVerified: profile?.is_verified ?? false,
    memberName: profile?.full_name ?? user.email ?? "Member",
    memberNumber: profile?.member_number ?? null,
    nextOfKin: {
        nextOfKinName: member?.next_of_kin_name ?? "",
        nextOfKinPhone: member?.next_of_kin_phone ?? "",
        nextOfKinRelationship: member?.next_of_kin_relationship ?? "",
      },
    occupation: normalizeMemberText(
        member?.occupation,
        MEMBER_PLACEHOLDER_OCCUPATION,
      ),
    passportPhotoUrl,
    phone: profile?.phone ?? null,
    tier,
  };
}

export default function PortalProfilePage() {
  const { data, error, isLoading } = useStaticPageData(loadPortalProfilePage);

  if (isLoading && !data) return <StaticPageLoading label="Loading your profile…" />;
  if (!data) return <StaticPageError>{error ?? "Your profile is unavailable."}</StaticPageError>;

  return <MemberProfilePageView {...data} dataError={data.dataError ?? error} />;
}
