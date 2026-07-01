import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getAppUrl,
  getFlutterwaveBaseUrl,
  getFlutterwavePublicKey,
  getFlutterwaveSecretHash,
  getFlutterwaveSecretKey,
} from "@/lib/env/server";

type FlutterwaveTransactionData = {
  amount?: number | string | null;
  charged_amount?: number | string | null;
  currency?: string | null;
  customer?: {
    email?: string | null;
    name?: string | null;
    phonenumber?: string | null;
    phone_number?: string | null;
  } | null;
  id?: number | string | null;
  meta?: Record<string, unknown> | null;
  meta_data?: Record<string, unknown> | null;
  status?: string | null;
  tx_ref?: string | null;
};

type FlutterwaveApiBody = {
  data?: {
    checkout_url?: string | null;
    id?: string | null;
    link?: string | null;
  } | null;
  message?: string | null;
  status?: string | null;
};

type FlutterwaveSdkClient = {
  Transaction: {
    verify: (payload: { id: number | string }) => Promise<{ body?: unknown }>;
    verify_by_tx: (payload: {
      tx_ref: string;
    }) => Promise<{ body?: unknown }>;
  };
};

type FlutterwaveRaveBaseClient = {
  request: (
    path: string,
    payload: Record<string, unknown>,
  ) => Promise<{ body?: FlutterwaveApiBody }>;
};

export class FlutterwaveGatewayError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "FlutterwaveGatewayError";
    this.status = status;
  }
}

function getFlutterwaveCredentials() {
  const publicKey = getFlutterwavePublicKey();
  const secretKey = getFlutterwaveSecretKey();

  if (!publicKey || !secretKey) {
    throw new FlutterwaveGatewayError(
      "Flutterwave keys are missing. Add the public and secret keys before collecting payments.",
      503,
    );
  }

  return {
    baseUrl: getFlutterwaveBaseUrl(),
    publicKey,
    secretKey,
  };
}

function createFlutterwaveSdkClient() {
  const { baseUrl, publicKey, secretKey } = getFlutterwaveCredentials();
  const Flutterwave = require("flutterwave-node-v3") as new (
    publicKey: string,
    secretKey: string,
    baseUrl?: string,
  ) => FlutterwaveSdkClient;

  return new Flutterwave(publicKey, secretKey, baseUrl);
}

function createFlutterwaveRequestClient() {
  const { baseUrl, publicKey, secretKey } = getFlutterwaveCredentials();
  const RaveBase = require("flutterwave-node-v3/lib/rave.base") as new (
    publicKey: string,
    secretKey: string,
    baseUrl?: string,
  ) => FlutterwaveRaveBaseClient;

  return new RaveBase(publicKey, secretKey, baseUrl);
}

function safelyCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left.trim());
  const rightBuffer = Buffer.from(right.trim());

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getFlutterwaveRedirectUrl(txRef: string) {
  const appUrl = (getAppUrl() ?? "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}/portal?payment=processing&tx_ref=${encodeURIComponent(txRef)}`;
}

export async function createFlutterwavePaymentLink(payload: {
  amount: number;
  currency?: string;
  customer: {
    email: string;
    name: string;
    phonenumber?: string | null;
  };
  customizations: {
    description: string;
    title: string;
  };
  meta: Record<string, unknown>;
  payment_options?: string;
  redirect_url: string;
  tx_ref: string;
}) {
  const client = createFlutterwaveRequestClient();
  const response = await client.request("v3/payments", {
    amount: payload.amount,
    currency: payload.currency ?? "NGN",
    customer: payload.customer,
    customizations: payload.customizations,
    meta: payload.meta,
    payment_options: payload.payment_options ?? "card,banktransfer,ussd",
    redirect_url: payload.redirect_url,
    tx_ref: payload.tx_ref,
  });
  const body = response.body ?? null;
  const paymentLink = body?.data?.link ?? body?.data?.checkout_url ?? null;

  if (body?.status !== "success" || !paymentLink) {
    throw new FlutterwaveGatewayError(
      body?.message ??
        "Flutterwave did not return a hosted checkout link for this payment.",
    );
  }

  return {
    paymentLink,
    responseBody: body,
  };
}

export async function verifyFlutterwaveTransaction({
  transactionId,
  txRef,
}: {
  transactionId?: number | string | null;
  txRef: string;
}) {
  const client = createFlutterwaveSdkClient();
  const verificationResult =
    transactionId !== null && transactionId !== undefined
      ? await client.Transaction.verify({
          id:
            typeof transactionId === "string" &&
            /^-?\d+(\.\d+)?$/.test(transactionId)
              ? Number(transactionId)
              : transactionId,
        })
      : await client.Transaction.verify_by_tx({ tx_ref: txRef });
  const verificationBody = (verificationResult.body ??
    verificationResult) as {
    data?: FlutterwaveTransactionData | null;
    message?: string | null;
    status?: string | null;
  };

  if (verificationBody.status !== "success" || !verificationBody.data) {
    throw new FlutterwaveGatewayError(
      verificationBody.message ??
        "Flutterwave could not verify this payment successfully.",
      400,
    );
  }

  return verificationBody.data;
}

export function verifyFlutterwaveWebhookSignature(
  rawBody: string,
  headers: Headers,
) {
  const secretHash = getFlutterwaveSecretHash();

  if (!secretHash) {
    return false;
  }

  const signatureHeader = headers.get("flutterwave-signature");

  if (signatureHeader) {
    const expectedSignature = createHmac("sha256", secretHash)
      .update(rawBody)
      .digest("hex");

    return safelyCompare(signatureHeader, expectedSignature);
  }

  const legacySecretHeader = headers.get("verif-hash");

  if (!legacySecretHeader) {
    return false;
  }

  return safelyCompare(legacySecretHeader, secretHash);
}
