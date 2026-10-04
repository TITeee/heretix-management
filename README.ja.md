# heretix-management

heretix-management は、**[heretix](https://titeee.github.io/heretix-web/)** の Web コンソールです。heretix は、サーバー・コンテナ・ネットワーク機器（ファイアウォール、VPN など）の CVE を 1 つのインベントリで管理する、セルフホスト型のツール群です（Apache-2.0）。

[English README](README.md)

![Alert Management](docs/alerts.png)

## 概要

各アセットに何が入っているか（インベントリ）と、そこで見つかった脆弱性を管理し、対応状況を 1 か所で追跡できます。

1. **取り込み**: 各アセットにインストールされているものを取り込みます。heretix-cli・Trivy・Syft の SBOM、ネットワーク機器の CSV、手動で追加したパッケージに対応しています。
2. **スキャン**: インベントリを heretix-api で照合し、該当した脆弱性をアラートにします。既存のアラートを最新の状態に保ち、該当しなくなったものは解決済みにします。
3. **トリアージ**: アラートを Open から Resolved / Ignored まで追跡します。SLA の期限、CISA KEV・EPSS、ディストロ自身の評価と修正状況、VEX の入出力、Slack 通知が使えます。

heretix 全体の構成は次のとおりです。

```
 サーバー / コンテナ                    ネットワーク機器
        │ heretix-cli, Trivy, Syft          │ 手動登録 / CSV
        ▼                                   ▼
 heretix-management（インベントリ + アラート）── 検索 ──► heretix-api（脆弱性データ）
        │
        ▼
 ダッシュボード, アラート, VEX, Slack
```

- **[heretix-cli](https://github.com/TITeee/heretix-cli)**: ホストやコンテナイメージのパッケージを、CycloneDX の SBOM として収集します。
- **heretix-management**（このリポジトリ）: インベントリと検出結果を管理します。
- **[heretix-api](https://github.com/TITeee/heretix-api)**: OSV、NVD、KEV、EPSS、ベンダーアドバイザリを取り込んだ自前のデータで、「このバージョンは脆弱か」に答えます。

## 機能

- **インベントリ**: SBOM（heretix-cli、Trivy、Syft、cdxgen）の差分取り込み、ネットワーク機器の手動登録・CSV 一括登録、アセットごとのパッケージ変更履歴、依存グラフ *(Beta)*
- **検出**: 手動、CI からのアクセストークン経由、毎日の定期実行でスキャン。悪意あるパッケージ（`MAL-*`）にも対応
- **アラート**: ステータス管理、フィルタ、一括更新、CSV / JSON 出力、アラートごとの Timeline、NVD・OSV・ベンダーアドバイザリ・CVE レコードを表示する詳細パネル
- **優先度付け**: どの画面でも同じ数え方の重要度、重要度ごとの SLA 期限（実際に悪用されている CISA KEV の脆弱性はより短い期限）、悪用される可能性（EPSS）、ディストロ自身の評価（Ubuntu の priority、Debian の urgency、Red Hat の impact）、ベンダーが修正するかどうか（Will not fix、Fix deferred など）
- **VEX** *(Beta)*: Ignored のアラートを CycloneDX VEX として出力、VEX 文書の取り込み、他のアセットでの判断の再利用
- **タグ**: アセットやパッケージをグループ化（例: Internet Facing）し、タグごとの重要度を表示
- **通知と AI**: 重要度とタグで絞り込める Slack 通知、アラートごとの AI Insight チャット（Anthropic、任意）
- **管理**: ユーザーとロール、監査ログ、設定画面（heretix-api、Slack、AI、SLA、アクセストークン）

## 必要なもの

| | 要件 |
|---|---|
| heretix-api | **データを取り込み済み**の [heretix-api](https://github.com/TITeee/heretix-api)（heretix-api のクイックスタートの手順 3）と、その API キー。heretix-management 自体は脆弱性データを持たず、スキャンのたびに heretix-api に問い合わせます |
| 規模 | heretix-management 自体は軽量です。サーバーの規模は、大半を占める heretix-api のデータベースに合わせてください。[heretix の要件](https://titeee.github.io/heretix-web/docs/)と heretix-api の README を参照してください（両方を合わせた PoC の目安: 2 vCPU、メモリ 8 GB、ディスク 20 GB） |
| ソフトウェア | Docker と Docker Compose v2、git |
| ネットワーク | heretix-management から heretix-api のポート（既定は 5000）に届くこと。利用者からポート 3000 に届くこと |

Docker を使わずに動かす場合（Node.js 22、pnpm、PostgreSQL 15 以上）は [docs/operations.md](docs/operations.md#running-without-docker) を参照してください。

## クイックスタート

### 0. 先に heretix-api を用意する

[heretix-api のクイックスタート](https://github.com/TITeee/heretix-api#quick-start)の手順 3（データの取り込み）まで進め、`API_KEY` を控えておきます。初回の NVD の全件取り込みには数時間かかりますが、その間にこちらの手順を進めて構いません。取り込みが終わると、スキャンで見つかる脆弱性が増えるだけです。

### 1. コードを取得して設定する

```bash
git clone https://github.com/TITeee/heretix-management.git
cd heretix-management
cp .env.example .env
```

`.env` を編集して、次を設定します。
- `AUTH_SECRET`: セッションの署名に使うランダムな文字列（`openssl rand -base64 32` で生成）。
- `AUTH_URL`: 利用者がアクセスする URL（例: `http://192.0.2.10:3000`）。サインイン後のリダイレクト先になるので、サーバー上のブラウザだけで使う場合を除き、`localhost` にはしないでください。
- `HERETIX_API_KEY`: heretix-api の `.env` に設定した `API_KEY`。
- `POSTGRES_PASSWORD`: 同梱のデータベースのパスワード。既定の `changeme` はローカルでの試用向けなので、変更してください。

heretix-api の URL の既定値は `http://host.docker.internal:5000` で、同じサーバーで動く heretix-api にコンテナの中から届きます。heretix-api が別のサーバーにある場合だけ、`HERETIX_API_URL` を設定してください。URL とキーは、後から設定画面でも変更できます。

### 2. 起動する

```bash
docker compose up --build -d
docker compose ps                                          # db と app が起動している
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/login   # → 200
```

初回の起動時に、コンテナがデータベースのスキーマを作成してから、ポート 3000 でコンソールを起動します。ログは `docker compose logs -f app` で確認できます。

### 3. 管理者ユーザーを作成する

```bash
docker compose exec app node_modules/.bin/tsx prisma/seed.ts
```

`admin@example.com` / `changeme` と既定のタグが作成されます（`SEED_EMAIL` と `SEED_PASSWORD` で変更可）。`AUTH_URL` でサインインしたら、**Users** の画面でパスワードを変更してください。

### 4. heretix-api に接続する

**Settings → Vulnerability API** で URL とキーを確認し、**Test Connection** を押します。失敗する場合は、次を確認してください。heretix-api が応答しているか（heretix-api のサーバーで `curl http://localhost:5000/health`）、キーが heretix-api の `API_KEY` と一致しているか、heretix-api が別のサーバーにある場合は `HERETIX_API_URL` がそこを指していてポート 5000 に届くか。`localhost` を含む URL は、コンテナの中からは届きません。

### 5. 最初のアセットを取り込んでスキャンする

動かしているものの SBOM を、どちらかのツールで作成します。

```bash
# heretix-cli: 最初に 1 回ビルドが必要です（Go 1.25 以上）。https://github.com/TITeee/heretix-cli#installation を参照
heretix-cli collect --image myapp:1.0 --name myapp --output sbom.json

# または Syft
syft myapp:1.0 -o cyclonedx-json=sbom.json
```

**Assets → Import SBOM** で `sbom.json` をアップロードし、作成されたアセットの画面で **Run Scan** を押します。

検出されるのは、heretix-api が取り込み済みのエコシステムの脆弱性だけです。SBOM の OS パッケージには、そのディストロのデータが heretix-api に必要で、ネットワーク機器にはベンダーアドバイザリが必要です。以降は、毎日の定期ジョブがすべてのアセットを更新・再スキャンします（[docs/alerts.md](docs/alerts.md#scanning)）。

### 停止と更新

```bash
docker compose down                        # 停止。データは残る（-v を付けると削除）
git pull && docker compose up --build -d   # 最新版に更新
```

起動時に、新しいデータベースの移行が適用されてからコンソールが応答します。バージョンごとの注意点は [docs/operations.md](docs/operations.md#upgrading) を参照してください。

## ドキュメント

詳細なドキュメントは英語のみです。

| ドキュメント | 内容 |
|---|---|
| [docs/importing-assets.md](docs/importing-assets.md) | SBOM の取り込み、照合と再取り込み、ネットワーク機器と CSV、手動パッケージ、CI からのアップロード |
| [docs/alerts.md](docs/alerts.md) | スキャン、アラートのライフサイクル、重要度と SLA、VEX、詳細パネル、通知 |
| [docs/operations.md](docs/operations.md) | 手動セットアップ、環境変数、アップグレード、定期ジョブ、設定、ログ |
| [docs/api.md](docs/api.md) | `/api/*` のエンドポイント一覧 |
| [docs/architecture.md](docs/architecture.md) | コードの構成と、主な処理の置き場所 |

## ライセンス

Apache License 2.0。詳細は [LICENSE](LICENSE) を参照してください。
