# おはなし名人：クラウド再開用引継ぎ

> 2026-10-24 追加作業の現在地：`feat/paragraph-formatting`、[PR #5](https://github.com/pikoponpoko/ohanashi-meijin/pull/5)、[レビュー資料・原本検証・画像・録画](FORMATTING_LAYOUT_REVIEW.md)、[プレビュー](https://writing-review-ohanashi-meijin.pikoponpoko.workers.dev/)。PWA/TXT等の統合ブランチ `preview/txt-pwa` を継承し、一括書式・自動整形・執筆領域の拡大・尺計算を追加。原本45項目・PWA更新15項目を含む検証は合格。原本はリポジトリに同梱しない。実機とプレビューURL上の表示確認は未完了。main・本番・プリプロ名人は変更していない。以下の古いサイドバーや作業ブランチの記述は当初の引継ぎ時点の記録。

> 2026-10-24 クラウド再開後の最新結果：[PWA修正・レビュー資料](PWA_REVIEW.md)。PWA更新15項目、既存54項目、追加82項目、Nodeチェックが合格。以下は引継ぎ時点の記録で、PWA未合格・修正案未適用の記述は過去の状態。元9項目の原本も追加添付後に全文確認し、[原文照合資料](ORIGINAL_REQUIREMENTS_REVIEW.md)を追加済み。実機確認と本番公開は未実施。

2026-10-24。GitHubの `fix/pwa-blank-manuscript` へローカル作業を保存するためのWIP引継ぎ。ユーザーは専用ブランチへのコミット・pushのみ承認した。**mainの変更・マージ・本番デプロイは承認されていない。**

## 最初に確認すること

- 正規リポジトリ：`pikoponpoko/ohanashi-meijin`。
- 作業ブランチ：`fix/pwa-blank-manuscript`。mainからやり直さず、このブランチの実ファイルを確認する。
- 作業の基点：`e0359687ff29f16a86be8746d49f3d6b9b14af18`。
- 正式公開先：既存Cloudflare Worker `ohanashi-meijin`、`https://ohanashi-meijin.pikoponpoko.workers.dev/`。今回変更していない。新しい本番WorkerやSitesを作らない。
- 既存の変更を破棄・上書きしない。プリプロ名人は変更しない。

## このブランチに保存したもの

ソースの変更済み7ファイルと新規9ファイルをそのまま保存する。実装済み部分の作り直しや、未合格テストを合格させる追加修正は引継ぎ保存時には行っていない。

- manifest、仮PNGアイコン、インストール導線、オフライン用service worker。
- 「自動修正」内の明示的な「空行を削除」。空白のみの段落を除去し、本文・カットID・書式を保持。従来の空行圧縮も維持。
- 空カット末尾の編集用段落と保存本文を区別し、不要な空行の再発を防止。
- 「新しい作品」「保存した原稿」。原稿をブラウザ内に退避して空白作品を開始し、以前の作品を開き直す。容量不足では切替を中止。破損原稿の生データも回収できる。
- 文字数から内部カットラベルを除外。保存キー `scenario-meijin-v1` と既存v2形式は維持。
- タッチ対応のスマホ横画面にもサイドバーのオーバーレイを適用。
- 追加モデル／PWA／ブラウザ試験。

原本9項目の番号別照合と実装上の制限は [保存前の引継ぎ記録](handoff-before-push.md) を参照。この記録の「未コミット・未push」は保存前の状態を示す。現在のGitHub状態はブランチの実コミットを基準に確認する。

元9項目の指示書はこのローカルチャットで全文を確認済み。原本そのもののリポジトリへのコピーは未完了のため、クラウドにも再添付する。PWAは元9項目とは別の追加要望。旧い監査で「原本未回収」と書かれた箇所は、その監査時点の記録である。

## テスト結果と未完了事項

| 試験 | 結果 |
|---|---|
| 既存の構文／7チェック／モデル試験 | 合格 |
| 追加の空行モデル／PWA静的試験 | 合格 |
| `tests/browser.py` | 54／54合格 |
| `tests/release.py` | 82／82合格 |
| `tests/pwa-update.py` | **未合格。再開後の最優先課題** |
| Android／iPhone実機、インストール、Dropbox実プロバイダー、実IME、OSジェスチャー競合 | **未確認** |

ログは `docs/test-results/`。54・82チェックはWindowsの専用Chromium、独立した保存領域で実施した。Webフォント通信を止めているため、PDFの実日本語フォント品質を検証済みと扱わない。PDFは既存の画像方式で、文字検索・文字選択はできない。

### PWA更新試験を合格扱いにしない

`tests/pwa-update.py` は初回SWの有効化／制御待機で停止している。最後の診断ではactiveがnullの時点でscriptURLを参照しており、テスト側の非同期待機を直す必要がある。

修正案は、`page.evaluate` で `navigator.serviceWorker.ready` をawaitし、登録オブジェクトを保持してから、`wait_for_function` にはPromiseではなく `registration.active?.state === 'activated'` 等の同期条件を渡すこと。更新後のwaiting状態も同様に扱い、失敗通知Promiseは`page.evaluate`でawaitする。この修正案は未適用。直前の修正・再実行は承認審査サービスの利用上限で実行されなかった。

テストの待機修正後、以下を実際に検証する：新版が編集中に待機すること、全画面を閉じた後の有効化、原稿・ID保持、他アプリのキャッシュ保持、事前キャッシュ失敗時の旧版継続、失敗後のオフライン起動。実装の不具合か試験の不具合かを切り分け、未合格を成功と報告しない。

## 再実行

Node.jsとPythonを準備し、`tests/requirements.txt`の範囲でPlaywrightとPyMuPDF、Chromiumを導入する。

```sh
npm test
python -m http.server 8767 --bind 127.0.0.1 --directory dist
```

別ターミナルで `TEST_BASE_URL=http://127.0.0.1:8767` と `TEST_OUTPUT_DIR` を明示して `python tests/browser.py`、`python tests/release.py` を実行する。`tests/pwa-update.py` は専用テストサーバーを内部起動する。テストは必ずユーザー原稿と独立したブラウザ環境で行う。

SWはアプリ画面を強制リロードしない設計。今後キャッシュ対象ファイルを変更する際は `dist/sw.js` のキャッシュバージョンも更新する。原稿をキャッシュ消去や移行で失わせない。

## 続行の範囲

このブランチで残件の調査・修正・テスト・レビュー用差分を用意する。元9項目の未確認事項も更新する。mainへ直接pushせず、マージ・本番公開はユーザーの別途明示承認後に限る。公開・プレビューを用意できない場合は、できたと称さず理由を報告する。
