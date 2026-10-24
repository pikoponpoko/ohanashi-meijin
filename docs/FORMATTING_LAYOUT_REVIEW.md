# 追加書式・執筆領域・推定尺のレビュー

2026-10-24。`feat/paragraph-formatting` は `preview/txt-pwa` を基点とした追加差分。取得し直した最新mainは `e0359687ff29f16a86be8746d49f3d6b9b14af18`。引継ぎコミット `9e7ad0bdf91c6acf60ebc87df28367ddecfb8c81`、PWA・TXT修正・画面対応・集中モードの既存実装を継承している。元の作業ブランチと保存キー `scenario-meijin-v1`、v2形式は維持した。

[試用プレビュー](https://writing-review-ohanashi-meijin.pikoponpoko.workers.dev/)・[レビューPR #5](https://github.com/pikoponpoko/ohanashi-meijin/pull/5)。アップロード元は `92f590c70c05641459273a1f5fb3f60c609fe730`、Cloudflare版は `ec2e9357-58e7-4d40-be95-ca9a88b9e2d4`。後続コミットは資料更新のみ。管理環境のCONNECTプロキシがプレビュー用サブドメインへのアクセスを403で遮断するため、このURL上の表示・外部到達は未確認。アップロード自体は成功している。

`versions upload` のみを実施し、本番へのデプロイは行っていない。APIでアップロード直前・直後のデプロイ一覧と配信比率の一致を確認した。作成日時で選んだ最新本番デプロイは `1fcd447a-c240-4d0c-ae53-e3f653cebfde`。記録は [preview.json](test-results/formatting-layout/preview.json)。

## 操作と配置

- 通常画面の左サイドバーを廃止し、章名から章一覧を開く。章追加・削除・分割・タイトル・進捗変更もこの一覧に配置。章の円形マーク `● / ◐ / ○` と全体の進捗計算・配色は従来どおり。
- 柱・ト書き・セリフ・自動整形・自動修正は上部ツールバー、方向切替・Aa・集中モードは1段のヘッダーに直接表示。新規・保存した原稿・バックアップ・読込・書出・テーマ・インストールは下部へ移した。保存した原稿／インストールは従来と同様、利用可能な場合に表示する。
- 本文の文字サイズ・フォント・行間・字間・内部余白・縦横組みを変更しない。4画面寸法・縦横書きの比較で同じ計算済みスタイルを確認。画面外側の配置変更で執筆領域を拡大した。新しい色・テクスチャー・立体装飾は追加していない。全体進捗の円グラフの描画は既存実装を継承。
- 集中モードでは本文の高さに応じてエディタ外側の上余白を調整。入力ごとには配置を再計算せず、開始・章変更・画面寸法変更時に調整する。左下に前の章、右下に次の章。端では無効化し、保存失敗やIME変換中には章移動しない。
- 章送りは `Alt+PageUp / PageDown`。Shift＋矢印の範囲選択を維持し、フッターにキーボードフォーカスがある場合も利用できる。
- 画面上のUndo／Redoボタンを削除。キーボード履歴と二本指Undo・三本指Redoは維持した。章一覧を閉じるタップが下のボタンに突き抜けないよう修正。
- スクロールバーは本文と新しい章一覧で操作中に表示。スクロール領域・ズーム・強制配色時の表示を維持。スマホは通常44pxの1段ヘッダーとコンパクトな上下操作領域を使い、visualViewport縮小にも追従する。

## 段落書式と自動整形

柱・ト書き・セリフのボタンは文言を挿入せず、選択が触れる段落全体の書式を変える。選択がなければカーソルのある段落に適用し、一括変更を1回のUndoで戻せる。カット境界は対象外。選択終端が次段落の先頭なら、その段落は含めない。

自動整形は自動修正と別のボタン。原文・現在の書式・提案・理由を確認して適用／キャンセルする。柱や話者付きカギ括弧、明示的な字下げなどを規則で判断し、曖昧な行は現在の書式を保持するか利用者が選ぶ。本文・改行・カットIDを変えない。柱は場面情報、ト書きの改行は個々の動作・描写、カギ括弧内の折り返しは同じ発話として扱い、カットや絵を自動生成しない。AI/APIは使わない。

書式は既存 `formats` に保存。空カット末尾の編集専用段落には任意の `placeholderFormat` を使い、空行を本文に追加しない。保存・再読込・コピー／貼付・章分割・印刷／PDFで書式を維持する。

## 縦書きの位置

ASCIIの1〜2文字は従来の縦中横を維持。全角数字・全角感嘆符・全角疑問符だけ、縦書きと印刷で `palt / vpal` を無効にする。本文全体の字間や位置は動かさず、横書きには適用しない。マークアップはエスケープ前の文字列を分割し、`< > &` 等の原文も保持する。

Fontsource 5.3.1のNoto Serif JP／Noto Sans JP／Zen Old Minchoを実際にロードし、14・19・28pxで比較。全角対象字形の横方向の平均絶対偏りは、Noto Serif JPが3.858→0.258px、Noto Sans JPが3.100→0.318px、Zen Old Minchoは0.154pxのまま。これは合成サンプルの画素重心によるChromium上の比較で、全字形・全OSの美観を保証する指標ではない。

## 推定尺の根拠と原本の結果

旧方式は「カギ括弧付き台詞の文字数÷速度＋ト書きと判断した各行×秒数」の単純合計。折り返された発話や本文扱いの番号行を過剰計上し、動作と台詞の重なりを扱っていなかった。

新方式は話者名・柱・空行・番号行を除き、開いたカギ括弧内の折り返しを同じ発話として集計する。カットごとに `max(台詞の秒数＋発話の間, 動作の秒数)＋カットの間` を合計する。設定で同時進行から順次加算にも切り替えられる。読み上げ速度・動作1行の秒数・発話の間・カットの間を作品単位で調整でき、表示をクリックすると内訳を確認できる。

提供されたJSON原本は5章・61個の保存済みカットID。本文扱いの番号行が別に83行あり、これらを尺から除いた。集計は台詞1,311字・110発話・動作328行。原本の速度300字／分・動作5秒を保った場合、旧方式38分59秒→新方式28分08秒。同じ原稿を動作2秒／行と仮定すると11分58秒、1.5秒なら9分21秒になる。これらは設定感度の例であり、12分に合わせて原本を変更したものではない。動作1行が何秒の演出になるかは本文だけでは確定できず、完成映像との精度比較は未実施。保存済み設定を上書きせず、演出に応じて調整してほしい。

JSON原本の本文にある全角空白付き番号が、再描画後に新しいカットへ変わる不具合も発見・修正した。既存JSONの83行を起動時に境界へ変換・削除しない。外部TXT読み込みの番号正規化とは区別する。旧原稿を元TXTから読み直す際は、バックアップまたは「新しい作品」で退避する。元TXT／当初指定の画面録画は未受領で、その資料そのものとの再現照合は未完了。

原本をリポジトリやプレビューへ同梱していない。独立したブラウザで、復元前バックアップ・全5章の再描画・保存／再読込・一括書式・整形プレビューと適用・空行整理・Undo／Redo・バックアップ出力を検証し、原本ファイルのバイト列も変更していない。

## 検証と資料

Linux Chromium 154／Playwright 1.62。ブラウザ保存領域は試験ごとに分離。

| 試験 | 合格数 |
|---|---:|
| 構文・既存7チェック・モデル・空行・TXT・PWA静的・書式・尺モデル | 全て合格 |
| 既存ブラウザ回帰 | 54 |
| 原稿保護・空行・新規開始・タッチ等 | 82 |
| TXT読込・番号・ID・履歴 | 38 |
| PWA更新・オフライン・失敗復旧 | 15 |
| 画面寸法・スクロールバー | 24 |
| 集中モード・章送り・全画面 | 28 |
| 一括書式・自動整形・原文保護 | 36 |
| 配置比較・主要ボタン・進捗・履歴・録画 | 115 |
| 実フォント位置・印刷／PDF | 79 |
| 提供JSON原本（非同梱） | 45 |

ログは [test-results/formatting-layout](test-results/formatting-layout)。UI移動に合わせ、旧Undoボタン操作をキーボードに、旧サイドバー操作を章一覧に置換した。比較基準はレイアウト変更直前のコミット `5584e92`。

主な再実行コマンドは `npm test`、`python tests/formatting.py`、`python tests/txt-import.py`、`python tests/pwa-update.py`、`python tests/adaptive.py`、`python tests/focus.py`、`python tests/layout.py`。Python依存は `tests/requirements.txt`、Chromiumはシステム実行ファイルを使用する。

配置比較は `git archive 5584e92 dist` を `/tmp/ohanashi-before-layout` に展開してから実行する。実フォント試験はFontsourceの `@fontsource/noto-serif-jp@5.3.1`、`@fontsource/noto-sans-jp@5.3.1`、`@fontsource/zen-old-mincho@5.3.1` を `/tmp/ohanashi-font-tests` にインストールし、`python tests/optical.py` を実行。原本試験は `SOURCE_PROJECT=/path/to/private.json python tests/source-project.py` とし、原本をリポジトリに追加しない。既存のbrowser/release試験は `dist` をローカルHTTPで配信し、`TEST_BASE_URL` を指定する。

[字形測定値](test-results/formatting-layout/optical-measurements.json)・[Noto Serif JPのPDF](screenshots/optical/Noto-Serif-JP-print.pdf)・[Noto Sans JPのPDF](screenshots/optical/Noto-Sans-JP-print.pdf)・[Zen Old MinchoのPDF](screenshots/optical/Zen-Old-Mincho-print.pdf)も参照。PDFは従来と同じ画像方式で、文字検索・文字選択には対応していない。

| 比較 | 修正前 | 修正後 |
|---|---|---|
| PC | [画像](screenshots/layout/desktop-before.png) | [画像](screenshots/layout/desktop-after.png) |
| スマホ縦 | [画像](screenshots/layout/phone-before.png) | [画像](screenshots/layout/phone-after.png) |
| スマホ横 | [画像](screenshots/layout/landscape-before.png) | [画像](screenshots/layout/landscape-after.png) |
| キーボード相当の高さ | [画像](screenshots/layout/keyboard-before.png) | [画像](screenshots/layout/keyboard-after.png) |

[PC集中モード](screenshots/layout/desktop-focus.png)・[スマホ集中モード](screenshots/layout/phone-focus.png)・[PC操作録画](recordings/desktop-operations.webm)・[スマホ操作録画](recordings/phone-operations.webm)。画像・録画には合成原稿を使用。配置比較の画像はシステム日本語フォントへのフォールバックを含み、実フォントの位置比較・PDFは別試験で確認する。

実Android／iPhone、Safari、実日本語IME、実ソフトウェアキーボード、OSジェスチャー競合、PWAインストール、Dropbox実プロバイダーは未確認。画面寸法変更・IMEイベント・タッチ入力の自動試験を実機確認とは扱わない。

JSON連携は[仕様案PR #3](https://github.com/pikoponpoko/ohanashi-meijin/pull/3)で別レビュー。共通スキーマは未確定で送受信実装を進めていない。プリプロ名人は未変更。正式ロゴ・アイコンは素材待ちで仮画像を維持。mainへのpush・マージ、本番デプロイは実施しない。
