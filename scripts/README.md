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

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1): [3d3c42e5aac5ba805825da76410c181273ba90b1](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1)
- [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0): [820762786026740c76f36085b0efc47a31fe5020](https://github.com/actions/setup-node/commit/820762786026740c76f36085b0efc47a31fe5020)
- [upload-artifact v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1): [043fb46d1a93c77aae656e7c1c64a875d1fc6a0a](https://github.com/actions/upload-artifact/commit/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a)

Actions自身の実行環境はNode24です。ブラウザテスト用Node.jsは22を使い、setup-nodeの自動パッケージキャッシュは無効にしています。

CIの成功と公開ゲートは別です。候補の未確定事項は `release-readiness.json` と公開前レビューで管理し、公開・push・本番配信はそれぞれ承認後に実施します。

公開条件の記録確認は `python3 scripts/build.py --check --release` で行います。`status` が `ready-for-publication`、6つの確認項目がbooleanの `true`、実在する公開先と非公開脆弱性窓口が記録されたことをレビューしてから実行します。`security_reporting_verified`は、窓口を選んだだけではtrueにせず、実際の有効化と報告導線を確認して記録します。通知設定の確認状況は`security_notification_settings_verified`へ別に記録します。この検査は形式と記録を確認するもので、窓口の実在性や権利・承認の事実を自動検証しません。コマンドが成功しても外部操作は行いません。

## 正本と配布の関係

メンテナーはPrivateの固定抽出規則からこのソースツリーを生成します。外部PRは秘密なしで検証し、採用分をPrivateへ戻して再生成します。本repoのCIは検証のみで、公式本番のデプロイや本番Secretsを持ちません。

`source_distribution_verified` は独立ソースの再生成・単独起動・ZIP対応を確認した記録です。公式本番のソース対応とは別に検証します。公式本番は共通ヘッダーなどを含むため、本repoのZIPを公式本番の対応ソースと案内しません。
