import { loginErrors } from "@/lib/auth-errors";
import { SubmitButton } from "@/components/submit-button";
import { login } from "./actions";
import { configured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const q = await searchParams;
  return (
    <main className="login card">
      <span className="eyebrow">BUILD YOUR EVERYDAY</span>
      <h1>PFC Tracker</h1>
      <p>毎日の積み重ねを、数字で見えるように。</p>
      <h2>メールでログイン</h2>
      <p>ログインリンクを送信します。パスワードは不要です。</p>
      {!configured() && (
        <p role="alert">
          Supabase の設定が必要です。.env.example と README を参照してください。
        </p>
      )}
      {q.error && (
        <p role="alert">{loginErrors[q.error] || loginErrors.send}</p>
      )}
      {q.sent && (
        <p role="status">
          メールを送信しました。メール内のリンクを開いてください。
        </p>
      )}
      <form action={login}>
        <label>
          メールアドレス
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <SubmitButton disabled={!configured()}>
          ログインリンクを送る
        </SubmitButton>
      </form>
      <small>オンラインでの記録専用 · 個人のデータは本人のみ閲覧できます</small>
    </main>
  );
}
