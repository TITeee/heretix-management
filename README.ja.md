# heretix-management

脆弱性管理コンソール。[heretix-cli](../heretix-cli) で収集したサーバのパッケージ情報をインポートし、heretix-api を使って脆弱性を検出・追跡・対応管理する Web アプリケーション。

![Alert Management](docs/alerts.png)

## 機能

- **ダッシュボード** — Overview / Tags の2タブ構成
  - **Overview** — 総アセット数・アラート数（直接/間接依存の内訳付き）・重要度別サマリー、タグ別重要度ドーナツチャート（Internet Facing / Public Endpoint）、アラートトレンド（8週）、脆弱アセット Top 10・脆弱パッケージ Top 10、KEV ハイライト
  - **Tags** — タグに紐づくパッケージ・アセットを重要度カラーのカードで一覧表示
- **アセット管理** — `inventory.json` または **CycloneDX BOM** インポート（差分更新、スコープ付き npm / Go モジュール / OS パッケージの PURL パース対応）、ホスト一覧・詳細表示、アセット編集・削除
- **依存グラフ** *（Beta）* — アセット詳細の **Dependency Graph** タブで脆弱パッケージとその依存元パッケージを可視化（1〜8ホップ選択可）。dagre による自動レイアウト。脆弱=赤、直接依存=青。lockfile ベースの依存データが必要（npm/pnpm は完全対応、Go・PyPI は部分対応）。heretix-cli の SBOM・inventory.json に加え、Syft・trivy・cdxgen 等の標準 CycloneDX SBOM にも対応
- **手動アセット登録** — ネットワーク機器・FW を GUI から直接登録
- **タグ** — アセット・パッケージ向けにカラーコード付きタグを作成（例: "Internet Facing"、"Public Endpoint"）。アセット・パッケージ詳細ページから割り当て、Tags ページとダッシュボードでタグごとの重要度集計を確認可能
- **手動パッケージ管理** — パッケージマネージャ外でインストールしたソフトウェアを手動で追加・編集・削除。Advisory タブで Fortinet / Palo Alto Networks / Sophos / Oracle / Splunk 製品をドロップダウン選択して登録可能
- **パッケージ更新履歴** — インポート時の追加・更新・削除の変更履歴をアセット詳細で参照
- **脆弱性スキャン** — heretix-api のバッチ検索でアセットの脆弱性を検出・アラート記録（新規 Alert の作成のみ。既存 Alert の更新・自動解決は行わない）。[ossf/malicious-packages](https://github.com/ossf/malicious-packages) によるマルウェアパッケージ検知（`MAL-` アラート）にも対応
- **アラート管理** — ステータス管理（未対応 / 対応中 / 対応済み / 無視）・フィルタ（アセット / ステータス / 重要度 / Tags / **Dependency**（Direct/Indirect））・一括ステータス変更・**CSV / JSON エクスポート**。Direct/Indirect 分類は lockfile ベースの依存データがある場合のみ有効（主に npm/pnpm）。OS パッケージや手動追加パッケージは未分類
- **アラート自動解決** — インポート時にパッケージがアップグレードされた場合、旧バージョンのアラートを自動で解決済みに変更
- **SLA / 期限管理** — CVSS重要度（Critical / High / Medium / Low）ごとにSLA期限を設定可能。CISA KEV 該当アラートには固定の期限を別途適用。検知時に各 Alert の期限を自動計算し、CVSS や KEV ステータスが変わると再計算。Alerts テーブルには **Due** 列とフィルタ（Overdue / Urgent / Warning / OK）を表示し、Alert 詳細パネルにも期限とステータスに応じた色分けを表示。SLA機能自体は Settings から無効化可能（無効化すると Due 列・フィルタは非表示）
- **アラートメタデータ更新** — open / in_progress の全 Alert に対して heretix-api から最新の CVSS スコア・重要度・EPSS・KEV 情報を再取得して更新（新規 Alert の作成は行わない）
- **Alert Activity** — 全アセット・全アラートの変更イベント（検知・ステータス変更・メタデータ更新）を1つのテーブルで一覧表示。イベント種別・アセットでフィルタ可能。Alerts ページの **Activity** ボタンからアクセス
- **アラート詳細** — 行クリックでスライドパネルを表示。Overview・NVD・OSV・Advisory・**Dependents** *（Beta）*（脆弱パッケージへの依存パスをインタラクティブグラフで表示）・Timeline タブ
- **アラート対応履歴** — 検知・ステータス変更・メモ保存（更新者名とメモ内容を記録）・CVSSスコア変更・重要度変更・KEV追加・VEX justification 変更を自動記録し、Timeline タブで時系列表示
- **VEX（Vulnerability Exploitability eXchange）対応** *（Beta）* — Producer・Consumer 両方のワークフローに対応:
  - **エクスポート**（`GET /api/vex`・**Export VEX** ボタン）: justification 付きの Ignored アラートを CycloneDX 1.6 VEX JSON（`not_affected`）として出力。`trivy image myapp --vex vex.json` でスキャン時の誤検知抑制に活用可能
  - **インポート**（`POST /api/vex/import`・**Import VEX** ボタン）: ベンダー公開 VEX や外部ツール生成の CycloneDX VEX を読み込み、マッチするアラートに自動適用。Timeline に `vex_imported` イベントを記録
  - Ignored 設定時に CycloneDX 標準の justification（`code_not_reachable`・`code_not_present`・`requires_configuration` 等）を選択して記録
- **脆弱性検索** — パッケージ名・バージョン・エコシステム、CVE/OSV ID、CPE 2.3 文字列、または **Advisory モード**（Fortinet / Palo Alto Networks / Sophos / Oracle / Splunk のベンダーアドバイザリ検索）で直接検索
- **ユーザー管理** — ユーザーの追加・編集・削除（admin ロールのみ表示・操作可能）
- **監査ログ** — admin 専用ページ。ログイン・ユーザー管理・設定変更・アセット操作を最新 500 件表示。サイドバーの **Audit Log** からアクセス（admin のみ）
- **設定** — タブ構成: **API**（heretix-api 接続 URL・API Token 設定・疎通確認）、**Notifications**（Slack Webhook — 新規検知・重要度変更・新規KEV検出時に通知。最小重要度・アセットタグでフィルタ可能、テスト送信ボタンあり）、**SLA**（有効/無効切替・期限設定）、**About**（バージョン情報）
- **定期実行** — サーバー起動時に node-cron でスケジューラを起動。Refresh Metadata（デフォルト 12:00 UTC）→ Run Scan 全アセット（デフォルト 13:00 UTC）を毎日自動実行。`CRON_REFRESH` / `CRON_SCAN` 環境変数で時刻変更可能
- **構造化ログ** — スキャン進捗（開始・完了・失敗）および認証イベント（ログイン成功・失敗）を JSON 形式で標準出力に記録。Docker 運用時は `docker logs` で収集可能

## セットアップ

### Option A: Docker（推奨）

**前提条件:** Docker、Docker Compose

1. プロジェクトルートに `.env` を作成:
   ```env
   # 必須
   AUTH_SECRET="your-secret-key"   # 生成コマンド: openssl rand -base64 32
   AUTH_URL="http://your-server-ip:3000"  # サーバーの実際の IP/ドメインに変更
   POSTGRES_PASSWORD="changeme"

   # 任意（Settings 画面からも設定可能）
   HERETIX_API_URL="http://localhost:5000"
   HERETIX_API_KEY=""

   # 定期実行スケジュール（cron 式、UTC — 分 時 日 月 曜日）:
   #   CRON_REFRESH — 既存 Alert の CVSS・重要度・EPSS・KEV を再取得（デフォルト 12:00）
   #   CRON_SCAN    — 全アセットをスキャンして新規脆弱性を検出。Refresh の後に実行（デフォルト 13:00）
   CRON_REFRESH="0 12 * * *"
   CRON_SCAN="0 13 * * *"
   ```

2. ビルドと起動:
   ```bash
   docker compose build
   docker compose up -d
   docker compose logs -f app
   ```
   コンテナ起動時にデータベースのマイグレーションが自動で適用されます。

3. 初回セットアップ（初回のみ）— 管理ユーザーとデフォルトタグの作成:
   ```bash
   docker compose exec app node_modules/.bin/tsx prisma/seed.ts
   # デフォルト: admin@example.com / changeme
   # カスタム: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass docker compose exec app node_modules/.bin/tsx prisma/seed.ts
   # 作成されるデフォルトタグ: "Internet Facing"（asset）、"Public Endpoint"（package）
   ```

`http://localhost:3000` を開いてログイン。

**よく使うコマンド:**
```bash
docker compose down         # 停止
docker compose down -v      # 停止＋DBボリューム削除（完全リセット）
docker compose logs -f app  # ログ確認
```

### Option B: 手動セットアップ（ネイティブ PostgreSQL）

**前提条件:** Node.js 20+、pnpm、PostgreSQL（`heretix_management` データベースを作成済み）、[heretix-api](../heretix-api) が起動済み（デフォルト: `http://localhost:5000`）

1. **依存パッケージのインストール**
   ```bash
   pnpm install
   ```

2. **環境変数の設定** — `.env.local` を作成:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/heretix_management?schema=public"
   AUTH_SECRET="your-secret-key"
   AUTH_URL="http://localhost:3000"
   # heretix-api の URL とトークンは Settings 画面から DB に保存可（環境変数はフォールバック）
   HERETIX_API_URL="http://localhost:5000"
   HERETIX_API_KEY="your-api-token"
   # 定期実行スケジュール（cron 式、UTC — 分 時 日 月 曜日）:
   #   CRON_REFRESH — 既存 Alert の CVSS・重要度・EPSS・KEV を再取得（デフォルト 12:00）
   #   CRON_SCAN    — 全アセットをスキャンして新規脆弱性を検出。Refresh の後に実行（デフォルト 13:00）
   CRON_REFRESH="0 12 * * *"
   CRON_SCAN="0 13 * * *"
   ```

3. **Prisma クライアント生成**
   ```bash
   pnpm exec prisma generate
   ```

4. **DBスキーマ反映**
   ```bash
   pnpm exec prisma db push
   ```

5. **管理ユーザーとデフォルトタグの作成**（初回のみ）
   ```bash
   pnpm seed
   # デフォルト: admin@example.com / changeme
   # カスタム: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass pnpm seed
   # 作成されるデフォルトタグ: "Internet Facing"（asset）、"Public Endpoint"（package）
   ```

6. **サーバー起動**
   ```bash
   pnpm dev
   ```
   `http://localhost:3000` でサーバーが起動します。

## アップグレード（オンプレ環境）

スキーマ変更やデフォルトタグ更新を含むアップデートを取り込む場合:

```bash
# 1. 最新コードを取得
git pull

# 2. 依存パッケージのインストール（変更がある場合）
pnpm install

# 3. Prisma クライアントの再生成
pnpm exec prisma generate

# 4. DBスキーマの反映
pnpm exec prisma db push

# 5. デフォルトタグの更新（新規作成・旧タグの isDefault 解除）
pnpm seed

# 6. 開発サーバーの再起動
pnpm dev
```

> **注意:** Docker 環境ではコンテナ起動時に `prisma migrate deploy` が自動でスキーマとタグを更新するため、seed の再実行は不要です。

## 使い方

### 1. アセットの登録

**サーバー・VM（heretix-cli 経由）:**
1. サイドバーの **Assets** → **Import inventory.json** を開く
2. heretix-cli で生成した `inventory.json` をアップロード
3. パッケージが差分インポートされる（再インポート時は追加・更新・削除のみ処理）
4. 手動追加パッケージは再インポート後も保持される

**ネットワーク機器・FW（手動登録）:**
1. サイドバーの **Assets** → **Add Manually** を開く
2. Name・Hostname・Type を入力して **Create Asset**
3. アセット詳細ページで **Add Package** → **Advisory タブ** を選択
   - Vendor（Fortinet / Palo Alto Networks / Sophos / Oracle / Splunk）と製品名をドロップダウンで選択し、バージョンを入力
4. **Run Scan** で脆弱性を検出（heretix-api の Vendor Advisory データを使用）
5. ファームウェアアップデート後はパッケージの **Edit** でバージョンを変更して再スキャン

### 2. 手動パッケージの追加

1. アセット詳細ページのパッケージテーブル右上の **Add Package** をクリック
2. タブを選択して入力:
   - **General** — パッケージ名・バージョン・エコシステムを入力（Linux/npm/PyPI/Go/Packagist 等）
   - **Advisory** — Vendor（Fortinet / Palo Alto Networks / Sophos / Oracle / Splunk）と製品名をドロップダウンで選択し、バージョンを入力（FW・ネットワーク機器向け）
   - **CPE** — CPE 2.3 文字列を直接入力
3. `manual` バッジが付いたパッケージは編集・削除が可能
4. Alerts 列のバッジをクリックするとそのパッケージのアラート一覧に遷移

### 3. 脆弱性スキャン

1. アセット詳細ページを開く
2. **Run Scan** ボタンをクリック
3. heretix-api が全パッケージ（手動追加含む）をチェックし、アラートが生成される

### 4. アラート対応

1. サイドバーの **Alerts** でアラート一覧を確認
2. **フィルタ**（Asset / Status / Severity / Tags / Dependency / Due）で絞り込み（複数値の同時選択可）
3. チェックボックスで複数選択 → ステータスを一括変更可
4. アラート行をクリックすると詳細パネルが開く
   - **Overview** タブ — 基本情報（修正バージョン（**Fixed in**）が存在する場合は表示）、ステータス変更、メモ記入、自動解決理由
   - **NVD** タブ — CVSS 詳細スコア、CWE、CISA KEV 情報、参照リンク一覧
   - **OSV** タブ — 詳細説明、影響バージョン一覧、参照リンク一覧
   - **Advisory** タブ — ベンダーアドバイザリ ID・重要度・影響製品とバージョン（Advisory データが存在する場合のみ表示）
5. ステータスを `Open` → `In Progress` → `Resolved` / `Ignored` に変更して追跡
   - **Ignored** に設定する際は **VEX Justification** を選択（例: `code_not_reachable`）して判断根拠を記録
6. **Refresh Metadata** ボタンで heretix-api の最新データをアラートに同期
7. **Export VEX** ボタンで justification 付きの Ignored アラートを CycloneDX VEX JSON（`not_affected`）として出力 → `trivy --vex vex.json` でスキャン時の誤検知を抑制
8. **Import VEX** ボタンでベンダー公開 VEX や外部生成 VEX を読み込み、マッチするアラートに自動適用

> **Run Scan と Refresh Metadata の違い:**
> | | Run Scan | Refresh Metadata |
> |---|---|---|
> | 対象 | 特定の1アセットのパッケージ | 全 Alert（open / in_progress） |
> | 操作 | パッケージ一覧を heretix-api でバッチ検索 | 既存 Alert の externalId で再検索 |
> | 結果 | 新しい Alert を**作成** | 既存 Alert のスコア・重要度等を**更新** |
> | 用途 | 新たな脆弱性の検出 | CVE スコア改訂・KEV 追加等への追従 |

### 5. 脆弱性検索

サイドバーの **Search** でパッケージ名・バージョン・エコシステム、CVE/OSV ID、CPE 2.3 文字列を指定して直接検索。**Advisory モード**ではベンダーと製品を選択して Fortinet / Palo Alto Networks / Sophos / Oracle / Splunk のアドバイザリを検索可能。

## ディレクトリ構成

```
heretix-management/
├── app/
│   ├── (console)/              # 認証後のコンソール画面
│   │   ├── layout.tsx          # サイドバー + トップバー
│   │   ├── page.tsx            # ダッシュボード（Overview / Tags タブ）
│   │   ├── assets/             # アセット一覧・詳細・インポート・手動登録
│   │   ├── alerts/             # アラート一覧
│   │   ├── users/              # ユーザー管理（admin のみ）
│   │   ├── search/             # 脆弱性検索
│   │   ├── tags/               # タグ管理（一覧・作成・編集・削除）
│   │   └── settings/           # 設定（API / Notifications / SLA / About タブ）
│   ├── api/                    # API ルート
│   │   ├── assets/
│   │   ├── alerts/
│   │   ├── users/
│   │   ├── search/
│   │   ├── tags/
│   │   └── settings/
│   └── login/                  # ログインページ
├── components/
│   ├── ui/                     # shadcn/ui コンポーネント（severity-badge 含む）
│   ├── layout/                 # サイドバー・トップバー
│   ├── data-table/             # 共通 DataTable・ファセットフィルタ
│   ├── dashboard/              # ダッシュボード用チャートコンポーネント（critical-packages-card, production-assets-card 含む）
│   └── assets/                 # アセット用カラム定義
├── instrumentation.ts          # サーバー起動時にスケジューラを初期化
├── lib/
│   ├── auth.ts                 # Auth.js 設定
│   ├── db.ts                   # Prisma クライアント
│   ├── severity.ts             # 重要度・ステータスのカラー定数・ヘルパー
│   ├── heretix-api.ts          # heretix-api クライアント
│   ├── logger.ts               # 構造化 JSON ログユーティリティ
│   ├── scan.ts                 # スキャンロジック（ルートハンドラ・スケジューラ共用）
│   ├── refresh.ts              # メタデータ更新ロジック（同上）
│   ├── sla.ts                  # SLA期限の計算・ステータス判定ヘルパー
│   ├── advisory-products.ts    # Advisory タブ用のベンダー・製品リスト
│   └── scheduler.ts            # node-cron によるスケジュール定義
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── middleware.ts               # 認証ガード
```

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/assets` | アセット一覧 |
| POST | `/api/assets` | アセット作成・更新（inventory.json または CycloneDX BOM、差分インポート） |
| GET | `/api/assets/[id]` | アセット詳細 |
| PATCH | `/api/assets/[id]` | アセット情報更新（name / hostname / osName / osVersionId） |
| DELETE | `/api/assets/[id]` | アセット削除 |
| POST | `/api/assets/[id]/scan` | 脆弱性スキャン実行 |
| POST | `/api/assets/[id]/packages` | 手動パッケージ追加 |
| PATCH | `/api/assets/[id]/packages/[pkgId]` | 手動パッケージ編集 |
| DELETE | `/api/assets/[id]/packages/[pkgId]` | 手動パッケージ削除 |
| GET | `/api/alerts` | アラート一覧 |
| PATCH | `/api/alerts/[id]` | アラートのステータス・メモ更新 |
| GET | `/api/alerts/[id]/events` | アラートイベント履歴一覧 |
| POST | `/api/alerts/refresh` | アラートメタデータを heretix-api から一括更新 |
| GET | `/api/alerts/events` | 全アラートイベント一覧 |
| GET | `/api/alerts/[id]/dependents` | 脆弱パッケージへの依存パス一覧（npm/pnpm） |
| GET | `/api/assets/[id]/dependency-graph` | 依存グラフのノード・エッジデータ |
| GET | `/api/vex` | CycloneDX VEX JSON エクスポート（`?assetId=`、`?download=true`） |
| POST | `/api/vex/import` | CycloneDX VEX をインポートしてアラートに自動適用 |
| GET | `/api/search` | 脆弱性検索（heretix-api プロキシ） |
| GET | `/api/tags` | タグ一覧 |
| POST | `/api/tags` | タグ作成 |
| GET | `/api/tags/[id]` | タグ詳細（紐づくアセット・パッケージ含む） |
| PATCH | `/api/tags/[id]` | タグ更新 |
| DELETE | `/api/tags/[id]` | タグ削除 |
| POST | `/api/tags/[id]/assets` | アセットへタグを割り当て |
| POST | `/api/tags/[id]/packages` | パッケージへタグを割り当て |
| GET | `/api/settings` | 設定取得 |
| PATCH | `/api/settings` | 設定更新 |
| POST | `/api/settings/test` | heretix-api 疎通確認 |
| POST | `/api/settings/slack-test` | Slack テスト通知送信 |
| GET | `/api/settings/sla` | SLA設定取得 |
| POST | `/api/settings/sla` | SLA設定更新 |
| GET | `/api/users` | ユーザー一覧（admin のみ） |
| POST | `/api/users` | ユーザー作成（admin のみ） |
| PATCH | `/api/users/[id]` | ユーザー更新（admin のみ） |
| DELETE | `/api/users/[id]` | ユーザー削除（admin のみ） |

## ライセンス

Apache License 2.0 — 詳細は [LICENSE](LICENSE) を参照してください。
