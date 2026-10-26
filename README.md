# PFC Tracker

筋肥大を目指す人のための、日本語・モバイル優先の栄養記録PWA。Next.js App Router / React / strict TypeScript / Tailwind CSS / shadcn/ui形式のButton / Lucide / Supabase SSR / Zod / decimal.js を使用しています。

## 起動

Node.js 22.13以上（この環境では24.19で検証）、npm、Supabaseプロジェクトを用意します。

```bash
npm ci
cp .env.example .env.local
# .env.local の3項目を設定
npm run dev
```

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 公開可能なpublishable key。既存プロジェクトのanon keyも使用可能です。
- `APP_URL`: ブラウザでアクセスする正確なオリジン。ローカルは `http://localhost:3000`、本番は `https://your-domain.example`。末尾のパスは使用しません。認証リダイレクト・送信元の検証に使います。`localhost` と `127.0.0.1` は別のオリジンです。

未設定の場合はセットアップ案内を表示し、偽の記録・認証成功やブラウザ内だけの保存には切り替えません。メール認証・クラウド同期には実際のSupabase設定が必要です。

## Supabaseセットアップ・マイグレーション

1. Supabaseプロジェクトを作成し、Project URLとpublishable keyを取得します。
2. SQL Editorで [初期マイグレーション](supabase/migrations/202610260001_initial.sql) 全文を一度実行します。8テーブル・制約・RLS・RPC・新規ユーザー初期化トリガーを作成します。既存ユーザーも初期化します。再実行用のSQLではありません。
3. CLIで管理する場合は別途公式Supabase CLIを用意し、リポジトリで `supabase init`、`supabase link --project-ref YOUR_PROJECT_REF`、`supabase db push` を実行してください。SQL Editor適用とCLI適用を重複させないでください。既存のテーブル名が衝突するプロジェクトでは事前に内容を確認してください。
4. Authentication → ProvidersでEmailを有効にします。
5. Authentication → URL ConfigurationでSite URLを `APP_URL` と一致させ、Redirect URLsにローカルと本番の `/auth/confirm` URLを登録します。不要なワイルドカードは使いません。
6. 標準メールテンプレート（`{{ .ConfirmationURL }}`）をそのまま使用できます。アプリはPKCEの `code` をサーバーでセッションへ交換します。ログインを開始した同じブラウザでメールリンクを開いてください。無料プランの標準メール送信ではテンプレート変更が制限されます。カスタムSMTP等で変更可能な場合のみ、以下のtoken_hash形式も使用できます。

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">PFC Trackerにログイン</a>
```

7. 本番利用では独自SMTP・送信元ドメインを設定し、メール到達性とSupabaseの送信制限・認証レート制限を確認します。初期1名運用では登録後に新規ユーザー登録を無効化する運用も推奨します。
8. メールアドレスを入力し、届いたリンクを同じブラウザで開きます。初回はプロフィールと107g / 70g / 335g / 2,400kcalの初期目標が自動生成されます。

Supabaseの実プロジェクトに初期マイグレーションを適用済みです。接続・8テーブルのRLS・認証設定を管理APIから検証しています。実メール到達と実ユーザーの認証完了は未検証です。アプリ用にservice_roleキーは必要ありません。

## 使い方

- **ホーム / 履歴**: 日付を選び、摂取量・目標・残量・達成率、朝昼夕・間食を表示。超過は負の残量を隠さず「超過」と表示します。
- **食品**: 名称・ブランド検索、手動登録・編集・削除、100gあたりのP/F/C/表示カロリー、出典・版・エネルギー根拠、複数のポーションを登録。例としてご飯は「ご飯（炊飯後）」と明記してください。
- **食品を記録**: グラムまたは食品固有のポーションで分量を指定し、栄養プレビューを確認。お気に入り・最近使った食品でも絞り込めます。
- **編集**: 日時・食事区分のみの変更では元の栄養値を保持。食品か重量を変更したときだけ現在の食品値で再計算します。削除済み食品の記録は日時・区分の変更、または別食品への変更が可能です。
- **設定**: 日付ごとの目標を保存。同じ開始日は上書きし、過去日はその日以前の最新目標を参照します。PFCとkcalは独立です。
- **テンプレート**: 名称と複数食品・グラム数を保存し、指定日時・食事区分へ一括記録。DBトランザクションにより部分成功を防ぎます。不要なテンプレートは削除して作り直せます。
- **同期**: サーバーへの保存後、およびタブが再表示された際にDBを再取得します。常時のRealtime購読は行いません。

## 設計とセキュリティ

- 全8テーブルでRLSを有効化。所有者IDは検証済みセッションの `auth.uid()` から決定します。子テーブルも親の閲覧・所有権を検証します。
- RPCは `SECURITY INVOKER`。初期化トリガーのみ `SECURITY DEFINER` とし、固定 `search_path`、修飾テーブル名を使用します。匿名のテーブル・RPCアクセス権限を剥奪しています。
- 他人の非公開食品は、お気に入り・食事・テンプレートから参照できません。UIで取得可能な食品に限定し、DBのRLSとトリガーでも検証します。
- 共有食品（owner_id null）は認証済みユーザーのみ閲覧可能。変更・ポーション追加は管理者SQL等の信頼された経路のみです。所有者の付け替えは禁止しています。
- 食事の栄養値・出典・名称はDBトリガーで確定。食品マスターの変更で過去を再計算せず、食品削除後も履歴を保持します。アプリから渡された計算値を信用しません。
- サーバーでZod検証、DBでNOT NULL・数値範囲・外部キー・一意制約。欠損値・空文字・nullを栄養値0へ補完しません。量の0・負数・非有限値を拒否します。
- DBのnumericとdecimal.jsで中間丸めを避け、表示のみ小数1桁へ丸めます。大きな数値をJavaScriptのJSONとして受信するため、表示時の最終桁精度はブラウザ数値精度の制約を受けます。
- 日時はtimestamptzで保存し、`local_date` はDBで算出。MVPではプロフィールのタイムゾーンをAsia/Tokyoに固定しています。入力欄も日本時間を明示し、端末タイムゾーンに依存させません。
- SSR認証は `@supabase/ssr` のcookie連携とNext.js 16の `proxy.ts`。`getUser()` でAuthサーバーへ照会し、セッションcookieだけを信用しません。更新cookieとSDKのキャッシュヘッダーを引き継ぎます。
- 変更APIは `APP_URL` とのOrigin一致を必須とし、認証後にZod検証した操作のみRPCへ渡します。Server ActionsにはNext.jsの標準Origin検証も適用されます。DOMでHTML挿入は行いません。
- `.env*` は `.env.example` 以外をGit除外。service_role・SMTP秘密鍵を `NEXT_PUBLIC_*` に入れないでください。ログにトークン・メール本文・秘密値を出力しません。
- ホスティングのHTTPSを必須とし、認証コールバックURL、Supabase RLS、バックアップ、SMTP/レート制限を本番公開前に確認してください。

## 食品データとライセンス

このMVPには公的食品データやメーカー栄養値を同梱していません。文科省食品成分表の取得・加工・再配布条件を未確認のため、P1の一括取り込みは実装していません。`supabase/seed.sql` は意図的に食品を投入しません。

食品は実際の商品表示や確認済みの一次資料から手動登録し、出典・版・食品コードを残してください。`mext` を選んでも公式データとして検証されたことにはなりません。推定食品は画面で明示します。皮・生/加熱・炊飯前後の区別を食品名に含め、ポーションの重量を食品ごとに確認してください。

テストファイル内の栄養値は架空のテストフィクスチャです。本番シードへ転用しないでください。ライセンスの未確認な外部データや架空の「公式」データは追加していません。

## PWA・iPhone

本番のHTTPS URLをSafariで開き、共有 → 「ホーム画面に追加」を選択します。Manifest、192/512pxアイコン、maskableアイコン、180px Apple Touch Icon、Apple用meta情報を実装しています。HTTPSはVercel等で提供してください。

Service Workerはアイコンと汎用オフライン案内のみをキャッシュ。HTML・API・認証・個人の記録を保存しません。オフライン編集・同期は非対応です。iOS実機でのインストールは公開後に確認してください。

## Vercel公開チェックリスト

- [ ] このリポジトリをVercelに接続し、Framework PresetをNext.jsに設定
- [ ] 上記3環境変数を設定（Preview環境は必要に応じて別Supabaseプロジェクト）
- [ ] 独自ドメインまたは固定Vercel URLを `APP_URL` に指定
- [ ] Supabaseマイグレーション、Emailテンプレート、Site URL、Redirect URLsを設定
- [ ] HTTPS環境でメール認証・ログアウト、iPhone/Mac間のデータ共有を実確認
- [ ] 別の2ユーザーで相互に記録が見えないことを実確認
- [ ] iPhoneでホーム画面追加、ポーション記録、日時修正を実確認
- [ ] 本番SMTP、レート制限、新規登録の可否、DBバックアップを確認

## テスト

```bash
npm run lint
npm run typecheck
npm test
npm run build
# 初回のみブラウザを導入（Chromiumが既にあれば下の環境変数を使用）
npx playwright install chromium
npm run test:e2e
# 既存のLinux Chromiumを使う例
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

- Vitest: 100g/300g/登録ポーション換算、精度、超過、0目標、日時境界、入力検証。
- DB統合: PGlite（実PostgreSQLのWASM版）にマイグレーション全文を適用。auth.usersとauth.uidだけを最小定義で再現し、RLSの肯定・否定系、共有食品、スナップショット、日付修正、目標履歴、一括登録ロールバックを実行します。
- Playwright: 幅390px・端末は米国時間に設定。Next.js実サーバーとPGliteをつなぐ**テスト専用Supabase HTTPアダプター**で食品・ポーション・お気に入り・最近利用・食事・履歴・目標・テンプレート・削除・認証保護・Origin検証を操作します。認証レスポンスはテスト用で、実メール送信や実SupabaseのJWT検証を確認するものではありません。アダプターはアプリの本番起動経路から使用されません。
- `test-results/mobile-dashboard.png` にブラウザ検証時の画面を出力します（Git除外）。

Supabaseホストへの実接続テストとiOS実機検証は別途必要です。テストに秘密鍵や本番データは不要です。

## 実装範囲と仮定

**P0実装済み:** メールリンクSSR認証/ログアウト、4指標の進捗、食品CRUD/検索/ポーション/出典、お気に入り/最近利用、食事CRUD/栄養スナップショット、日付履歴、適用日付き目標、複数食品テンプレート/一括記録、RLSによる個人データ保護、オンラインDB保存、PWA基本構成、日本語レスポンシブUI、エラー/送信中/保存完了表示。

**制限・未実装:** 実外部サービス設定、iOS実機確認、公的食品取り込み、テンプレートの直接編集（削除・再作成で対応）、タイムゾーン変更、常時Realtime、履歴のページネーション。初期1名のMVPとして本人の全記録を取得するため、大量データ運用前には日付範囲取得・検索索引を追加してください。P2のAI・写真/OCR・バーコード・HealthKit・オフライン編集・通知・課金は対象外です。

**最小仮定:** 日付は常に日本時間、初期目標は全過去日に適用できる基準日0001-01-01として保持、同じ開始日の目標保存は上書き、テンプレートは食品削除時に該当項目も削除（空テンプレートの適用は拒否）。量/栄養値には異常値を防ぐ上限100,000を設定。アカウント削除は管理操作です。

## バージョン・公式資料

実装時にnpmのlatestを照会し、Next.js 16.4.3、React 19.3.1、Supabase JS 2.118.0、SSR 0.12.7、Vitest 5.0.5を確認して導入しました。再現は `package-lock.json` と `npm ci` を使用してください。PWA追加パッケージは不要なため、Next.js標準Manifestと素のService Workerを使用しています。

- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase email passwordless](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [shadcn/ui Next.js](https://ui.shadcn.com/docs/installation/next)
- [React versions](https://react.dev/versions)

この環境ではドキュメントサイトへのアクセスが403だったため、Next.js / Supabase SSR / shadcn/ui / Reactの公式GitHub上のドキュメントも参照しました。TypeScriptとSupabase WebAuthn宣言の衝突を避けるため、Next.js標準設定に合わせ `skipLibCheck` を有効にしています。アプリコードのstrict型検査は有効です。

## Codexクラウド環境

既存の `/workspace/PFC` チェックアウトで作業します。タスクごとに環境が分離されるため、明示的な依頼がなければworktreeは作成しません。依存関係キャッシュは書き込み可能な `/workspace/.npm-cache` を利用できます。

Supabaseの接続先が決まったら、環境設定に公開用の上記3変数を入力し、ネットワーク許可リストに**自分のプロジェクトのホスト**（`<project-ref>.supabase.co`、カスタムドメイン利用時はそのホスト）を追加してください。接続先が未定のため、広いワイルドカード許可は追加していません。

## この環境での検証結果

- `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`: 成功（ロックファイルから再インストール）
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- `npm test`: **27件成功**（計算・バリデーション・実PostgreSQLマイグレーション/RLS）
- `npm run test:e2e`: **1シナリオ成功**（モバイル/デスクトップの主要操作を通しで検証、テスト専用認証アダプター使用）
- `npm run build`: 成功

実Supabase・実メール・実機PWA・Vercel公開については上記チェックリストに沿った設定と確認が必要です。

認証コールバックは標準メールのPKCE codeとカスタムメールのtoken_hashの両方に対応します。ブラウザE2EにはPKCEのcookie保持・コード交換・不正コード拒否を含みます。

## 実Supabase接続後の確認

初期マイグレーション適用済み。実プロジェクトのAuth health 200、8テーブルすべてのRLS有効化、匿名tracker_data RPCの401/42501による拒否を確認しました。Site URLと許可コールバックを設定済みです。同じDBに初期SQLを重複適用しないでください。無料プラン標準メールの本文変更はAPIから拒否されたため、標準テンプレートのPKCEに対応しました。Lint・型検査・27テスト・2ブラウザシナリオ・本番ビルドが成功しています。メールの実到達と実ユーザーによるログイン完了は未検証です。現在のAPP_URLはローカル開発用で、Vercel等への一般公開はまだ行っていません。
