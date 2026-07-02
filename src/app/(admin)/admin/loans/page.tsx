import AdminLoansPageView from "@/features/admin/loans/page-view";
import {
  LOAN_BOARD_STATUSES,
  parseMoney,
  type AdminLoanApplicationRow,
  type ExistingLoanSummary,
  type LoanBoardStatus,
  type LoanGuarantorStatus,
  type LoanInterestType,
  type LoanProductOption,
  type LoanStatus,
} from "@/lib/loans";
import { KYC_STORAGE_BUCKET } from "@/lib/validation/member-registration";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type SavingsAccountType } from "@/lib/savings";

type ProfileRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  member_number: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  id: string;
  date_of_birth: string;
  address: string;
  occupation: string;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  national_id_path: string | null;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type LoanProductRecord = {
  description: string | null;
  id: string;
  name: string;
  interest_rate: number | string | null;
  interest_type: LoanInterestType;
  maximum_disbursable_amount: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  min_tenure_months: number;
  max_tenure_months: number;
  max_loan_to_savings_ratio: number | string | null;
  penalty_rate: number | string | null;
  processing_fee_rate: number | string | null;
  terms_summary: string | null;
  is_active: boolean;
};

type LoanApplicationRecord = {
  id: string;
  member_id: string;
  loan_product_id: string;
  amount_requested: number | string | null;
  tenure_months: number;
  purpose: string;
  status: LoanBoardStatus | "draft" | "closed";
  applied_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
};

type SavingsAccountRecord = {
  member_id: string;
  account_type: SavingsAccountType;
  balance: number | string | null;
};

type LoanRecord = {
  id: string;
  application_id: string;
  member_id: string;
  principal_amount: number | string | null;
  interest_rate: number | string | null;
  tenure_months: number;
  monthly_repayment: number | string | null;
  total_repayable: number | string | null;
  amount_disbursed: number | string | null;
  outstanding_balance: number | string | null;
  disbursed_at: string | null;
  maturity_date: string | null;
  status: LoanStatus;
};

type LoanGuarantorRecord = {
  id: string;
  loan_application_id: string;
  guarantor_member_id: string;
  status: LoanGuarantorStatus;
  invited_at: string;
  responded_at: string | null;
  liability_amount: number | string | null;
  released_at: string | null;
};

async function createSignedDocumentLinks(
  member: MemberRecord,
  admin = createSupabaseAdminClient(),
) {
  const documents = [
    { label: "National ID", path: member.national_id_path },
    { label: "Passport Photo", path: member.passport_photo_path },
    { label: "Utility Bill", path: member.utility_bill_path },
  ];

  return Promise.all(
    documents.map(async (document) => {
      if (!document.path) {
        return {
          label: document.label,
          path: null,
          signedUrl: null,
        };
      }

      const { data, error } = await admin.storage
        .from(KYC_STORAGE_BUCKET)
        .createSignedUrl(document.path, 60 * 60);

      return {
        label: document.label,
        path: document.path,
        signedUrl: error ? null : data.signedUrl,
      };
    }),
  );
}

function mapLoanProduct(product: LoanProductRecord): LoanProductOption {
  return {
    description: product.description,
    id: product.id,
    name: product.name,
    interestRate: parseMoney(product.interest_rate),
    interestType: product.interest_type,
    maximumDisbursableAmount: product.maximum_disbursable_amount
      ? parseMoney(product.maximum_disbursable_amount)
      : null,
    minAmount: parseMoney(product.min_amount),
    maxAmount: parseMoney(product.max_amount),
    minTenureMonths: product.min_tenure_months,
    maxTenureMonths: product.max_tenure_months,
    maxLoanToSavingsRatio: parseMoney(product.max_loan_to_savings_ratio),
    penaltyRate: parseMoney(product.penalty_rate),
    processingFeeRate: parseMoney(product.processing_fee_rate),
    termsSummary: product.terms_summary,
    isActive: product.is_active,
  };
}

function mapLoanRecord(loan: LoanRecord): ExistingLoanSummary {
  return {
    id: loan.id,
    applicationId: loan.application_id,
    principalAmount: parseMoney(loan.principal_amount),
    interestRate: parseMoney(loan.interest_rate),
    tenureMonths: loan.tenure_months,
    monthlyRepayment: parseMoney(loan.monthly_repayment),
    totalRepayable: parseMoney(loan.total_repayable),
    amountDisbursed: parseMoney(loan.amount_disbursed),
    outstandingBalance: parseMoney(loan.outstanding_balance),
    disbursedAt: loan.disbursed_at,
    maturityDate: loan.maturity_date,
    status: loan.status,
  };
}

export default async function AdminLoansPage() {
  const admin = createSupabaseAdminClient();

  const [
    applicationsResult,
    loanProductsResult,
    profilesResult,
    membersResult,
    savingsAccountsResult,
    loansResult,
    loanGuarantorsResult,
  ] = await Promise.all([
    admin
      .from("loan_applications")
      .select(
        "id, member_id, loan_product_id, amount_requested, tenure_months, purpose, status, applied_at, reviewed_at, approved_at, rejection_reason",
      )
      .order("applied_at", { ascending: false }),
    admin
      .from("loan_products")
      .select(
        "id, name, description, interest_rate, interest_type, min_amount, max_amount, min_tenure_months, max_tenure_months, max_loan_to_savings_ratio, maximum_disbursable_amount, processing_fee_rate, penalty_rate, terms_summary, is_active",
      )
      .order("name"),
    admin
      .from("profiles")
      .select("id, full_name, email, phone, member_number, status"),
    admin
      .from("members")
      .select(
        "id, date_of_birth, address, occupation, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      ),
    admin
      .from("savings_accounts")
      .select("member_id, account_type, balance")
      .eq("status", "active"),
    admin
      .from("loans")
      .select(
        "id, application_id, member_id, principal_amount, interest_rate, tenure_months, monthly_repayment, total_repayable, amount_disbursed, outstanding_balance, disbursed_at, maturity_date, status",
      )
      .order("disbursed_at", { ascending: false }),
    admin
      .from("loan_guarantors")
      .select(
        "id, loan_application_id, guarantor_member_id, status, invited_at, responded_at, liability_amount, released_at",
      )
      .order("invited_at", { ascending: true }),
  ]);

  const rawApplications =
    (applicationsResult.data as LoanApplicationRecord[] | null) ?? [];
  const applications = rawApplications.filter((application) =>
    LOAN_BOARD_STATUSES.includes(application.status as LoanBoardStatus),
  );

  const productMap = new Map(
    (((loanProductsResult.data as LoanProductRecord[] | null) ?? []).map((product) => [
      product.id,
      mapLoanProduct(product),
    ])) satisfies Array<[string, LoanProductOption]>,
  );
  const profileMap = new Map(
    (((profilesResult.data as ProfileRecord[] | null) ?? []).map((profile) => [
      profile.id,
      profile,
    ])) satisfies Array<[string, ProfileRecord]>,
  );
  const memberMap = new Map(
    (((membersResult.data as MemberRecord[] | null) ?? []).map((member) => [
      member.id,
      member,
    ])) satisfies Array<[string, MemberRecord]>,
  );

  const savingsByMember = new Map<
    string,
    {
      mandatory: number;
      voluntary: number;
      fixed_deposit: number;
    }
  >();

  ((savingsAccountsResult.data as SavingsAccountRecord[] | null) ?? []).forEach(
    (account) => {
      const existing = savingsByMember.get(account.member_id) ?? {
        mandatory: 0,
        voluntary: 0,
        fixed_deposit: 0,
      };
      existing[account.account_type] += parseMoney(account.balance);
      savingsByMember.set(account.member_id, existing);
    },
  );

  const loansByMember = new Map<string, ExistingLoanSummary[]>();
  const loanByApplication = new Map<string, ExistingLoanSummary>();

  ((loansResult.data as LoanRecord[] | null) ?? []).forEach((loanRecord) => {
    const loan = mapLoanRecord(loanRecord);
    const memberLoans = loansByMember.get(loanRecord.member_id) ?? [];

    memberLoans.push(loan);
    loansByMember.set(loanRecord.member_id, memberLoans);
    loanByApplication.set(loanRecord.application_id, loan);
  });

  const guarantorsByApplication = new Map<
    string,
    AdminLoanApplicationRow["member"]["guarantors"]
  >();

  ((loanGuarantorsResult.data as LoanGuarantorRecord[] | null) ?? []).forEach(
    (record) => {
      const profile = profileMap.get(record.guarantor_member_id);

      if (!profile) {
        return;
      }

      const guarantors = guarantorsByApplication.get(record.loan_application_id) ?? [];

      guarantors.push({
        id: record.id,
        guarantorMemberId: record.guarantor_member_id,
        fullName: profile.full_name,
        memberNumber: profile.member_number,
        email: profile.email,
        phone: profile.phone,
        status: record.status,
        invitedAt: record.invited_at,
        respondedAt: record.responded_at,
        liabilityAmount: parseMoney(record.liability_amount),
        releasedAt: record.released_at,
      });

      guarantorsByApplication.set(record.loan_application_id, guarantors);
    },
  );

  const memberIds = Array.from(
    new Set(applications.map((application) => application.member_id)),
  );
  const documentEntries: Array<
    [string, Awaited<ReturnType<typeof createSignedDocumentLinks>>]
  > = await Promise.all(
    memberIds.map(async (memberId) => {
      const member = memberMap.get(memberId);

      if (!member) {
        return [
          memberId,
          [] as Awaited<ReturnType<typeof createSignedDocumentLinks>>,
        ];
      }

      return [memberId, await createSignedDocumentLinks(member, admin)];
    }),
  );
  const documentsMap = new Map(documentEntries);

  const rows = applications.reduce<AdminLoanApplicationRow[]>(
    (accumulator, application) => {
      const profile = profileMap.get(application.member_id);
      const member = memberMap.get(application.member_id);
      const product = productMap.get(application.loan_product_id);

      if (!profile || !member || !product) {
        return accumulator;
      }

      const savingsSummary = savingsByMember.get(application.member_id) ?? {
        mandatory: 0,
        voluntary: 0,
        fixed_deposit: 0,
      };
      const savingsBalance =
        savingsSummary.mandatory +
        savingsSummary.voluntary +
        savingsSummary.fixed_deposit;
      const linkedLoan = loanByApplication.get(application.id) ?? null;
      const existingLoans = (loansByMember.get(application.member_id) ?? []).filter(
        (loan) => loan.applicationId !== application.id,
      );
      const guarantors = guarantorsByApplication.get(application.id) ?? [];

      accumulator.push({
        id: application.id,
        amountRequested: parseMoney(application.amount_requested),
        tenureMonths: application.tenure_months,
        purpose: application.purpose,
        status: application.status as LoanBoardStatus,
        appliedAt: application.applied_at,
        reviewedAt: application.reviewed_at,
        approvedAt: application.approved_at,
        rejectionReason: application.rejection_reason,
        product,
        member: {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          memberNumber: profile.member_number,
          profileStatus: profile.status,
          address: member.address,
          occupation: member.occupation,
          dateOfBirth: member.date_of_birth,
          nextOfKinName: member.next_of_kin_name,
          nextOfKinPhone: member.next_of_kin_phone,
          nextOfKinRelationship: member.next_of_kin_relationship,
          savingsBalance,
          mandatorySavings: savingsSummary.mandatory,
          voluntarySavings: savingsSummary.voluntary,
          fixedDepositSavings: savingsSummary.fixed_deposit,
          documents: documentsMap.get(application.member_id) ?? [],
          guarantors,
        },
        loan: linkedLoan,
        existingLoans,
      } satisfies AdminLoanApplicationRow);

      return accumulator;
    },
    [],
  );

  const errors = [
    applicationsResult.error?.message,
    loanProductsResult.error?.message,
    profilesResult.error?.message,
    membersResult.error?.message,
    savingsAccountsResult.error?.message,
    loansResult.error?.message,
    loanGuarantorsResult.error?.message,
  ].filter(Boolean);

  return (
    <AdminLoansPageView
      applications={rows}
      dataError={errors.length > 0 ? errors.join(" ") : null}
    />
  );
}
