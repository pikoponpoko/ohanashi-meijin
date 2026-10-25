# 接続障害修正：2026-10-25 JST

## 原因と確認の限界

本番の `sw.js` は調査時にリポジトリHEADのv11とバイト単位で一致した。`pwa.js` は起動時に再登録するため、修復ページのunregisterだけでは解除が持続しない。旧Workerはindexとpwa.jsをcache-firstで返すので、サーバーのpwa.jsだけ直しても旧コードが残る。新Workerの有効化も、旧アプリ画面が開いたままだと待機する。この再登録・旧版残存経路を専用Chromiumプロファイルで確認した。

旧v5のCacheStorage例外を故障注入するとChromiumの `ERR_FAILED` を再現でき、独立した修復ページから復旧できた。本番v11には例外時のフォールバックが既にある。利用者の実Chromeプロファイルにはアクセスできていないため、その障害の直接原因がv5残存、キャッシュ破損、配信拒否のいずれかは未確定。

本番 `/`、`sw.js`、`pwa.js` はcurlでHTTP 200。Chrome相当UAも200。Python標準UAはHTTP 403・Cloudflare 1010（アプリ実行前の配信拒否）だった。Chrome相当UAはHTTP診断でありChrome実機確認ではない。Cloudflare管理画面のセキュリティイベント・個々の利用者のリクエストログは未確認。Cloudflareセキュリティ設定は変更していない。

## 変更

- `dist/pwa.js`: SWの新規登録を停止。対象登録のみ解除。インストール用UIとmanifestは維持。
- `dist/sw.js`: 旧登録の更新先を維持した退役Worker。skipWaiting、clients.claimで旧Workerを置換し、fetch処理なしでブラウザの通常通信に戻す。自身をunregisterする。画面の自動リロードはしない。
- 削除するキャッシュは同一オリジンの `^ohanashi-shell-v\d+$` のみ。他キャッシュを保持。キャッシュ操作が例外になってもfinallyで解除する。
- `dist/connection.js`: indexと修復ページの共通処理。scopeと全WorkerのscriptURLが一致する登録のみ解除する。他scope・他スクリプトの登録には触れない。
- `dist/recovery.js`: 原稿の先行ダウンロードと同時編集検出を維持し、共通処理を使用。
- `dist/_headers`: アプリ資産を再検証し、退役Worker・修復ページと関連スクリプトをno-storeにする。Clear-Site-Dataは使わない。
- localStorage、原稿、設定、退避データへの書き込み・削除は追加していない。Webオフライン起動は一時停止。既に開いた編集画面の通常機能は維持するが、オフラインで閉じた後の再起動はできない。

## 検証

LinuxのheadlessシステムChromium、専用テストプロファイル、ローカルHTTPサーバーで実施。利用者のブラウザデータは使っていない。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 全件成功：構文・モデル・登録解除範囲・退役・異常系等 |
| `python tests/browser.py` | 54項目成功：保存・JSON復元、Undo/Redo、章操作、PDF出力・ページ寸法、モバイル表示、容量不足等 |
| `python tests/release.py` | 82項目成功：原稿退避・復元、章・カット、スマホ縦横表示・タッチ、manifest、オンライン再起動等 |
| `python tests/connection-browser.py` | 23項目成功：実旧v11登録とキャッシュ残存、退役版への更新、未保存の画面を再読み込みしないこと、全localStorageの文字列一致、他キャッシュ保持、同一プロファイルのブラウザプロセス完全終了・起動12回、新規プロファイル、修復後再登録なし |
| `python tests/recovery.py` | 7項目成功：v5キャッシュ障害でERR_FAILEDを故障注入再現、修復JSONの元バイト保持、原稿・退避保持、同時更新時の修復中止 |

[証跡](test-results/connection-2026-10-25/)にログ・接続試験JSON・本番HTTPヘッダーを保存。接続JSONではHTTP異常、ネットワーク失敗、アプリ内部例外を別種別に記録。外部フォントの遮断は試験の意図的処理、オフライン試験のERR_INTERNET_DISCONNECTEDも期待する通信失敗であり、アプリ内部例外はゼロ。

## 公開状態と残作業

- 修正版プレビュー: https://connection-review-ohanashi-meijin.pikoponpoko.workers.dev/
- 固定版URL: https://6a2ad246-ohanashi-meijin.pikoponpoko.workers.dev/
- Cloudflare Version ID: `6a2ad246-b76d-4a5c-9cc5-3d3630803b9a`
- 本番は切替前：調査時の現行Version ID `d9210d25-68e1-4cf2-ad56-ce97c7a0b3f8`。本番 https://ohanashi-meijin.pikoponpoko.workers.dev/ の旧SWはまだ退役していない。
- バージョンアップロードは成功。本環境のネットワーク許可がプレビューホストを含まず、CONNECT段階でプロキシ403となる。Cloudflare側のPython-UA拒否とは別。許可追加をユーザーへ依頼済み。プレビューのHTTP応答、ヘッダー、本番相当の操作はまだ確認できていない。
- プレビュー確認後に限り、同じVersion IDを本番へ100%切り替える。公開後、`sw.js`・pwa.js・_headersの実配信、旧プロファイルでの退役を再確認する。旧Workerを再登録する版への単純ロールバックは再発を招くので避ける。
- プレビューは本番と別オリジンで、localStorageも別。原稿は本番からJSONを書き出して取り込む。プレビューに本番の原稿が見えなくても削除された意味ではない。
- 利用者の通常Chromeで10回以上の実終了・再起動、Windows、インストール済みPWAのOS終了・再起動、Android/iPhone実機、Safariは未確認。headless Chromiumの結果で代替完了としない。
- Windows EXEは未着手。ユーザー指定どおりWeb版のプレビュー・本番・旧版更新確認を先に完了する。Electron採用、同梱資産・永続保存・JSON移行、NSIS更新・設定保持、配布ページへのデスクトップ専用リンク、将来のmacOSビルドは第2段階に残る。

本番反映後に旧Workerが最初の接続を妨げる場合は https://ohanashi-meijin.pikoponpoko.workers.dev/recovery.html を直接開き、他画面を保存して閉じ、JSONをダウンロードしてから接続を修復する。サイトデータ・localStorageの削除は行わない。
