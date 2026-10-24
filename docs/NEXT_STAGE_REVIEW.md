# 次段階追加機能：レビューと試用

2026-10-24 JST。main基点 `e0359687ff29f16a86be8746d49f3d6b9b14af18`。前回のPWA/原稿保護ブランチ `fix/pwa-blank-manuscript`（`904c477`）を保持し、重複修正していない。今回は独立ブランチで追加機能を作り、統合プレビュー用の `preview/next-stage` へだけ合流した。mainは未変更。

## 変更とPR

| 内容 | PR | 単独試用版 |
|---|---|---|
| 表示領域への追従、スクロールバーの自動非表示 | [#1](https://github.com/pikoponpoko/ohanashi-meijin/pull/1) | [adaptive](https://adaptive-ohanashi-meijin.pikoponpoko.workers.dev/) |
| 集中モードの画面上解除、ブラウザ全画面、専用領域のピンチ切替、安全な章移動 | [#2](https://github.com/pikoponpoko/ohanashi-meijin/pull/2) | [focus](https://focus-ohanashi-meijin.pikoponpoko.workers.dev/) |
| プリプロとの共通JSON仕様案・スキーマ・サンプル・受入条件（実装前） | [#3](https://github.com/pikoponpoko/ohanashi-meijin/pull/3) | 文書レビューのみ |

全PRはドラフト、承認待ち。プリプロ名人は参照のみ。共通JSONは未確定の仕様案で、ユーザー回答に従い送受信機能を実装していない。正式アイコン・ロゴの素材は未提供なので変更していない。

## 統合プレビュー

**https://next-stage-ohanashi-meijin.pikoponpoko.workers.dev/**

画面改善と集中モードをまとめた試用版。ソース `50111cb` のdistを既存Workerへ `wrangler versions upload` で追加し、production trafficへは割り当てていない。Worker版は `2c0cf5f3-8a99-41c2-a787-425ae58888d0`。固定版URLは https://2c0cf5f3-ohanashi-meijin.pikoponpoko.workers.dev/ 。

単独版のWorker版はadaptive `2576f55b-9cda-4fa7-9f6c-3151e36187e9`、focus `c68461cd-9638-4287-8917-9f811941d2b3`。Cloudflare APIで `enabled:true,previews_enabled:true` を確認した。ただし作業環境のプロキシがプレビュー用サブドメイン通信を403で拒否するため、公開URL上でのブラウザ動作は未確認。URL発行・設定確認とページ実動作確認は区別する。

本番のdeployment履歴と各versionへのtraffic割当てをアップロード前後で比較し、一致を確認した。`versions deploy`、mainへのpush/マージ、別Workerの作成はしていない。

## 試す操作

1. 画面の幅・高さを変更し、縦/横書きの本文や設定が変わらないことを確認。スクロール中のバー表示と、1.2秒後の非表示を確認する。
2. ⛶またはCtrl/Cmd+Shift+Fで集中モードへ。画面上の「集中モードを終了」で戻る。集中モード内の「全画面」はブラウザAPIによる別操作。
3. 集中/全画面中にAlt+PageUp/PageDownで前/次の章へ。Shift+矢印は本文選択のまま。先頭/末尾で折返さず、保存失敗時は移動を中止する。
4. ピンチ操作を試す場合は文字設定で専用領域の操作をON（初期OFF）。本文では通常ズームを利用し、専用領域で指を広げて開始・狭めて終了する。

各プレビューは本番と異なるoriginで、ブラウザ保存領域も別。本番原稿は自動転送しない。試用時はテスト原稿または利用者が選んだJSONバックアップを使う。

## 検証・残件

独立版と統合版で `npm test`、既存ブラウザ54項目、新規adaptive24項目、focus27項目が合格。統合時のindex.html・style.css・package.jsonの競合は、新しい両スクリプトと構文検査・スタイルを保持して解消した。ログは [test-results/next-stage](test-results/next-stage)。JSON仕様サンプルは別PRでSchema・ID一意性・表示連番・意図した差分を検証済み。

実Android/iPhone/Foldの開閉・OS画面分割・実IME/キーボード、Safari/iOS、実ピンチ・OSジェスチャー競合・支援技術、外部日本語Webフォントは未確認。自動試験や画面サイズのシミュレーションを実機完了として扱わない。

最新mainに未統合の前回PWAを、この試用版は含まない。前回PWAと機能PRを最終統合する際は、viewport.js/focus.jsの事前キャッシュ追加とキャッシュ版更新、82項目の追加回帰・PWA更新15項目を含めて再検証する。今回のmain基点PRに、それらを再実装して重複させていない。

mainへのマージ・本番公開、レイアウトの採用、JSON仕様の正式化はユーザーレビュー後。素材待ち以外では、実機確認と共通JSON仕様の合意・将来の両側統合実装が未完了。
