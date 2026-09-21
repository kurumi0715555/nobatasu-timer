# 配布物の生成

Python 3.9以降の標準ライブラリだけを使います。Python用パッケージのインストールは不要です。

```sh
python3 scripts/build.py --check
python3 scripts/build.py
python3 scripts/test_build.py
```

`build/site/` がWeb配信する全ファイルです。`build/build-manifest.json` は配信外に保持する記録で、元ソース全件とWeb配布ファイルのSHA-256を含みます。ビルド成功は公開承認や権利確認の代わりにはなりません。

`scripts/package-manifest.json` の `source` に明記したファイルだけを読み込み、`runtime` に明記したファイルと対応ソースZIPをWeb配布物へ含めます。ZIPは `source/timer-source.zip` です。ZIPの中にはREADME、テスト、ビルド手順、CI、第三者ライセンスも含まれ、そのZIPだけを展開して同じ配布物を作れます。日時を固定したZIPなので、同じ入力から同じハッシュが得られます。

ファイルを追加する場合は権利・公開内容を確認し、manifestと `.dockerignore` の許可リストを両方更新してください。未知のファイル、symlink、秘密ファイル名を検出した場合は処理を停止します。`.git/`、開発依存、テストレポート、Pythonキャッシュ、既存buildはソースの読み込み対象外です。秘密ファイルを作成・読み込みする手順はありません。

再実行時は前回の出力記録と実ファイルのハッシュを照合します。出力側に追加ファイルや手動編集がある場合、上書き・削除せず失敗します。必要な変更をソースへ戻し、`build/` を別の場所へ移して内容を保持してから再生成してください。Web配布物を直接編集すると、同梱ZIPとの対応が失われます。

Dockerはソース許可リストで制限したcontextをPythonのビルド段階に渡し、PHP/Apacheの最終段階には `build/site/` だけをコピーします。初回は `docker compose up`、変更後は `docker compose up --build` でビルドします。ホスト側の `build/` や `node_modules/` は使いません。

## CI

外部PRとpushで同じ検証を行います。権限は `contents: read`、checkoutの認証情報永続化は無効です。本番Secrets、特権イベント、デプロイ処理はありません。Docker起動・ブラウザ検証が成功した場合にローカル候補成果物を7日保存します。Actionsは次の公式リリースが指すコミットへ固定しています（2026-09-21確認。最新版を示す一覧ではありません）。

- [checkout v4.2.2](https://github.com/actions/checkout/releases/tag/v4.2.2): [11bd71901bbe5b1630ceea73d27597364c9af683](https://github.com/actions/checkout/commit/11bd71901bbe5b1630ceea73d27597364c9af683)
- [setup-node v4.4.0](https://github.com/actions/setup-node/releases/tag/v4.4.0): [49933ea5288caeca8642d1e84afbd3f7d6820020](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020)
- [upload-artifact v4.6.2](https://github.com/actions/upload-artifact/releases/tag/v4.6.2): [ea165f8d65b6e75b540449e92b4886f43607fa02](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02)

CIの成功と公開ゲートは別です。候補の未確定事項は `release-readiness.json` と公開前レビューで管理し、公開・push・本番配信はそれぞれ承認後に実施します。

公開前の記録確認は `python3 scripts/build.py --check --release` で行います。`status` が `ready-for-publication`、5つの確認項目がbooleanの `true`、実在する公開先と非公開脆弱性窓口が記録されたことをレビューしてから実行します。この検査は形式と記録を確認するもので、窓口の実在性や権利・承認の事実を自動検証しません。コマンドが成功しても外部操作は行いません。

## 配信分離のローカル試験

`python3 scripts/test_deploy_boundary.py` は一時ディレクトリ内の架空ファイルだけを使い、新旧配信とTimer限定の復旧を試験します。ネットワーク接続・SSH・本番ファイルへの操作はありません。実行に `rsync` が必要です。

推奨方式は各配信が所有するディレクトリを許可リストで限定し、ディレクトリ単位で同期する構成です。サイト全体のルートへ削除付き同期は実行しません。ルートファイルは許可した名前を削除オプションなしで個別コピーします。Timerの配信・復旧もTimerディレクトリ内へ限定します。試験は更新/削除の非干渉、正常版への復旧、通常のexcludeだけでは削除される対照ケースを確認します。

`--delete-excluded` と保護フィルターの組み合わせにはrsync実装差があり得ます。フィルターだけを配信所有権の境界にせず、同期先そのものを分けてください。CIでも同じ試験を実行します。本番では実際に使うクライアント・サーバー双方の組み合わせで再検証が必要です。

本番切替前には、実際の正常成果物の保管、既存CIの配信許可リスト適用、SSH転送先と末尾スラッシュの検査、サーバー上の権限、関係repoの実行中ジョブ停止、切替後の主要操作・対応ソース導線を別途確認します。この試験が成功しても本番変更の承認や配信ゲートの代わりにはなりません。
