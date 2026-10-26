"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login card">
      <h1>読み込みできませんでした</h1>
      <p>ネットワーク接続を確認し、再試行してください。</p>
      <button onClick={reset}>再試行</button>
    </main>
  );
}
