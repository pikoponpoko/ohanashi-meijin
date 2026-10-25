# Windows デスクトップ版

WebのService Worker退役を本番確認した後、`feat/windows-desktop` で実装。
Webの `dist/` は変更せず、Electron専用の `desktop/web/` に生成する。

## 利用とデータ移行

Windows x64用インストーラーは `OhanashiMeijin-0.1.0-x64-Setup.exe`。
生成成功はGitHub ActionsのWindows desktopワークフローと成果物で確認する。
未署名のためWindowsのSmartScreen警告が出る場合がある。署名・一般公開は未実施。

ブラウザ版の「保存」でJSONを書き出し、デスクトップ版の「開く」で取り込む。
ブラウザのlocalStorageや原稿は変更しない。取込前のデスクトップ原稿は既存の退避機能で保持する。
JSON/TXT/MDを開く処理、Undo/Redo、章操作、PDFはWeb版と同じ資産を使う。
日本語3書体・PDFライブラリを内蔵し、CloudflareやGoogle Fontsへの接続を必要としない。

「アップデートを確認」はデスクトップ版だけに表示され、既定ブラウザで
https://github.com/pikoponpoko/ohanashi-meijin/releases を開く。
新しいインストーラーで同じアプリを置き換える。自動ダウンロード・自動更新は行わない。

## 保存先と保護

Windowsでは `%APPDATA%\OhanashiMeijin` を固定のデータ保存先にする。
版番号やインストール先に依存しない。NSISには `deleteAppDataOnUninstall: false` を設定。
インストール先の変更や新版のインストールで原稿領域を消す処理はない。

ChromiumのlocalStorageを維持し、各setItem後の全キー・値の文字列を
`manuscript-backups/storage.json` に同期保存する。別の一時ファイルに書き、fsync後にrenameする。
直前の正常なスナップショットは `storage.previous.json` に保持する。
localStorageが完全に空の場合だけディスク上の予備コピーから復元する。
既存・破損localStorageを自動的に置き換えない。破損したディスクコピーも上書きしない。
ディスク保存失敗はアプリに返して保存失敗と表示し、未保存状態での通常終了を止める。
終了直前の入力はbeforeunloadで保存する。強制終了・OS障害時には最後の保存以降の入力が残らない可能性がある。

JSONの保存・開くはネイティブダイアログを使用。パスはメインプロセス内に保持し、
rendererには選択したファイルのトークンだけを渡す。選択していないファイルは読めない。
上書き保存も一時ファイル→fsync→renameで行う。キャンセル時は元原稿を保持する。
RendererはNode無効、contextIsolationとsandbox有効。外部ナビゲーションと外部アプリ通信を遮断し、
IPCはメインフレームとアプリのオリジンを確認する。

## 開発・ビルド

Node 24を使用する。

```sh
npm ci --prefix desktop
npm --prefix desktop test
npm --prefix desktop run prepare:assets
npm --prefix desktop run test:electron
npm --prefix desktop run start
npm --prefix desktop run dist:win
```

成果物は `desktop-release/`。生成物とnode_modulesはGit管理しない。
CIはWindows上で単体・Electron試験後にNSIS EXEを生成し、SHA256とともにActions成果物へ保存する。
GitHub Releasesへの公開は行わない。macOS向け `dist:mac` の構成も用意しているが、
macOSビルド・署名・notarizationは将来の確認事項。

このクラウド環境ではElectron試験のローカルデバッグ接続にnetwork追加権限が必要。
`OHANASHI_TEST_USER_DATA` は専用試験プロファイルの指定専用で、通常利用では未指定にする。
LinuxのWine11ツールセットはkernel32.dll等の不足でNSIS処理に失敗したため、
不完全なローカルEXEを配布しない。Windows CIの成功した成果物を使用する。

## 検証状況

Linux headless Electron 45で18項目成功：起動・権限境界・内蔵フォント・外部通信拒否、
Undo/Redo・全localStorageのディスク予備コピー、ネイティブJSON保存・取込と元原稿の退避、
オフラインPDF、終了直前入力保持と3回の再起動、空プロファイルの予備コピー復元。
保存スナップショットの再読込、直前コピーへのフォールバック、破損データの上書き防止も単体試験済み。
Windows CI実行、Windows実機でのインストール・旧版置換・OS再起動は別途確認する。
