# 履歴から回収した引継ぎ資料

出典：「おはなし＠クラウド」の2026-10-23実行ログ。以下は受領当時の資料であり、現在の作業指示ではない。監査用の原文記録。

# おはなし名人 修正作業の引き継ぎ（2026-10-23）

ユーザーの「ここで止めて引き継ぎをまとめる」という指示により中断。実装完了・公開済みとして扱わないこと。

## 作業元と保護したもの

- 対象 GitHub: https://github.com/pikoponpoko/ohanashi-meijin
- 実際のチェックアウト: `/workspace/ohanashi-upstream`
- 元コミット: `9fd7cd83222ebc5e7706f60d97484ce0a6eab7ec`
- 作業ブランチ: `fix/browser-nine-items`。まだコミット・push・PR作成を行っていない。
- `/workspace/shakutori-meijin` は変更していない。プリプロ名人も変更していない。
- 調査初期の別スナップショット `/workspace/ohanashi-meijin` は作業本体ではない。
- 添付指示書: `/workspace/attachments/91ca94bb-18e9-45fb-80d3-a2d0b435ebe6/おはなし名人_Codex修正指示書_2026-10-23_全9項目.md`
- READMEと添付patchは尺取名人向け。おはなし名人には適用していない。

## 調査した既存実装

ビルドなしのHTML/JS/CSS。原稿は localStorage `scenario-meijin-v1` に保存。旧形式は各章に本文 `text` を持つ。起動時のサンプル、表示依存の `innerText` によるシリアライズ、`Range.toString()` による章への移動、PDF/印刷共通の `window.print()`、復元時に毎回章IDを作り直す実装があった。アプリ全体のUndo履歴はなかった。

## 変更した内容（検証途中）

1. `dist/model.js`: バージョン2の保存形式・旧形式移行・検証・全章連番・空行整理。本文テキストを保持し、各章に `cuts: [{id,line}]` と必要に応じて `formats` を追加。明示的な `#C数字` 行だけを境界として扱い、空行は分割しない。旧重複番号/欠番はIDを作って連番化、空カットは保持。IDと章IDは再読み込みで維持。
2. `dist/app.js`: DOMの論理ブロックをシリアライズする `domLines`、カット表示、章移動、任意バックアップ削除、JSON内容検証と大文字拡張子対応、空白起動。旧保存データを `scenario-meijin-v1-before-v2` に退避。読み込み失敗時は自動保存を止め元データを保護。
3. `dist/editing.js`: 全作品状態のUndo/Redo（最大150状態、再読み込みまで）、Enter2回でカット分割、IMEガード、独自クリップボード形式でcopyは新ID/cut移動は条件付きID維持、段落構造付きRange移動、空行修復UI、スマホの閉じるオーバーレイ、時間・移動量を判定する2本指Undo/3本指Redo。
4. `dist/pdf.js` とvendor: 共通の印刷ページ組版をhtml-to-imageで高解像度画像にし、jsPDFでA4横PDFとして直接ダウンロード。画像PDFなので文字検索不可。通常の印刷ボタンは従来どおり。画像PDFの品質はまだ承認・最終検証していない。
5. HTML/CSS: 新スクリプト、Undo/Redoボタン、ブランド表示、制限なしfile input、スマホオーバーレイ、印刷とPDFの共通CSS。

TXT/Markdownは汎用テキストのまま内部IDを含まない。JSONにIDはあるが、プリプロ名人の受け入れ対応は未実施。番号だけで既存Vコンへ自動対応付けする機能は追加していない。

## テストと残作業

- `node check.cjs`: 元の7チェックが通過（ScriptModelへの依存をテスト側に追加）。
- `node tests/model.cjs`: 移行、ID維持、重複番号/空カット、空行修復、破損データ拒否、全章連番のチェックが通過。
- `python tests/browser.py`: 実際のChromiumとPlaywrightで先頭22チェックが通過。空白起動、既存原稿再読み込み、10回のシリアライズ、空行修復、5章への貼り付け、途中カット挿入、ID維持、キーボードUndo/Redo、全段落/段落途中の章分割、書式の保存復元、削除とキャンセル/バックアップ、制限なしfile input、不正JSON拒否、大文字JSONとgeneric MIME、IME Enterガード。
- 続く `direct PDF cover=False` のassertで停止。実際のダウンロードファイルは `%PDF-1.3` で始まり、PyMuPDFで8ページを開けた。失敗条件の切り分けが必要。テストの `page.evaluate('window.printCalls=0;window.print=()=>window.printCalls++')` が返す関数をPlaywright側が実行する可能性も調査対象。テストを通ったことにしてはいけない。
- PDF表紙あり、通常印刷、モバイルオーバーレイ、合成タッチのチェックはファイルにあるが、この実行では未到達。
- PDFと画像の検証成果物: `/workspace/scratch/ohanashi-tests/body.pdf`、`pdf-first.png`。
- ネットワークに依存しない検証としてブラウザテストはGoogle Fonts CSSをabortしている。実フォント取得時のPDF、禁則・長文・複数章・フォント各種の見た目は別途確認が必要。
- Android/iPhone実機、Safari/WebKit、Dropboxプロバイダー経由の実ファイル選択、OSジェスチャー競合は未検証。
- コピー/カットによる章間移動・途中削除・貼り付けの多様な選択範囲、履歴との整合、エラー時の原稿保護について追加レビューが必要。
- 保存前の構造整合、段落種別metadata、IME後のDOM再構築、履歴の対象範囲をレビューし、全9項目が満たされるか確認すること。
- vendorライブラリのライセンス文書の同梱は未完了（jsPDF 3.0.4 / html-to-image 1.11.13）。

ローカルテスト用サーバーのコマンド:

```sh
python -m http.server 8766 --bind 127.0.0.1 --directory /workspace/ohanashi-upstream/dist
cd /workspace/ohanashi-upstream
node check.cjs
node tests/model.cjs
python tests/browser.py
```

実行環境ではネットワークを使うexecに `with_additional_permissions` の `network.enabled:true` が必要だった。通常sandboxでのGit cloneはproxy接続失敗、許可付きでGitHub cloneは成功した。プロキシを迂回していない。

## 公開状況

**一切更新していない。修正を試せる公開URLは未発行。**

Sitesに既存「脚本名人」が見つかったが、指示書の対象「おはなし名人」と同一サイトか、公開前に確認すること。

- 既存URL: https://scenario-meijin-pikop.shadyvole2049.chatgpt.site （今回の修正は未反映）
- project_id: `appgprj_6ada9de3df98819183e7712f01898140`
- バージョン1のみ。旧公開コミットは `b7640aec1ad6a40ca3a409060f18adca7f97dbcf`。GitHubの取得元とは別のコミット。
- audienceはownerだけのcustom設定。勝手に一般公開しない。
- 短期ソース資格情報を取得してGit cloneを試したが、サーバーがHTTP 500を返した。資格情報はファイルに保存していない。再開時に必要なら再取得する。
- Sitesスキルの推奨 `site-workflow.mjs` は実行環境内で見つからず、skill resource経由の取得も失敗。旧版archiveもdownload_fileでは取得できなかった。
- これらの制約により公開用ソースの比較・取得・同期、保存バージョン作成、デプロイは未実施。旧公開サイトを上書きしていない。

次の担当者はまず差分をレビューし、残りの検証と公開経路を解決してから反映すること。
