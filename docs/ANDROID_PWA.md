# Android：ホーム画面から起動したときの上部バー（2026-10-30）

## 原因

- manifest は `display: "standalone"`、`id`・`scope`・`start_url` は `/` で、standalone 起動の条件を満たしている（変更していない）。
- 2026-10-25 の接続障害対策で Service Worker を退役させたため、Chrome の自動インストール案内（`beforeinstallprompt`）は出ない。アプリ内の「インストール」ボタンも表示されない。
- Chrome（Android 108 以降）はメニューの「アプリをインストール」なら Service Worker なしでもインストールできる。一方、「ホーム画面に追加」→「ショートカットを作成」で作ったアイコンはブラウザのタブとして開くため、アプリ名・URL・メニューのバーが出る。
- 上部バーが出ている端末は、ショートカットとして追加された可能性が高い（実機は未検証）。

## 変更

- `manifest.webmanifest`：`display_override: ["standalone"]`、`prefer_related_applications: false` を追加。`id`・`scope`・`start_url` は変更していない（既存のインストールはそのまま引き継がれる）。
- Service Worker の再登録はしていない。キャッシュ・保存データの削除はしていない。

## 端末での入れ直し手順

1. 入れ直す前に、アプリで「保存」または「別名保存」を押し、原稿の JSON を端末に保存する。
2. ホーム画面の古いアイコンを長押しして削除する（アイコンの削除だけでは Chrome のサイトデータは消えない。Chrome の「サイトの設定」からデータを削除しないこと）。
3. Chrome で https://ohanashi-meijin.pikoponpoko.workers.dev/ を開き、右上のメニューから「アプリをインストール」を選ぶ（「ホーム画面に追加」→「ショートカットを作成」は選ばない）。
4. ホーム画面のアイコンから起動し、上部にURLバーが出ないこと、原稿が残っていることを確認する。

## 未検証

Android 実機でのインストール・standalone 起動・再起動は、このクラウド環境では確認できない。
