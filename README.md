# おはなし名人

日本語脚本を縦書き・横書きで編集する、ビルド不要のブラウザアプリです。

- 正規のソース管理先: https://github.com/pikoponpoko/ohanashi-meijin （main）
- 正式な公開先: 既存の Cloudflare Worker `ohanashi-meijin`
- アプリ名: おはなし名人

開発・公開はGitHubとCloudflareに統一します。ChatGPT Sitesへの新規公開・更新は行いません。通常の動作確認にもCloudflareの正式公開URLを使います。

## 接続修正（2026-10-25）

Service Workerの自動登録とオフラインキャッシュを一時停止しています。通常ブラウザ・既存のホーム画面ショートカットはオンラインで使用してください。原稿・設定・退避データの保存形式は変更しません。`sw.js` は登録済み旧版を退役させるため配信を継続します。削除・404化しないでください。

接続修復は本番の `/recovery.html` から原稿JSONを保存して実行します。プレビューは本番と別の保存領域なので、原稿はJSONで移行します。修正と検証範囲は [接続修正レポート](docs/CONNECTION_RETIREMENT.md) を参照してください。

```sh
npm run test:connection
```

## 原稿と操作

原稿はブラウザのlocalStorageに自動保存します。既存の保存キー `scenario-meijin-v1` は維持し、旧形式を読み込んだ際は元データを退避して形式v2へ移行します。クラウド同期ではありません。定期的にJSONバックアップを保存してください。

- 章の追加・削除、選択範囲の章への移動。
- カットIDを維持した全章連番、Enter2回でカット分割、空行整理。
- 本文・章操作・設定のUndo/Redo（再読み込みまで）。IME変換中は処理を保留。
- Alt+1/2/3で柱・ト書き・セリフ、Ctrl/Cmd+Shift+Fで集中モード、Escで解除。
- TXT・Markdown・JSONの読み込み、TXT・Markdown・JSONの書き出し。
- A4横・縦書きPDFの直接保存（画像形式のため文字検索不可）、ブラウザからの通常印刷。
- 画面・印刷の文字設定、推定尺、原稿の自動修正。

TXT/Markdownに内部カットIDは含まれません。別アプリ側のID受け入れ対応はこのリポジトリに含みません。

## テスト

```sh
npm test
```

ブラウザ回帰テストにはPlaywright、Chromium、PyMuPDFが必要です。

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
```

テスト専用の静的サーバーを別ターミナルで起動します。

```sh
python -m http.server 8766 --bind 127.0.0.1 --directory dist
```

```sh
npm run test:browser
```

`TEST_BASE_URL`、`CHROMIUM_PATH`、`TEST_OUTPUT_DIR` でテスト先・ブラウザ・成果物の出力先を指定できます。通常の公開後確認はCloudflareの正式URLで行います。回帰テストはlocalStorageを変更するため、専用のブラウザコンテキストで実行してください。

## 既存Cloudflare Workerへのデプロイ

`wrangler.jsonc` の `name` は `ohanashi-meijin`、配信対象は `dist/` です。内部の識別子や保存キーは不要に変更しません。

Cloudflareへの認証（`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID`、またはローカルのWrangler認証）を準備します。APIトークンはシークレットとして管理し、リポジトリへ保存しないでください。

```sh
npm install
npx wrangler whoami
npx wrangler deployments list --name ohanashi-meijin
```

対象アカウントに既存Workerが存在することを確認できた場合のみ、次を実行します。存在確認に失敗したら中止し、新しいWorker・一時アカウント・別サービスを作成しないでください。

```sh
npm test
npm run deploy
```

Wranglerが返す正式URLをブラウザで開き、アプリ名、本文編集・再読み込み、Undo/Redo、章操作、PDF保存を確認します。デプロイのバージョンIDとGitHubのコミットIDを記録してください。

## 実装上の制限

ブラウザ標準の縦書き・禁則処理を使用します。推定尺と作法チェックは簡易的な目安です。日本語Webフォントの初回取得には通信が必要です。Android/iPhone実機、Safari/WebKit、Dropbox実プロバイダーやOSのジェスチャーとの競合は別途確認が必要です。

PDF用のjsPDFとhtml-to-imageはローカル同梱し、ライセンス・出典を `dist/vendor/` に記載しています。
