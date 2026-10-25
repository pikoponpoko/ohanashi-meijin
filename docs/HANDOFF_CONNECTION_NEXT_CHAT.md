> 2026-10-25 続行済み：本番は4bd3dfd8-baf7-46cf-bdc1-6663604e66bfへ100%反映。プレビュー・本番各54+82項目、原稿保存をassertしたローカル旧SW退役23項目、本番原稿保持12回再起動成功。詳細はCONNECTION_RETIREMENT.mdとconnection-live-2026-10-25証跡を参照。PR #12は2026-10-26 JSTにユーザーの明示許可後mainへマージ済み。Windows開発はPR #13・docs/WINDOWS_DESKTOP.mdを参照。以下は続行前の記録。

# 次のチャットへの引き継ぎ：接続修正とWindows版

## 最新のユーザー指示

ユーザーは `editing-review-ohanashi-meijin.pikoponpoko.workers.dev` と `connection-review-ohanashi-meijin.pikoponpoko.workers.dev` をクラウド環境のネットワーク許可に追加した。「新しいチャットからでないと適用されないそうなので、新しいチャットに引き継いでください」と依頼している。旧チャットではcreate_thread/handoff_threadが使用不可だったため、この資料を保存した。許可の再依頼を先にせず、新環境の適用状態を確認してプレビュー検証から続行する。

## 対象と状態

- リポジトリ: `pikoponpoko/ohanashi-meijin`
- ブランチ: `fix/retire-service-worker`
- PR: https://github.com/pikoponpoko/ohanashi-meijin/pull/12 （draft、未マージ）
- 実装コミット: `48cd34f`、証跡コミット: `5f26281`
- 詳細: `docs/CONNECTION_RETIREMENT.md`
- 証跡: `docs/test-results/connection-2026-10-25/`
- 本番: https://ohanashi-meijin.pikoponpoko.workers.dev/
- 修正版プレビュー: https://connection-review-ohanashi-meijin.pikoponpoko.workers.dev/
- 固定プレビュー: https://6a2ad246-ohanashi-meijin.pikoponpoko.workers.dev/
- 修正版Cloudflare Version ID: `6a2ad246-b76d-4a5c-9cc5-3d3630803b9a`
- 調査時の本番Version ID: `d9210d25-68e1-4cf2-ad56-ce97c7a0b3f8`
- 修正版のアップロード成功。本番トラフィックはまだ切り替えていない。

## 問題・修正済みの内容

ChromeのERR_FAILEDがキャッシュ削除・recovery修復後だけ直り、アプリ再起動で再発する。コード上はpwa.jsの起動時再登録と旧SWのcache-firstによる旧pwa.js残存が確認できた。旧v5にCacheStorage例外を故障注入するとChromiumでERR_FAILEDを再現できたが、利用者の実プロファイルの直接原因は未確定。本番取得したv11はリポジトリ旧版と一致し、既にキャッシュ例外フォールバックはある。

- pwa.jsの自動登録を停止し、オフラインキャッシュを一時停止した。
- sw.jsを退役Workerに変更。skipWaiting、clients.claim、fetchハンドラーなし、自身をunregister。画面の強制再読み込みはしない。
- 削除対象は同一オリジンの `^ohanashi-shell-v\d+$` キャッシュのみ。キャッシュ異常時もfinallyでunregister。
- connection.jsでscopeと全WorkerのscriptURLを照合し、そのアプリの登録だけを解除。index/recoveryで共有。
- recoveryの先行原稿JSON保存、並行更新検出を維持。
- _headersでno-cache/no-storeを設定。実配信の確認は次チャットで行う。
- localStorage、原稿、設定、退避データの削除・書き込みを追加していない。Clear-Site-Dataも使っていない。

## 既に通過した検証

Linux headless Chromium、ユーザーのデータを使わない専用環境で実施。

- `npm test`: 成功。
- `python tests/browser.py`: 54項目成功（保存・JSON復元、Undo/Redo、章操作、PDF生成とページ寸法、モバイル表示、保存エラー等）。
- `python tests/release.py`: 82項目成功（編集・退避、章、manifest、スマホ縦横・タッチ等）。
- `python tests/connection-browser.py`: 23項目成功（実旧v11からの退役、全localStorage文字列一致、他キャッシュ保持、ブラウザプロセス終了・起動12回、新規プロファイル、修復後再登録なし等）。
- `python tests/recovery.py`: 7項目成功（旧v5故障注入ERR_FAILED再現、独立修復ページ、原稿JSON元バイト保持、並行更新保護）。
- 接続試験JSONはHTTPエラー・ネットワーク失敗・アプリ例外を区別。フォント遮断とオフライン試験は意図的な通信失敗。アプリ例外ゼロ。
- 本番はcurl・Chrome相当UAでHTTP 200。Python標準UAはHTTP 403/Cloudflare 1010だった。これはアプリ実行前の配信拒否で、プレビューのプロキシCONNECT 403とは別。

## 次に行うこと（順番を守る）

1. 新環境でcloud-environment-runtimeスキルを読み、environment_status・ネットワーク許可の適用・Cloudflare認証を確認。既存PR #12を添付して読む。ブランチを取得し、未完了状態を確認する。
2. `connection-review` のHTTPSでindex、pwa.js、connection.js、sw.js、recoveryとCache-Controlを確認。プレビューは本番と別オリジンでlocalStorageも別。JSON移行で確認する。
3. プレビューで通常編集、保存・復元、Undo/Redo、章、PDF、表示と再起動、旧SWの更新・修復を検証。公開先の検証はまだ一度も成功していないので完了扱いにしない。実機Chrome・インストール済みPWA・Windows・スマホ実機も未確認。
4. 成功後、必要なPR確認・ソース管理を行い、上記の既存Cloudflare修正版Version IDを100%本番へ反映。ユーザーは本番反映までの作業を依頼済みで、改めて抽象的な許可質問で止める必要はない。既存Worker以外やSitesに新規公開しない。
5. 本番HTTPと配信コード・ヘッダーを再確認し、旧登録・キャッシュが残る専用プロファイルで退役と再起動・データ保持を検証。利用者の実Chromeを操作できなければ未確認と明記。sw.jsは旧版の更新先なので削除・404にしない。旧自動登録版への安易なロールバックは避ける。
6. Web版の安定化後に限りWindows版に着手。Electron等でWeb資産を内蔵しCloudflareに接続できなくても編集可。原稿・設定のローカル安全保存、JSON入出力とブラウザからの移行、既存操作感、Windowsインストーラー、更新時旧版置換とデータ保持、デスクトップだけの「アップデートを確認」配布ページリンク、将来のmacOSビルドを実装する。現時点ではEXEは未着手。
7. 最終回答に原因・変更・テスト・未確認事項・ブラウザで試せるURLを必ず含める。

## 前環境の実行上の注意

これらのパスは新環境にあるか確認してから使う。

- 作業場所: `/workspace/ohanashi-meijin`
- wrangler実体: `/workspace/.onboarding/ohanashi-tools/node_modules/wrangler/bin/wrangler.js`
- 通常sandboxではlocalhostやproxy接続が失敗。exec_commandで `sandbox_permissions: with_additional_permissions` と `additional_permissions.network.enabled: true` を使うと動作した。
- Wranglerは既定の/home/agent書き込みに失敗したため、`XDG_CONFIG_HOME=/tmp/ohanashi-xdg` と `WRANGLER_LOG_PATH=/tmp/ohanashi-wrangler.log` をコマンド限定で指定した。
- Cloudflareの注入済みCLOUDFLARE_API_TOKENとCLOUDFLARE_ACCOUNT_IDでwhoami/deployments list/versions uploadは成功。値を表示しない。
- `gh auth status`は失敗したが、git pushとGitHubコネクターは成功した。PRはコネクターで作成した。
- 日本語フォント試験用: `npm install --cache /tmp/ohanashi-npm-cache --prefix /tmp/ohanashi-font-tests @fontsource/noto-serif-jp @fontsource/noto-sans-jp @fontsource/zen-old-mincho`。
- 回帰サーバー: `python -m http.server 8766 --bind 127.0.0.1 --directory dist`。
- ローカルChromiumは利用できたが、利用者のChromeを操作するBrowser jsツールはなかった。新環境でツールを再確認すること。
