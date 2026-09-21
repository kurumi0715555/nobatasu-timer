# セキュリティ報告

脆弱性の報告には、GitHubのPrivate vulnerability reportingを使用します。

[Security Advisories](https://github.com/kurumi0715555/nobatasu-timer/security/advisories)で **Report a vulnerability** が表示されていることを確認し、非公開フォームから報告してください。この機能の利用にはGitHubへのログインが必要です。

Privateの準備段階や機能が未有効の場合、フォームは利用できません。ボタンが表示されない場合も、未修正の詳細を公開Issueへ投稿しないでください。`release-readiness.json`の`security_reporting_verified`は、機能の有効化と報告導線を確認した記録です。通知設定は`security_notification_settings_verified`へ別に記録し、実際のメール配送を確認した意味にはしません。

メンテナーはGitHubの通知設定で、このリポジトリのSecurity alertsを受け取る設定を確認してください。通知に頼らず、Security Advisoriesも直接確認できます。

公開Issueやコメントへ、未修正の悪用手順・秘密値・個人情報を投稿しないでください。受付後は、影響する版、再現条件、修正・通知の範囲を非公開で整理します。

報告に必要なのはブラウザ、対象版、再現手順、期待する挙動です。授業の実データを送る必要はありません。対応日数の保証は設定していません。
