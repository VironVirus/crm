export const MEMBER_TIERS = ["tier_1", "tier_2", "tier_3"] as const;

export type MemberTier = (typeof MEMBER_TIERS)[number];

export type MemberTierSource = {
  national_id_path?: string | null;
  next_of_kin_name?: string | null;
  next_of_kin_phone?: string | null;
  next_of_kin_relationship?: string | null;
  passport_photo_path?: string | null;
  utility_bill_path?: string | null;
};

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function memberHasNextOfKin(source: MemberTierSource | null | undefined) {
  if (!source) {
    return false;
  }

  return (
    hasValue(source.next_of_kin_name) &&
    hasValue(source.next_of_kin_phone) &&
    hasValue(source.next_of_kin_relationship)
  );
}

export function memberHasKyc(source: MemberTierSource | null | undefined) {
  if (!source) {
    return false;
  }

  return (
    hasValue(source.national_id_path) &&
    hasValue(source.passport_photo_path) &&
    hasValue(source.utility_bill_path)
  );
}

export function getMemberTier(source: MemberTierSource | null | undefined): MemberTier {
  if (!memberHasNextOfKin(source)) {
    return "tier_1";
  }

  if (!memberHasKyc(source)) {
    return "tier_2";
  }

  return "tier_3";
}

export function getMemberTierMeta(tier: MemberTier) {
  switch (tier) {
    case "tier_1":
      return {
        canAccessLoans: false,
        canAccessShares: false,
        canVote: false,
        description: "Bronze access with savings, payments, statements, and notifications.",
        label: "Tier 1",
        medal: "Bronze",
        nextStep: "Add your next of kin to unlock voting access.",
      };
    case "tier_2":
      return {
        canAccessLoans: false,
        canAccessShares: false,
        canVote: true,
        description: "Voting access is unlocked after next of kin details are completed.",
        label: "Tier 2",
        medal: "Silver",
        nextStep: "Upload your KYC documents to unlock loans and shares.",
      };
    case "tier_3":
    default:
      return {
        canAccessLoans: true,
        canAccessShares: true,
        canVote: true,
        description: "Full member access across savings, loans, shares, and voting.",
        label: "Tier 3",
        medal: "Gold",
        nextStep: "Your profile is complete.",
      };
  }
}

export function getTierUpgradeLabel(tier: MemberTier) {
  switch (tier) {
    case "tier_1":
      return "Upgrade to Tier 2";
    case "tier_2":
      return "Upgrade to Tier 3";
    case "tier_3":
    default:
      return "Profile complete";
  }
}
