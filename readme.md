# セッション攻撃テスト

このリポジトリには簡易的な Node.js サーバーと、Web セッションの挙動をログ取得するユーティリティが含まれています。`attack_patterns.py` では認証なしアクセスやトークン再利用など、10種類の異常パターン (A1–A10) を実演します。

## 使い方

Node の依存モジュールと Python パッケージをインストールします。

```bash
npm install
pip install -r requirements.txt
```

次に npm 経由で攻撃シーケンスを実行します。

```bash
npm test
```

ログは `resource/logs/request_log.csv` に書き出されます。

### シナリオ

典型的な Web サービスの正常／異常フローを `src/scenarios/` 以下に用意しています。正常シナリオではショッピングやフォーラム利用を模擬し、異常シナリオでは認証抜けや順序違反などの動作を記述しています。これらの JSON ファイルをキャプチャ用ルートから実行することで、モデル学習用の操作ログを追加生成できます。現在は30以上のシナリオを収録しており、EC購入やカート操作、掲示板投稿、エラーケース、ストレスパターンを網羅しています。最新バージョンでは `/profile` と `/search` エンドポイントが追加され、正常シナリオではそれらを訪問する流れが含まれ、異常シナリオでは未認証アクセスや順序違反のプロフィール更新をテストします。

### LSTM 学習

正常系列と異常系列を分類するための簡易 TensorFlow トレーナー `lstm_train.py` を用意しています。次のように実行してください。

```bash
python lstm_train.py --model my_model.h5 --output-dir runs/exp1
```

標準では `resource/logs/` 内の正常・異常 CSV を読み込みます。`--normal` や `--abnormal` で別ファイルを指定可能です。`--model` で既存モデルを読み込み、`--output-dir` で学習結果の保存先を変更できます。

GPU を用いる場合はデバイス番号を指定します。

```bash
python lstm_train.py --model my_model.h5 --output-dir runs/gpu --gpu 0
```

`--gpu` を省略した場合は CPU のみで学習します。GPU 対応 TensorFlow がインストールされていることを確認してください。

### 次ステップ予測

各時点で次のエンドポイントを予測するシーケンス学習には `lstm_sequence_train.py` を使用します。

```bash
python lstm_sequence_train.py --log resource/logs/normal_log.csv --model seq_model.h5
```

このモデルはワンホット入力を用い、各時刻ごとに利用可能なエンドポイントの分布を出力します。
