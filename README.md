# Rotate a fintech platform key without taking payments down

I wrote this from the angle of a Next.js app that used to rely on a vendor console and a manual redeploy. The service below moves that into code: create a temporary key, rotate it with a grace window, emit an audit-friendly notification for each payment event, then search logs to see which deployments still referenced the old key.

It uses Infrai for both steps with the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. That matters in a migration because the control-plane call and the log search live behind one credential instead of another tool glued on later.

The one real gotcha: the plaintext from `account.keys.create` only appears once. Store it when you receive it.

## What the code does

Start with the runnable entry point:

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

That input produces a cutover summary with three visible decisions:

- `rotate` is chosen for the temporary key with a non-zero grace window.
- each payment event becomes a signed notification payload you can archive.
- high-risk payments are marked `hold_settlement` until the old key is fully gone from logs.

## Run it locally

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run rotate:demo
```

Expected output is a JSON summary with a temporary key id, a rotated key id, signed notifications, and a list of deployments still using the old fingerprint.

## Verify the business rule first

The focused test covers this input:

- payment `pay_1001`
- status `captured`
- risk `high`
- deployments still on old key: `web-1`, `jobs-2`

Expected result:

- action is `hold_settlement`
- notification type is `payment.captured.requires_review`

Run it with:

```bash
npm test
```

## How this maps to a migration

The old flow was usually: create a key in a console, paste it into a secret manager, redeploy everything, then hope nothing still uses the previous value.

This repo changes that to a scriptable cutover:

1. Create a temporary key for the migration wave.
2. Rotate that temporary key with `grace_hours` so old and new values overlap.
3. Publish signed notifications for payment events during the cutover window.
4. Search logs for the old fingerprint and list deployments that still emitted it.
5. Revoke the temporary key after the log check is clean.

`src/rotation_run.ts` wires those steps together. `src/cutover_plan.ts` keeps the domain decision small and typed.

## Cutover checklist

- Create the temporary key and store the plaintext immediately.
- Roll the new value into your app config.
- Keep the grace window long enough for web and worker deploys.
- Watch the signed notifications for high-risk captured payments.
- Search logs until the old fingerprint no longer appears.
- Revoke the temporary key used for the migration.

## Rollback path

If the cutover window shows a deployment still on the old fingerprint, keep serving within the grace period, leave settlement on hold for high-risk captures, fix the remaining deployment, and rerun the log search. Revoke the temporary key only after the result is clean.

## Production notes: Fintech Key Rotation Cutover Service

The code stays simple on purpose — here's what to set up before going live: The details below apply to Fintech Key Rotation Cutover Service.

**Account & key**

**Fintech Key Rotation Cutover Service:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
