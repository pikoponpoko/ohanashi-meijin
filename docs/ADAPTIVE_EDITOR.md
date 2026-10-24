# 画面サイズ追従とスクロールバーの自動非表示

main `e0359687ff29f16a86be8746d49f3d6b9b14af18` から独立した追加機能。前回のPWA・空行削除・空白原稿・スマホ横画面対応ブランチは未マージのため取り込まず、再実装しない。

- `viewport.js` がVisualViewportとwindowのサイズ変更を監視し、shellの高さだけを更新する。本文DOMや保存設定を再構築しない。OSキーボードを想定した低い表示領域と狭い幅の配置をCSSで調整。
- ピンチズーム中のVisualViewportには追従しない。ブラウザのズーム・パンを奪わない。入力中も原稿の文字・フォント・方向・文字サイズや選択範囲を変更しない。
- 縦/横書きエディタとサイドバーのスクロールバーは、幅・ヒット領域を残して色を透明化する。スクロール・ホイール・フォーカス・キー操作・端へのポインター移動で表示し、1.2秒後に隠す。ドラッグ中は維持。高コントラスト設定ではOSのスクロールバーを表示する。色は既存テーマ変数のみ。
- 通常のPC配置、保存キー、カットID、既存のUndo/Redo、PDF、JSONは変更しない。正式アイコン・ロゴの画像は作成・差替えしない。Dは素材待ち。既存のbrand文字領域と前回PWAの192/512px差替え口を維持し、素材受領後に縦横比・余白・表示サイズを確認する。

## 検証

Linux Chromium 154、Playwright 1.62、新しい保存領域。`npm test` 合格、`python tests/adaptive.py` 24項目合格、既存 `tests/browser.py` 54項目合格。ログは [追加確認](test-results/adaptive/acceptance.txt)・[既存回帰](test-results/adaptive/browser-54.txt)。外部Webフォント通信は停止。

390×844、844×390、600×800、1000×700、360×280、320×640、1280×900へ同じ原稿を表示したまま変更し、本文・保存JSON・設定・選択範囲の不変と編集領域を確認。縦/横方向の実ホイール、サイドバーのスクロール、明暗テーマ、forced-colorsを確認。

[スマホ配置](screenshots/adaptive-phone.png) / [キーボード相当の低い画面](screenshots/adaptive-keyboard-size.png)。レイアウトの採否はプレビューと画像でユーザーレビューする。

実Galaxy Z Fold等の開閉、実OSの画面分割、Android/iPhoneのキーボードとIME、Safari/Firefox、OSのスクロールバー設定・スクリーンリーダーは未確認。画面サイズのシミュレーションを実機試験と扱わない。OSがVisualViewportの高さを更新しない環境はCSSのdvh/リサイズイベントへフォールバックする。

前回PWAブランチが先にマージされた場合、`index.html` のscript列と `package.json` の構文検査を両方維持して統合し、SWの事前キャッシュに `viewport.js` を追加・キャッシュバージョン更新・PWA回帰を実施する。独立PRをそのままオフライン対応済みと扱わない。
