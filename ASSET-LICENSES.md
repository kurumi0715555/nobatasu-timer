# 第三者素材とライセンス

## Font Awesome Free 6.4.0

配布元: [Font Awesome 6.4.0](https://github.com/FortAwesome/Font-Awesome/tree/6.4.0)。取得には版固定の `@fortawesome/fontawesome-free@6.4.0` 配布物を使用しました。

| 同梱パス（`common/vendor/fontawesome/`以下） | 元ライセンス | 権利表示 |
|---|---|---|
| `css/fontawesome.css`, `css/solid.css` | MIT | Copyright 2023 Fonticons, Inc. |
| `webfonts/fa-solid-900.woff2`, `webfonts/fa-solid-900.ttf` | SIL OFL 1.1 | Copyright (c) 2023 Fonticons, Inc.; Reserved Font Name: Font Awesome |

全ファイルを無改変で同梱しています。原文の [LICENSE.txt](common/vendor/fontawesome/LICENSE.txt) とファイル内コメントを保持します。取得URL・サイズ・SHA-256は [provenance.json](common/vendor/fontawesome/provenance.json) に記録しています。

上流LICENSEにはSVG/アイコンJS向けのCC BY 4.0の説明もありますが、この候補にSVG/アイコンJSは含めていません。上流の複合ライセンスを、すべてAGPLまたはMITに読み替えないでください。

## その他

- システムフォントはCSSで指定するだけで、フォントファイルを再配布しません。
- 通知音はWeb Audioで生成し、外部の録音・音楽ファイルを使用しません。
- 公式ブランド画像は同梱していません。
- Docker/Python/Node/Playwrightは開発・検証環境です。第三者ソースを本アプリのAGPLへ変更しません。依存更新時は配布対象と必要な通知を再確認します。
