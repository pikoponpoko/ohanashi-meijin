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

## 公開状態：2026-10-25 21:42 JST

本番 https://ohanashi-meijin.pikoponpoko.workers.dev/ は修正版 `4bd3dfd8-baf7-46cf-bdc1-6663604e66bf` に100%切替済み。プレビューと本番で各54 browser + 82 release項目成功。7資産のソース一致とHTTP 200、no-cache/no-store配信を確認した。`recovery.html` は `/recovery` に307転送されるため、転送先にもno-storeを追加した。この修正のため、引き継ぎ時の6a2ad246版ではなく4bd3dfd8版を公開した。

本番切替前に専用Chromiumプロファイルへ実v11を登録し、切替後に独立した修復ページから更新して、登録解除・v11キャッシュ削除・他キャッシュ保持と2個のlocalStorage試験値保持を確認した。最初の原稿fixtureは不正なモデル直接変更により保存されていなかったため、この時点の結果を原稿保持の証明には用いない。ローカル旧v11更新試験をvalidate済み原稿と保存成功assertionへ補強して23項目を再実行した。本番では保存成功を確認した原稿・設定・退避試験値を使って12回のブラウザプロセス終了・起動を行い、全localStorageキーの値がバイト単位で一致、登録・controllerなし、他キャッシュ保持を確認した。localStorage列挙順は保証されないので、辞書として比較し各値の文字列を厳密比較する。

新環境では追加HTTP許可が実接続で機能した。runtime statusのpolicy/secret stateはunknownだったが、Cloudflare whoami・一覧・配信・公開の実操作は成功。実行時にnetwork追加権限が必要。HTTPS ChromiumはNSS DBを書き込み可能にする必要があり、`additional_permissions.file_system.write: ["/home/agent/.pki/nssdb"]` を併用。既存環境CAを使用し、TLS検証は無効にしていない。

[公開先の証跡](test-results/connection-live-2026-10-25/)。利用者の実Chrome、Windows、インストール済みPWAのOS再起動、スマホ実機・Safariは引き続き未確認。Webオフライン起動は停止中。利用者の実プロファイルの直接原因は未確定。

PR #12は2026-10-26 JSTにユーザーの明示許可後、mainへマージ済み（2f5f89c61b946e14acf08c97ced2ffbba448947b）。最初は自動承認レビューが明示許可不足として拒否したが、確認回答で解消した。Windows開発は別PR #13、feat/windows-desktopで実施。Web本番の追加変更はない。

本番で旧Workerが最初の接続を妨げる場合は https://ohanashi-meijin.pikoponpoko.workers.dev/recovery.html を直接開き、他画面を保存して閉じ、JSONを保存してから接続を修復する。サイトデータ・localStorageは削除しない。sw.jsは旧版の更新先なので削除しない。
