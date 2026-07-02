import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceRoleKey } from "@/lib/env/server";
import { type PaymentType } from "@/lib/payments";

export type MockFlutterwaveSession = {
  amount: number;
  description: string;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  metadata: Record<string, unknown>;
  paymentType: PaymentType;
  txRef: string;
};

function getMockSessionSecret() {
  return `${getSupabaseServiceRoleKey()}:flutterwave-mock`;
}

function createSignature(payload: string) {
  return createHmac("sha256", getMockSessionSecret()).update(payload).digest("hex");
}

function isValidSignature(payload: string, signature: string) {
  const expected = createSignature(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function createMockFlutterwaveSessionToken(
  session: MockFlutterwaveSession,
) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createSignature(payload);

  return `${payload}.${signature}`;
}

export function readMockFlutterwaveSessionToken(token: string) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature || !isValidSignature(payload, signature)) {
    throw new Error("This mock payment session is invalid or has expired.");
  }

  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as MockFlutterwaveSession;

  return decoded;
}
