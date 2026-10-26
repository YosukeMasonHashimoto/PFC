/** Use configured origins only; client Host headers must never control auth redirects. */
export function appOrigin() {
  const deploymentHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return new URL(
    process.env.APP_URL ||
      (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000"),
  ).origin;
}
