import React from "react";
import {
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { MemberStatementDocument } from "@/lib/reporting/member-statement-document";
import { getMemberStatementData } from "@/lib/reports/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  adminMemberStatementQuerySchema,
  searchParamsToObject,
} from "@/lib/validation/api";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function GET(request: NextRequest) {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before generating a member statement.", 401);
  }

  const { data: adminProfile } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfile?.role !== "admin") {
    return jsonError("Administrative access is required for this report.", 403);
  }

  const parsedQuery = adminMemberStatementQuerySchema.safeParse(
    searchParamsToObject(request.nextUrl.searchParams),
  );

  if (!parsedQuery.success) {
    return jsonError(
      parsedQuery.error.issues[0]?.message ??
        "Please provide a valid member and statement date range.",
      400,
    );
  }

  try {
    const { end_date: endDate, member_id: memberId, start_date: startDate } =
      parsedQuery.data;
    const statement = await getMemberStatementData({
      endDate,
      memberId,
      startDate,
    });

    const buffer = await renderToBuffer(
      React.createElement(MemberStatementDocument, {
        statement,
      }) as React.ReactElement<DocumentProps>,
    );
    const filename = [
      "ifemelunma-member-statement",
      sanitizeFilenamePart(statement.member.memberNumber ?? statement.member.fullName),
      startDate,
      endDate,
    ]
      .filter(Boolean)
      .join("-");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate the member statement right now.";

    return jsonError(
      message === "The selected member could not be found."
        ? message
        : "Unable to generate the member statement right now.",
      message === "The selected member could not be found." ? 404 : 500,
    );
  }
}
