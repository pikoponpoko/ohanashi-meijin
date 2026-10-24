# PWA更新時の原稿保護：レビュー資料

2026-10-24 JST。`pikoponpoko/ohanashi-meijin` の `fix/pwa-blank-manuscript` を取得し、HEADが指定の引継ぎコミット `9e7ad0bdf91c6acf60ebc87df28367ddecfb8c81` と一致することと、変更前の作業ツリーが空であることを確認。最初に `CLOUD_HANDOFF.md` を読んで続行した。

## 問題と修正

1. PWA試験は、`wait_for_function` に渡したPromiseを完了結果として正しく待てず、初回SWの `active` がnullのまま `scriptURL` を参照して失敗した。Linux Chromiumでも変更前の同じ例外を再現。`page.evaluate` で `navigator.serviceWorker.ready` を期限付きでawaitし、登録を保持した後に同期の状態条件を待つ。更新のwaiting状態と失敗通知も実際の完了を待つ。`tests/release.py` の同種の初回SW待機も修正した。キャッシュ一覧の非同期取得は期限付きのポーリングにした。
2. 待機を直すと、古い未編集画面を閉じた際に、その画面の古い状態が最新のlocalStorage原稿を上書きする問題を検出した。`pagehide` と非表示時の保存を `dirty` の場合に限定した。未保存の変更がある場合の終了・非表示時保存、保存失敗時の離脱確認は維持する。
3. キャッシュ対象の `app.js` が変わるため、配信SWのキャッシュを `ohanashi-shell-v2` に更新。静的試験も対応。更新試験の仮想SWバージョンは配信バージョンと独立させ、実ファイルはテストから変更しない。

保存キー `scenario-meijin-v1`、v2形式、原稿退避、章・カット生成、PDF、プリプロ名人は変更していない。ユーザーの実原稿・ブラウザプロファイルを試験に使用していない。複数画面で同時に編集する際の競合解決機能は追加していない。古い画面で明示的に保存する操作や複数画面の未保存変更同士の競合は依然として避ける必要がある。

## 検証結果

環境：Linux、Chromium 154.0.8037.57、Playwright 1.62.0、PyMuPDF 1.26.6。独立したブラウザコンテキストとローカル専用HTTPサーバー。外部Google Fonts通信は停止。

| 試験 | 結果 | 証跡 |
|---|---|---|
| `npm test` | 構文、既存7チェック、モデル、空行削除、PWA静的試験合格 | [ログ](test-results/cloud-2026-10-24/node.txt) |
| `tests/browser.py` | 54/54合格 | [ログ](test-results/cloud-2026-10-24/browser-54.txt) |
| `tests/release.py` | 82/82合格 | [ログ](test-results/cloud-2026-10-24/release-82.txt) |
| `tests/pwa-update.py` | 15/15合格 | [ログ](test-results/cloud-2026-10-24/pwa-update-15.txt)、[項目一覧](test-results/cloud-2026-10-24/pwa-update-checks.json) |
| 修正前アプリで修正版PWA試験を実施 | 意図した失敗を検出 | [比較ログ](test-results/cloud-2026-10-24/pwa-negative-control.txt) |

比較試験は `/tmp` にdistと修正版テストをコピーし、`app.js`だけを引継ぎコミットの内容に戻して実施した。dirty原稿の保存チェックは通るが、古い画面の非表示で保存内容が上書きされるチェックが失敗した。実作業ツリーを巻き戻していない。

PWA試験では、複数章・複数カットの本文とID、編集中の新版待機、別画面が残っている間の待機、全画面終了後の新版有効化を確認。保存JSONは文字列でも比較し、退避原稿・無関係なlocalStorageキー・他アプリ相当のキャッシュ内容も保持された。新版のオフライン起動・編集保存・再起動、manifest取得503による新版事前キャッシュ失敗時の旧版継続、その後のオフライン再起動も合格した。非表示とpagehideのdirty保存は合成イベント、複数画面の終了とSW更新は実ブラウザ動作で確認。

再実行：

```sh
npm test
# 別ターミナルで起動
python -m http.server 8767 --bind 127.0.0.1 --directory dist
TEST_BASE_URL=http://127.0.0.1:8767 TEST_OUTPUT_DIR=/tmp/ohanashi-browser python tests/browser.py
TEST_BASE_URL=http://127.0.0.1:8767 TEST_OUTPUT_DIR=/tmp/ohanashi-release python tests/release.py
TEST_OUTPUT_DIR=/tmp/ohanashi-pwa python tests/pwa-update.py
```

PWA試験自身が専用HTTPサーバーを起動する。通常の `npm test` にはPython試験を含めていない。

## 元9項目と未確認事項

初回の引継ぎ添付と退避ZIPには元9項目の原本がなかった。その後、ユーザーが原本を追加添付し、2026-10-24 JSTに全文を確認した。[原文](requirements/おはなし名人_Codex修正指示書_2026-10-23_全9項目.md)を内容を変えず保存し、実装・試験結果と照合した[番号別レビュー](ORIGINAL_REQUIREMENTS_REVIEW.md)を作成した。以下は要約であり、原文の全受入条件を確認済みとは扱わない。PWAは9項目とは別の追加要望として扱う。

| 項目 | クラウド再開後の確認 | 残る確認 |
|---|---|---|
| 1 改行・列間隔・空行削除 | 54/82チェックとモデル試験を再実行して合格 | 実原稿・元録画と同一入力 |
| 2 カット自動生成・採番 | 既存試験とPWA更新時の章・カットID保持合格 | 実IME、プリプロ連携先での受入 |
| 3 PDF直接保存・印刷 | 既存PDF回帰試験合格、実装変更なし | 実日本語フォント、字形・禁則・実印刷。画像PDFの文字検索・選択は非対応 |
| 4 選択範囲の章移動 | 書式・ID・Undo/Redoの既存回帰試験合格 | 元録画・実原稿での同一操作 |
| 5 章削除の任意バックアップ | 既存回帰試験合格、実装変更なし | 実利用での最終確認 |
| 6 Dropbox JSON読込 | MIME・拡張子・破損拒否の既存回帰試験合格 | Android/iPhoneとDropbox実プロバイダー |
| 7 空白開始と原稿保持 | 新規・退避復元・破損回収・容量不足試験合格 | 実利用データでの最終確認 |
| 8 スマホ外側タップ | Chromium縦横の回帰試験合格 | 実端末、キーボード表示時・タブレット |
| 9 指ジェスチャー | Chromium縦横の回帰試験合格 | 実端末、実IME、OSジェスチャー競合 |
| 追加 PWA | 更新15項目とオフライン回帰試験合格 | Android Chrome/iPhone Safariでのインストール、ホームアイコン、standalone起動、OS終了・再開、実機更新 |

mainへのpush・マージ、本番デプロイ、正式URLの配信変更は行っていない。プリプロ名人は変更していない。実機・公開確認を完了扱いにしない。
