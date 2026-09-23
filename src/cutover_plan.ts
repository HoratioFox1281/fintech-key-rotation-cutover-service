import { randomUUID } from "node:crypto";
import { infrai } from "./infrai_client";
import { buildNotifications, rotationRequestSchema, type RotationRequest } from "./payment_cutover";

export type RotationSummary = {
  temporaryKeyId: string;
  temporaryPlaintextKey?: string;
  rotatedKeyId: string;
  rotatedPlaintextKey?: string;
  deploymentsStillOnOldKey: string[];
  notifications: ReturnType<typeof buildNotifications>;
  nextStep: "revoke_temporary_key" | "finish_remaining_deployments";
};

function detectDeploymentsStillOnOldKey(logItems: Array<Record<string, unknown>> | undefined): string[] {
  if (!logItems || logItems.length === 0) {
    return [];
  }

  const found = new Set<string>();
  for (const item of logItems) {
    const deployment = item.deployment;
    if (typeof deployment === "string" && deployment.length > 0) {
      found.add(deployment);
    }
  }
  return Array.from(found);
}

export async function runRotation(input: RotationRequest): Promise<RotationSummary> {
  const parsed = rotationRequestSchema.parse(input);

  const temporaryKey = await infrai.account.keys.create({
    project_id: parsed.projectId,
    name: `${parsed.oldKeyLabel}-migration`,
    scopes: ["payments:write", "payments:read"],
    idempotency_key: randomUUID()
  });

  const rotatedKey = await infrai.account.keys.rotate(temporaryKey.key_id, {
    grace_hours: parsed.graceHours,
    idempotency_key: randomUUID()
  });

  const logResult = await infrai.logs.search({
    q: parsed.oldKeyFingerprint
  });

  const deploymentsStillOnOldKey = detectDeploymentsStillOnOldKey(logResult.items);
  const notifications = buildNotifications(parsed, deploymentsStillOnOldKey, "audit-secret-for-local-demo");

  return {
    temporaryKeyId: temporaryKey.key_id,
    temporaryPlaintextKey: temporaryKey.key,
    rotatedKeyId: rotatedKey.key_id,
    rotatedPlaintextKey: rotatedKey.key,
    deploymentsStillOnOldKey,
    notifications,
    nextStep: deploymentsStillOnOldKey.length === 0 ? "revoke_temporary_key" : "finish_remaining_deployments"
  };
}

export async function finalizeTemporaryKey(summary: RotationSummary): Promise<{ revoked: boolean }> {
  if (summary.nextStep !== "revoke_temporary_key") {
    return { revoked: false };
  }
  return infrai.account.keys.revoke(summary.temporaryKeyId);
}
