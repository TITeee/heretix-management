# heretix-management

脆弱性管理コンソール。[heretix-cli](../heretix-cli) で収集したサーバのパッケージ情報をインポートし、heretix-api を使って脆弱性を検出・追跡・対応管理する Web アプリケーション。

## 技術スタック

| 役割 | 採用技術 |
|---|---|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| UI | Tailwind CSS + shadcn/ui (base-ui) |
| チャート | Recharts |
| テーブル | TanStack Table |
| 認証 | Auth.js v5 (NextAuth) — Credentials Provider |
| ORM | Prisma 7 |
| DB | PostgreSQL |
| パッケージマネージャ | pnpm |

## 機能

- **ダッシュボード** — Overview / Tags の2タブ構成
  - **Overview** — 総アセット数・アラート数・重要度別サマリー、タグ別重要度ドーナツチャート（Production / Development / Staging、各タグカラーのインジケーター付き）、アラートトレンド（8週）、脆弱アセット Top 10・脆弱パッケージ Top 10、KEV（既知悪用脆弱性）ハイライト
  - **Tags** — タグに紐づくパッケージ・アセットを重要度カラーのカードで一覧表示。Critical Packages タグに属するパッケージカード（クリックでアラート一覧へ遷移）、Production / Development / Staging タグのアセットカード（ホスト / Docker Image アイコン付き、クリックでアラート一覧へ遷移）
- **アセット管理** — `inventory.json` または **CycloneDX BOM** インポート（差分更新）、ホスト一覧・詳細表示、アセット編集・削除
- **手動アセット登録** — ネットワーク機器・FW を GUI から直接登録
- **手動パッケージ管理** — パッケージマネージャ外でインストールしたソフトウェアを手動で追加・編集・削除。Advisory タブで Fortinet / Palo Alto Networks 製品をドロップダウン選択して登録可能
- **パッケージ更新履歴** — インポート時の追加・更新・削除の変更履歴をアセット詳細で参照
- **脆弱性スキャン** — heretix-api のバッチ検索でアセットの脆弱性を検出・アラート記録（新規 Alert の作成のみ。既存 Alert の更新・自動解決は行わない）
- **アラート管理** — ステータス管理（未対応 / 対応中 / 対応済み / 無視）・フィルタ（アセット / ステータス / 重要度 / Tags）・Tagsカラム表示・複数選択による一括ステータス変更
- **アラート自動解決** — インポート時にパッケージがアップグレードされた場合、旧バージョンのアラートを自動で解決済みに変更
- **アラートメタデータ更新** — open / in_progress の全 Alert に対して heretix-api から最新の CVSS スコア・重要度・EPSS・KEV 情報を再取得して更新（新規 Alert の作成は行わない）
- **Refresh 実行ログ** — Refresh Metadata 実行ごとに変更があった場合のみ実行履歴を記録。Alerts ページの **View History** ボタンから実行日時・更新件数・変更内容（before/after）を参照可能
- **アラート詳細** — 行クリックでスライドパネルを表示。Overview（基本情報・メモ・解決理由）・NVD タブ（CVSS 詳細・CWE・KEV・参照リンク）・OSV タブ（詳細説明・影響バージョン・参照リンク）・Timeline タブ（対応履歴）
- **アラート対応履歴** — 検知・ステータス変更・メモ保存・CVSSスコア変更・重要度変更・KEV追加を自動記録し、Timeline タブで時系列表示
- **脆弱性検索** — パッケージ名・バージョン・エコシステムで直接検索
- **ユーザー管理** — ユーザーの追加・編集・削除（admin ロールのみ表示・操作可能）
- **設定** — heretix-api 接続 URL・API Token 設定・疎通確認
- **定期実行** — サーバー起動時に node-cron でスケジューラを起動。Refresh Metadata（デフォルト 12:00 UTC）→ Run Scan 全アセット（デフォルト 13:00 UTC）を毎日自動実行。`CRON_REFRESH` / `CRON_SCAN` 環境変数で時刻変更可能
- **構造化ログ** — スキャン進捗（開始・完了・失敗）および認証イベント（ログイン成功・失敗）を JSON 形式で標準出力に記録。Docker 運用時は `docker logs` で収集可能

## セットアップ

### 前提条件

- Node.js 20+
- pnpm
- PostgreSQL（`heretix_management` データベースを作成済み）
- [heretix-api](../heretix-api) が起動済み（デフォルト: `http://localhost:5000`）

### 環境変数

`.env.local` を作成:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/heretix_management?schema=public"
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"  # Docker デプロイ時はサーバーの IP/ドメインに変更
# heretix-api の URL とトークンは Settings 画面から DB に保存可（環境変数はフォールバック）
HERETIX_API_URL="http://localhost:5000"
HERETIX_API_KEY="your-api-token"
# 定期実行スケジュール（cron 式、UTC）。省略時は Refresh 12:00、Scan 13:00
CRON_REFRESH="0 12 * * *"
CRON_SCAN="0 13 * * *"
```

### インストールと起動

```bash
# 依存パッケージのインストール
pnpm install

# Prisma クライアント生成
pnpm exec prisma generate

# DBスキーマ反映
pnpm exec prisma db push

# 管理ユーザーの作成（初回のみ）
pnpm seed
# デフォルト: admin@example.com / changeme
# カスタム: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass pnpm seed

# 開発サーバー起動
pnpm dev
```

`http://localhost:3000` を開いてログイン。

## Docker デプロイ

### 前提条件

- Docker
- Docker Compose

### セットアップ

プロジェクトルートに `.env` を作成:

```env
# 必須
AUTH_SECRET="your-secret-key"   # 生成コマンド: openssl rand -base64 32
AUTH_URL="http://your-server-ip:3000"  # サーバーの実際の IP/ドメインに変更
POSTGRES_PASSWORD="changeme"

# 任意（Settings 画面からも設定可能）
HERETIX_API_URL="http://localhost:5000"
HERETIX_API_KEY=""

# 定期実行スケジュール（cron 式、UTC）。省略時は Refresh 12:00、Scan 13:00
CRON_REFRESH="0 12 * * *"
CRON_SCAN="0 13 * * *"
```

### ビルドと起動

```bash
docker compose build
docker compose up -d
docker compose logs -f app
```

コンテナ起動時にデータベースのマイグレーションが自動で適用されます。

### 初回セットアップ

```bash
# 管理ユーザーの作成
docker compose exec app node_modules/.bin/tsx prisma/seed.ts
# デフォルト: admin@example.com / changeme
# カスタム: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass docker compose exec app node_modules/.bin/tsx prisma/seed.ts
```

### よく使うコマンド

```bash
# 停止
docker compose down

# 停止＋DBボリューム削除（完全リセット）
docker compose down -v

# ログ確認
docker compose logs -f app
```

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
   - Vendor（Fortinet / Palo Alto Networks）と製品名をドロップダウンで選択し、バージョンを入力
4. **Run Scan** で脆弱性を検出（heretix-api の Vendor Advisory データを使用）
5. ファームウェアアップデート後はパッケージの **Edit** でバージョンを変更して再スキャン

### 2. 手動パッケージの追加

1. アセット詳細ページのパッケージテーブル右上の **Add Package** をクリック
2. タブを選択して入力:
   - **General** — パッケージ名・バージョン・エコシステムを入力（Linux/npm/PyPI 等）
   - **Advisory** — Vendor（Fortinet / Palo Alto Networks）と製品名をドロップダウンで選択し、バージョンを入力（FW・ネットワーク機器向け）
   - **CPE** — CPE 2.3 文字列を直接入力
3. `manual` バッジが付いたパッケージは編集・削除が可能
4. Alerts 列のバッジをクリックするとそのパッケージのアラート一覧に遷移

### 3. 脆弱性スキャン

1. アセット詳細ページを開く
2. **Run Scan** ボタンをクリック
3. heretix-api が全パッケージ（手動追加含む）をチェックし、アラートが生成される

### 4. アラート対応

1. サイドバーの **Alerts** でアラート一覧を確認
2. **フィルタ**（Asset / Status / Severity）で絞り込み（複数値の同時選択可）
3. チェックボックスで複数選択 → ステータスを一括変更可
4. アラート行をクリックすると詳細パネルが開く
   - **Overview** タブ — 基本情報、ステータス変更、メモ記入、自動解決理由
   - **NVD** タブ — CVSS 詳細スコア、CWE、CISA KEV 情報、参照リンク一覧
   - **OSV** タブ — 詳細説明、影響バージョン一覧、参照リンク一覧
5. ステータスを `Open` → `In Progress` → `Resolved` / `Ignored` に変更して追跡
6. **Refresh Metadata** ボタンで heretix-api の最新データをアラートに同期

> **Run Scan と Refresh Metadata の違い:**
> | | Run Scan | Refresh Metadata |
> |---|---|---|
> | 対象 | 特定の1アセットのパッケージ | 全 Alert（open / in_progress） |
> | 操作 | パッケージ一覧を heretix-api でバッチ検索 | 既存 Alert の externalId で再検索 |
> | 結果 | 新しい Alert を**作成** | 既存 Alert のスコア・重要度等を**更新** |
> | 用途 | 新たな脆弱性の検出 | CVE スコア改訂・KEV 追加等への追従 |

### 5. 脆弱性検索

サイドバーの **Search** でパッケージ名・バージョン・エコシステムを指定して直接検索。

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
│   │   └── settings/           # 設定
│   ├── api/                    # API ルート
│   │   ├── assets/
│   │   ├── alerts/
│   │   ├── users/
│   │   ├── search/
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
| GET | `/api/alerts/refresh-log` | Refresh Metadata 実行履歴一覧 |
| GET | `/api/search` | 脆弱性検索（heretix-api プロキシ） |
| GET | `/api/settings` | 設定取得 |
| PATCH | `/api/settings` | 設定更新 |
| POST | `/api/settings/test` | heretix-api 疎通確認 |
| GET | `/api/users` | ユーザー一覧（admin のみ） |
| POST | `/api/users` | ユーザー作成（admin のみ） |
| PATCH | `/api/users/[id]` | ユーザー更新（admin のみ） |
| DELETE | `/api/users/[id]` | ユーザー削除（admin のみ） |
