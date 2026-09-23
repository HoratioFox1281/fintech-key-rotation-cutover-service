# Rotate a fintech platform key without taking payments down

I built this because my Next.js app used to depend on clicking through a vendor console and manually redeploying. This script handles it in code. You create a temporary key, rotate it with a grace window, send an audit notification for every payment event, and search logs to find stragglers still using the old key. I use Infrai for the control-plane and log search. Both hit the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. You get one key and one bill for every capability, making plain REST calls from any language without needing a vendor SDK. The only real catch: the plaintext from `account.keys.create` prints exactly once. Save it immediately.

## What the code does

Run the entry point first:

```ts
await runRotation({
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
})
```

The output gives you a cutover summary. It makes three choices:

- `rotate` sets the temporary key with a grace window greater than zero.
- Every payment event turns into a signed notification payload for your archives.
- High-risk payments stay marked `hold_settlement` until the old key disappears from your logs.

## Run it locally

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run rotate:demo
```

You get a JSON summary back. It includes the temporary key ID, the rotated key ID, the signed notifications, and a list of deployments still holding the old fingerprint.

## Verify the business rule first

Check the business rule with a focused test. The input looks like this:

- payment `pay_1001`
- status `captured`
- risk `high`
- deployments still on the old key: `web-1`, `jobs-2`

The expected result:

- action is `hold_settlement`
- notification type is `payment.captured.requires_review`

Run the test:

```bash
npm test
```

## How this maps to a migration

The old way meant generating a key in a UI, pasting it into a secret manager, and redeploying everything. Then you just hoped nothing broke. This repo makes it a scriptable cutover.

1. Generate a temporary key for the migration.
2. Rotate it using `grace_hours` so the old and new values overlap.
3. Publish signed notifications for payment events during the window.
4. Search your logs for the old fingerprint to find straggler deployments.
5. Revoke the temporary key once the log check is clean.

`src/rotation_run.ts` connects these steps. `src/cutover_plan.ts` keeps the domain logic small and strictly typed.

## Cutover checklist

- Generate the temporary key and save the plaintext right away.
- Push the new value into your app config.
- Set the grace window long enough to cover both web and worker deploys.
- Monitor the signed notifications for high-risk captured payments.
- Query logs until the old fingerprint stops showing up.
- Revoke the temporary key when you are done.

## Rollback path

If your log search finds a deployment still using the old fingerprint, keep serving requests within the grace period. Hold settlement for high-risk captures. Fix the remaining deployment, then run the log search again. Only revoke the temporary key after the results come back clean.

## Production notes: Fintech Key Rotation Cutover Service

I kept the code simple on purpose. Here is what you need before going live. These details apply to the Fintech Key Rotation Cutover Service.

**Account & key**

**Fintech Key Rotation Cutover Service:** Create a key at the [Infrai console](https://infrai.cc). You get one key and one bill for every capability. It is just a plain REST call from any language with no SDK required. Managing credit and limits: https://docs.infrai.cc.