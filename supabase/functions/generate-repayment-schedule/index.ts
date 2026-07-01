import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type InterestType = "flat" | "reducing_balance";

type LoanRecord = {
  id: string;
  application_id: string;
  principal_amount: number | string | null;
  interest_rate: number | string | null;
  tenure_months: number;
  amount_disbursed: number | string | null;
  disbursed_at: string | null;
};

type LoanApplicationRecord = {
  loan_product_id: string;
};

type LoanProductRecord = {
  interest_type: InterestType;
};

type ExistingScheduleRecord = {
  amount_paid: number | string | null;
};

type ScheduleRow = {
  due_date: string;
  principal_due: number;
  interest_due: number;
  total_due: number;
  amount_paid: number;
  status: "pending";
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addMonthsPreservingDay(baseDate: Date, monthsToAdd: number) {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + monthsToAdd;
  const day = baseDate.getUTCDate();
  const firstOfTargetMonth = new Date(Date.UTC(year, month, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth(),
      Math.min(day, lastDayOfTargetMonth),
    ),
  );
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildFlatSchedule(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number,
  startDate: Date,
) {
  const schedule: ScheduleRow[] = [];
  const totalInterest = roundCurrency(
    principal * (annualInterestRate / 100) * (tenureMonths / 12),
  );
  const exactPrincipalPerMonth = principal / tenureMonths;
  const exactInterestPerMonth = totalInterest / tenureMonths;
  let remainingPrincipal = roundCurrency(principal);
  let remainingInterest = roundCurrency(totalInterest);

  for (let installment = 1; installment <= tenureMonths; installment += 1) {
    const principalDue =
      installment === tenureMonths
        ? roundCurrency(remainingPrincipal)
        : roundCurrency(exactPrincipalPerMonth);
    const interestDue =
      installment === tenureMonths
        ? roundCurrency(remainingInterest)
        : roundCurrency(exactInterestPerMonth);
    const totalDue = roundCurrency(principalDue + interestDue);

    schedule.push({
      due_date: toIsoDate(addMonthsPreservingDay(startDate, installment)),
      principal_due: principalDue,
      interest_due: interestDue,
      total_due: totalDue,
      amount_paid: 0,
      status: "pending",
    });

    remainingPrincipal = roundCurrency(remainingPrincipal - principalDue);
    remainingInterest = roundCurrency(remainingInterest - interestDue);
  }

  return schedule;
}

function buildReducingBalanceSchedule(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number,
  startDate: Date,
) {
  const schedule: ScheduleRow[] = [];
  const monthlyRate = annualInterestRate / 100 / 12;
  const exactMonthlyRepayment =
    monthlyRate === 0
      ? principal / tenureMonths
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
        (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  let remainingPrincipal = roundCurrency(principal);

  for (let installment = 1; installment <= tenureMonths; installment += 1) {
    const interestDue =
      monthlyRate === 0
        ? 0
        : roundCurrency(remainingPrincipal * monthlyRate);
    const principalDue =
      installment === tenureMonths
        ? roundCurrency(remainingPrincipal)
        : roundCurrency(exactMonthlyRepayment - interestDue);
    const totalDue = roundCurrency(principalDue + interestDue);

    schedule.push({
      due_date: toIsoDate(addMonthsPreservingDay(startDate, installment)),
      principal_due: principalDue,
      interest_due: interestDue,
      total_due: totalDue,
      amount_paid: 0,
      status: "pending",
    });

    remainingPrincipal = roundCurrency(remainingPrincipal - principalDue);
  }

  return schedule;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(
      { error: "Supabase environment variables are missing." },
      500,
    );
  }

  let payload: { loanId?: string };

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  if (!payload.loanId) {
    return json({ error: "loanId is required." }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const loanResult = await supabase
    .from("loans")
    .select(
      "id, application_id, principal_amount, interest_rate, tenure_months, amount_disbursed, disbursed_at",
    )
    .eq("id", payload.loanId)
    .single();
  const loan = loanResult.data as LoanRecord | null;
  const loanError = loanResult.error;

  if (loanError || !loan) {
    return json(
      { error: loanError?.message || "Loan not found." },
      loanError ? 400 : 404,
    );
  }

  const applicationResult = await supabase
    .from("loan_applications")
    .select("loan_product_id")
    .eq("id", loan.application_id)
    .single();
  const application = applicationResult.data as LoanApplicationRecord | null;
  const applicationError = applicationResult.error;

  if (applicationError || !application) {
    return json(
      {
        error:
          applicationError?.message ||
          "Loan application for this loan could not be found.",
      },
      applicationError ? 400 : 404,
    );
  }

  const productResult = await supabase
    .from("loan_products")
    .select("interest_type")
    .eq("id", application.loan_product_id)
    .single();
  const product = productResult.data as LoanProductRecord | null;
  const productError = productResult.error;

  if (productError || !product) {
    return json(
      {
        error:
          productError?.message ||
          "Loan product for this loan could not be found.",
      },
      productError ? 400 : 404,
    );
  }

  const { data: existingScheduleRows, error: scheduleLookupError } =
    await supabase
      .from("loan_repayment_schedule")
      .select("amount_paid")
      .eq("loan_id", payload.loanId);

  if (scheduleLookupError) {
    return json({ error: scheduleLookupError.message }, 400);
  }

  const hasRecordedPayments = (
    (existingScheduleRows as ExistingScheduleRecord[] | null) ?? []
  ).some((row) => parseMoney(row.amount_paid) > 0);

  if (hasRecordedPayments) {
    return json(
      {
        error:
          "Repayment schedule already contains paid installments and cannot be regenerated automatically.",
      },
      409,
    );
  }

  if ((existingScheduleRows?.length ?? 0) > 0) {
    const { error: deleteScheduleError } = await supabase
      .from("loan_repayment_schedule")
      .delete()
      .eq("loan_id", payload.loanId);

    if (deleteScheduleError) {
      return json({ error: deleteScheduleError.message }, 400);
    }
  }

  const principalBase = parseMoney(loan.amount_disbursed) > 0
    ? parseMoney(loan.amount_disbursed)
    : parseMoney(loan.principal_amount);
  const annualInterestRate = parseMoney(loan.interest_rate);
  const tenureMonths = Number(loan.tenure_months ?? 0);
  const scheduleStartDate = loan.disbursed_at
    ? new Date(loan.disbursed_at)
    : new Date();

  if (
    principalBase <= 0 ||
    annualInterestRate < 0 ||
    !Number.isFinite(tenureMonths) ||
    tenureMonths <= 0 ||
    Number.isNaN(scheduleStartDate.getTime())
  ) {
    return json(
      {
        error:
          "Loan record is incomplete. Ensure principal, interest rate, tenure, and disbursement timing are valid before generating the repayment schedule.",
      },
      400,
    );
  }

  const schedule =
    product.interest_type === "flat"
      ? buildFlatSchedule(
          principalBase,
          annualInterestRate,
          tenureMonths,
          scheduleStartDate,
        )
      : buildReducingBalanceSchedule(
          principalBase,
          annualInterestRate,
          tenureMonths,
          scheduleStartDate,
        );

  const totalRepayable = roundCurrency(
    schedule.reduce((total, row) => total + row.total_due, 0),
  );
  const monthlyRepayment = roundCurrency(schedule[0]?.total_due ?? 0);
  const maturityDate = schedule.at(-1)?.due_date ?? null;

  const { error: updateLoanError } = await supabase
    .from("loans")
    .update({
      monthly_repayment: monthlyRepayment,
      total_repayable: totalRepayable,
      maturity_date: maturityDate,
      outstanding_balance: totalRepayable,
    })
    .eq("id", payload.loanId);

  if (updateLoanError) {
    return json({ error: updateLoanError.message }, 400);
  }

  const { error: insertScheduleError } = await supabase
    .from("loan_repayment_schedule")
    .insert(
      schedule.map((row) => ({
        loan_id: payload.loanId,
        ...row,
      })),
    );

  if (insertScheduleError) {
    return json({ error: insertScheduleError.message }, 400);
  }

  return json({
    interestType: product.interest_type,
    installmentsCreated: schedule.length,
    loanId: payload.loanId,
    maturityDate,
    monthlyRepayment,
    totalRepayable,
  });
});
