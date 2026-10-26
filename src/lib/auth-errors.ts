export type SendError = { code?: string; status?: number; name?: string };
export function sendErrorReason(error: SendError): string {
  if (
    error.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code || "",
    )
  )
    return "rate_limit";
  if (error.code === "email_address_not_authorized") return "email_restricted";
  if (error.code === "email_address_invalid") return "email";
  if (error.status === 401 || error.code === "bad_jwt") return "config";
  if (error.name === "AuthRetryableFetchError") return "connection";
  return "send";
}
export const loginErrors: Record<string, string> = {
  expired:
    "リンクが無効または期限切れです。ログインを始めた同じブラウザから、もう一度お試しください。",
  rate_limit:
    "メール送信の回数制限に達しました。続けて送信せず、時間をおいてお試しください。",
  email_restricted:
    "現在のメール送信設定では、この宛先に送信できません。管理者による送信設定（カスタムSMTPなど）の変更が必要です。",
  email:
    "メールアドレスの形式、またはメールサービス側の宛先制限を確認してください。",
  config:
    "認証サービスの接続設定に問題があります。管理者が公開環境のSupabase URLと公開キーを確認する必要があります。",
  connection:
    "認証サービスに接続できませんでした。しばらく待って再試行してください。",
  send: "メールを送信できませんでした。メール送信サービスの設定確認が必要です。管理者にこの画面をお知らせください。",
};
