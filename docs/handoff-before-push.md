# おはなし名人 クラウド引継ぎ

2026-10-24 JST。状態調査と退避の資料。コミット・push・mainマージ・本番デプロイはまだ実行していない。

## 現在地

- 正規の取得元・送信先：`https://github.com/pikoponpoko/ohanashi-meijin.git`（originのfetch／pushとも一致）。
- 実際の作業コピー：`C:/Users/pikop/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/work/ohanashi-meijin`。
- チャットの作業フォルダー自体はGitリポジトリではない。上記の子フォルダーが実体。
- 現在のブランチ：`fix/pwa-blank-manuscript`。追跡先は未設定。GitHubの同名ブランチ検索は0件。
- HEAD／ローカルmain／origin/main：`e0359687ff29f16a86be8746d49f3d6b9b14af18`。
- 今回GitHub APIで再確認したmainも同じSHA。作業コミットの先行・遅延は0／0だが、**未コミット差分はすべてローカル限定**。
- 正式公開先は既存Worker `ohanashi-meijin`、`https://ohanashi-meijin.pikoponpoko.workers.dev/`。この作業では更新していない。
- `reset`、`clean`、stash、差分を捨てるcheckout、強制pushは行っていない。

## ローカルだけにある修正

| 区分 | ファイル |
|---|---|
| 変更済み7ファイル | `dist/app.js`、`dist/editing.js`、`dist/index.html`、`dist/model.js`、`dist/style.css`、`package.json`、`tests/model.cjs` |
| 未追跡9ファイル | `dist/icons/icon-192.png`、`dist/icons/icon-512.png`、`dist/manifest.webmanifest`、`dist/projects.js`、`dist/pwa.js`、`dist/sw.js`、`tests/pwa-update.py`、`tests/pwa.cjs`、`tests/release.py` |

変更の内容：

- PWA用manifest、既存の配色による仮アイコン、インストール導線、アプリのオフライン用service worker。
- SWはアプリ画面を強制リロードせず、新版を待機させる設計。キャッシュ更新用の取得ではHTTPキャッシュの再利用を避ける。外部リクエストや原稿データをSWキャッシュへ保存しない。
- 「自動修正」に「空行を削除」を追加。単独／連続の空行、全角空白、タブ、NBSP、U+200B／U+2060のみの行を除去し、本文内のゼロ幅文字、カット境界・ID・書式を保持する。従来の「増殖した空行を整理」は残している。
- 末尾の空カットでカーソルを置く編集用段落を保存本文から区別し、描画・取得の繰り返しで不要な空行が戻らないようにした。
- 「新しい作品」から空白原稿を開始。現在の原稿を別キーへ保持し、「保存した原稿」から開き直せる。元の保存キーとv2形式を維持。容量不足などで退避できなければ切替を中止する。破損原稿は元の生データを退避してJSONで回収できる。
- 文字数は内部カットラベルを除外し、空白原稿は0字となる。カット表示自体は残す。
- タッチ対応の横長・低い画面にもモバイル用サイドバーを適用。通常PCのレイアウトは維持する。

作業対象はブラウザ版のみ。プリプロ名人のコードは変更していない。

## 原本の9項目との対応

元の「おはなし名人_Codex修正指示書_2026-10-23_全9項目.md」は再添付後に全文を読めた。PWAはこの9項目と別の追加要望。以下は原文の番号に対応する。原本ファイルのcheckoutへのコピーは未完了なので、クラウドへも原本を再添付すること。

| 番号 | 原本の要求 | 実装・試験と残件 |
|---|---|---|
| 1 | 改行・列間隔の異常拡大と自動修正 | 論理DOMシリアライズはmainに既存。今回、全空行削除と再発防止を追加。TXT／copy／cutを5章へ転送、空白種別別の削除、Undo／Redo、10回描画・保存・再読込が合格。ユーザーの実原稿と同じ入力による最終確認は残る。 |
| 2 | ラフ執筆のカット自動生成・採番 | mainの既存実装を維持。Enter2回、全章連番、ID保持、copy／cut／移動／保存復元を既存54チェックとモデル試験で確認。実IMEは未確認。番号だけでプリプロへ自動紐付けしない。 |
| 3 | PDF直接保存と通常印刷の分離 | mainの既存実装を維持。直接PDF、表紙有無、A4横、長文・複数章を回帰試験。PDFは画像形式。Google Fontsを停止した試験のため実フォント・禁則・字形の品質は完全検証済みではない。 |
| 4 | 選択範囲の章移動で書式保持 | mainの既存実装を維持。全段落・段落途中・カットを含む章分割、書式・ID・Undo／Redoを回帰試験。原録画と実原稿による同一操作は未確認。 |
| 5 | 章削除時バックアップ任意化 | mainに実装済み。バックアップ有無、キャンセル、削除Undoが回帰試験合格。作り直していない。 |
| 6 | スマホのDropbox JSON読込 | mainでaccept制限撤去・JSON検証済み。大文字拡張子・generic MIME・破損拒否が回帰試験合格。Android／iPhoneとDropbox実プロバイダーは未確認。 |
| 7 | サンプルを自動表示せず空白開始 | 新規起動の空白はmainに既存。今回、既存原稿を残したまま「新しい作品」を始める操作と再開導線を追加。サンプル名・編集済み・通常原稿・破損データ・容量不足を追加試験。既存作品を自動消去しないという原本の要件を守る。 |
| 8 | スマホの外側タップで閉じる | mainの背景オーバーレイを利用し横画面へ適用拡大。390×844／844×390の両方で本文不変の閉鎖を確認。実端末は未確認。 |
| 9 | 二本指Undo／三本指Redo | mainの履歴・タッチ判定を維持。縦横のChromiumタッチ入力、移動・長押し・時間差・キャンセル・IMEフラグ・ダイアログ・4本指・サイドバーの抑止を確認。OSジェスチャー競合は未確認。 |

## テスト結果

- Nodeの構文検査、既存7チェック、モデル試験、追加空行モデル試験、PWA静的／キャッシュ範囲試験は合格。
- `tests/browser.py`：**54／54合格**。ログは`修正後回帰テスト.txt`。
- `tests/release.py`：**82／82合格**。ログは`修正後追加テスト.txt`。空行削除、原稿切替／復旧、容量不足、manifest読込、アイコン寸法、オフライン再読込・編集保存、スマホ縦横とタッチ判定を含む。
- テスト環境：Windows、専用Chrome for Testing 156、独立したブラウザ保存領域。ユーザーの実原稿を使っていない。Webフォント通信を止めて実行。
- **`tests/pwa-update.py`は未合格**。更新ライフサイクル用に追加したが、初回SWの制御待機で停止。最後の診断実行ではactiveがnullの時点で参照しており、試験の非同期待機を直す必要がある。更新待機・更新失敗時の復旧は合格扱いにしない。
- 修正案：`page.evaluate`で`navigator.serviceWorker.ready`をawaitして登録をwindow変数へ保持し、`wait_for_function`にはPromiseではなく`registration.active?.state === 'activated'`等の同期条件を渡す。更新時も`registration.waiting`を同期条件で待つ。失敗通知用Promiseは`page.evaluate`でawaitする。これは**提案で、まだ未適用**。
- 上記修正・再実行をまとめた操作は、承認審査サービスの利用上限で実行されなかった。危険性判定による拒否ではない。直前の提案パッチも未適用と実ファイルで確認した。
- Android Chrome／iPhone Safariでの実際のインストール、Dropbox、IME、OSジェスチャー競合は未確認。

## ローカルの成果物と退避

引継ぎZIPには、現在の追跡ファイルと未追跡ソース、Git履歴bundle、追跡済み変更のbinary patch、テストログ・スクリーンショット・PDF・監査資料を格納する。依存ライブラリ本体、ブラウザ実行ファイル、秘密情報は格納しない。

`tracked-changes.patch`単独には新規ファイルが含まれない。必ず`source/`の新規ファイルも渡すか、承認後に専用ブランチへコミット・pushする。ZIPを開けば全ソースを確認できるが、ZIP作成をGitHub反映と扱わない。

ローカルのブラウザ用プレビューは`http://127.0.0.1:8767/`。同じPCのローカルサーバー起動中のみ利用可能。クラウドやスマホから使える公開プレビューURLではない。既存Workerに変更は加えていない。

## 承認後の安全なコミット・push手順（未実行）

1. 作業コピーの退避ZIPを確認し、`git status`と差分を再確認する。元の9項目原本とこの資料をリポジトリの`docs/`にも保存する。
2. `git fetch origin main`し、mainに新しい変更が入っていればまず比較する。無条件のreset／cleanや、未コミット状態のままのrebaseをしない。
3. 現在の`fix/pwa-blank-manuscript`がHEADであることを確認する。別ブランチの同名公開が新たにあれば比較し、上書きしない。
4. 下記の具体的なソース・テストと引継ぎ文書だけをstageする。依存環境や秘密情報を含む一括追加はしない。
5. テストの未合格状態を引継ぎ文書へ記載したまま、WIPコミットとして保存する。テスト完了を偽らない。
6. 専用ブランチだけをpushする。mainへのpush、force push、マージ、デプロイはしない。
7. GitHubでブランチのコミットSHAと全新規ファイルを確認してから、クラウド側でそのブランチを取得する。必要ならドラフトPRを作るが、この調査ではまだ作成していない。

```powershell
Set-Location 'C:/Users/pikop/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/work/ohanashi-meijin'
git status --short --branch
git remote -v
git fetch origin main
git diff --check
git diff --stat
git add -- dist/app.js dist/editing.js dist/index.html dist/model.js dist/style.css package.json tests/model.cjs dist/icons/icon-192.png dist/icons/icon-512.png dist/manifest.webmanifest dist/projects.js dist/pwa.js dist/sw.js tests/pwa-update.py tests/pwa.cjs tests/release.py
# docsへ保存した引継ぎ文書・原本も、内容を確認して個別に追加する。
git diff --cached --stat
git diff --cached --check
git commit -m 'WIP: add PWA and preserve manuscripts during cleanup and new drafts'
git push -u origin HEAD:refs/heads/fix/pwa-blank-manuscript
```

`git commit`の署名やユーザー設定が不足して失敗した場合は、勝手にグローバル設定を変更せず原因を報告する。GitHubの認証に失敗した場合も、既存認証の確認を行い、mainへ迂回して送信しない。

## クラウド側で最初に行うこと

正規リポジトリから専用ブランチを取得し、渡されたコミットSHAと一致することを確認する。mainへ切り替えて古い版からやり直さない。`git status`に予期しない変更があれば破棄せず確認する。

Node.jsとPythonを準備し、`tests/requirements.txt`の範囲でPlaywrightとPyMuPDFを導入、Chromiumを用意する。依存関係の導入後、`npm test`、ローカルサーバーを使う`tests/browser.py`と`tests/release.py`を実行する。`TEST_BASE_URL`と`TEST_OUTPUT_DIR`を明示し、ユーザーの保存データとは独立したブラウザで確認する。

最優先の残作業は、`tests/pwa-update.py`の待機処理を修正して実際の更新待機・全画面終了後の有効化・通信失敗・原稿保持を検証すること。次に元9項目の不足確認と実機チェックを進める。SWが配信ファイルを事前保存するため、今後アプリのキャッシュ対象ファイルを変更したら`dist/sw.js`のキャッシュバージョンも更新する。

元の9項目指示書、監査結果、監査後修正指示書、この引継ぎ資料を併読する。最新版のユーザー指示が優先であり、元資料に公開を求める記載があっても、**mainマージと本番公開は明示承認まで実施しない**。プリプロ名人は変更しない。
