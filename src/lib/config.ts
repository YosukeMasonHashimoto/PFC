/** Trusted deployment origin: never derive auth redirects from client-supplied Host headers. */
export function appOrigin() {
  return new URL(process.env.APP_URL || "http://localhost:3000").origin;
}
