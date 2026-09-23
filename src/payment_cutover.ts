import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

export const paymentEventSchema = z.object({
  paymentId: z.string().min(1),
  amountUsd: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  status: z.enum(["authorized", "captured", "failed"]),
  riskLevel: z.enum(["low", "medium", "high"]),
  customerEmail: z.string().email()
});

export const rotationRequestSchema = z.object({
  projectId: z.string().min(1),
  oldKeyLabel: z.string().min(1),
  oldKeyFingerprint: z.string().min(1),
  graceHours: z.number().int().min(1).max(72),
  affectedDeployments: z.array(z.string().min(1)),
  paymentEvents: z.array(paymentEventSchema).min(1)
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type RotationRequest = z.infer<typeof rotationRequestSchema>;

export type NotificationRecord = {
  notificationId: string;
  type: string;
  action: "continue" | "hold_settlement";
  signature: string;
  payload: {
    paymentId: string;
    amountUsd: number;
    customerEmail: string;
    oldKeyLabel: string;
    deploymentsStillOnOldKey: string[];
  };
};

export function decidePaymentAction(event: PaymentEvent, deploymentsStillOnOldKey: string[]): {
  type: string;
  action: "continue" | "hold_settlement";
} {
  const oldKeyStillActive = deploymentsStillOnOldKey.length > 0;

  if (event.status === "captured" && event.riskLevel === "high" && oldKeyStillActive) {
    return {
      type: "payment.captured.requires_review",
      action: "hold_settlement"
    };
  }

  if (event.status === "captured") {
    return {
      type: "payment.captured.cutover_ok",
      action: "continue"
    };
  }

  if (event.status === "authorized") {
    return {
      type: "payment.authorized.cutover_watch",
      action: "continue"
    };
  }

  return {
    type: "payment.failed.recorded",
    action: "continue"
  };
}

export function signNotification(payload: Record<string, unknown>, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

export function verifyNotification(payload: Record<string, unknown>, signature: string, secret: string): boolean {
  return signNotification(payload, secret) === signature;
}

export function buildNotifications(input: RotationRequest, deploymentsStillOnOldKey: string[], secret: string): NotificationRecord[] {
  return input.paymentEvents.map((event) => {
    const decision = decidePaymentAction(event, deploymentsStillOnOldKey);
    const payload = {
      paymentId: event.paymentId,
      amountUsd: event.amountUsd,
      customerEmail: event.customerEmail,
      oldKeyLabel: input.oldKeyLabel,
      deploymentsStillOnOldKey
    };
    const signature = signNotification(payload, secret);

    if (!verifyNotification(payload, signature, secret)) {
      throw new Error("Notification signature verification failed");
    }

    return {
      notificationId: randomUUID(),
      type: decision.type,
      action: decision.action,
      signature,
      payload
    };
  });
}
