import { finalizeTemporaryKey, runRotation } from "./cutover_plan";

async function main(): Promise<void> {
  const summary = await runRotation({
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
      },
      {
        paymentId: "pay_1002",
        amountUsd: 1800,
        currency: "USD",
        status: "authorized",
        riskLevel: "low",
        customerEmail: "ops@example.com"
      }
    ]
  });

  const revokeResult = await finalizeTemporaryKey(summary);

  console.log(JSON.stringify({ summary, revokeResult }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
