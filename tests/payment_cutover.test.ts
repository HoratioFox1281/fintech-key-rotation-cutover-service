import { describe, expect, it } from "vitest";
import { buildNotifications, decidePaymentAction, verifyNotification } from "../src/payment_cutover";

describe("payment cutover decisions", () => {
  it("holds settlement for a high-risk captured payment while old key deployments remain", () => {
    const decision = decidePaymentAction(
      {
        paymentId: "pay_1001",
        amountUsd: 4200,
        currency: "USD",
        status: "captured",
        riskLevel: "high",
        customerEmail: "ops@example.com"
      },
      ["web-1", "jobs-2"]
    );

    expect(decision).toEqual({
      type: "payment.captured.requires_review",
      action: "hold_settlement"
    });
  });

  it("signs an audit notification that verifies against the same payload", () => {
    const [notification] = buildNotifications(
      {
        projectId: "payments-prod",
        oldKeyLabel: "stripe-bridge-key",
        oldKeyFingerprint: "old-key-fragment-42",
        graceHours: 12,
        affectedDeployments: ["web-1", "jobs-2"],
        paymentEvents: [
          {
            paymentId: "pay_1001",
            amountUsd: 4200,
            currency: "USD",
            status: "captured",
            riskLevel: "high",
            customerEmail: "ops@example.com"
          }
        ]
      },
      ["web-1", "jobs-2"],
      "audit-secret-for-local-demo"
    );

    expect(notification.action).toBe("hold_settlement");
    expect(notification.type).toBe("payment.captured.requires_review");
    expect(verifyNotification(notification.payload, notification.signature, "audit-secret-for-local-demo")).toBe(true);
  });
});
