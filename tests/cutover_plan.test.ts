import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, rotate, search, revoke } = vi.hoisted(() => ({
  create: vi.fn(),
  rotate: vi.fn(),
  search: vi.fn(),
  revoke: vi.fn()
}));

vi.mock("../src/infrai_client", () => ({
  infrai: { account: { keys: { create, rotate, revoke } }, logs: { search } }
}));

import { finalizeTemporaryKey, runRotation } from "../src/cutover_plan";

describe("rotation cleanup after a clean log search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ key_id: "temporary-key" });
    rotate.mockResolvedValue({ key_id: "rotated-key" });
    search.mockResolvedValue({ items: [] });
    revoke.mockResolvedValue({ revoked: true });
  });

  it("revokes the temporary key even when affected deployments were supplied", async () => {
    const summary = await runRotation({
      projectId: "payments-prod",
      oldKeyLabel: "old-key",
      oldKeyFingerprint: "fingerprint",
      graceHours: 12,
      affectedDeployments: ["web-1"],
      paymentEvents: [{
        paymentId: "pay-1",
        amountUsd: 100,
        currency: "USD",
        status: "captured",
        riskLevel: "high",
        customerEmail: "chenhua@changba.com"
      }]
    });

    expect(summary.deploymentsStillOnOldKey).toEqual([]);
    expect(summary.nextStep).toBe("revoke_temporary_key");
    expect(await finalizeTemporaryKey(summary)).toEqual({ revoked: true });
    expect(revoke).toHaveBeenCalledWith("temporary-key");
  });
});
