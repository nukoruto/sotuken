# セッション攻撃テスト

このリポジトリには簡易的な Node.js サーバーと、Web セッションの挙動をログ取得するユーティリティが含まれています。`attack_patterns.py` では認証なしアクセスやトークン再利用など、10種類の異常パターン (A1–A10) を実演します。

## 使い方

Node の依存モジュールと Python パッケージをインストールします。

```bash
npm install
pip install -r requirements.txt
```

次に npm 経由でテストを実行します。

```bash
npm test
```

このコマンドではサーバを起動し、正常ログと異常ログを取得した後、正常ログを用いた LSTM 学習と評価を自動的に行います。生成されたログは `resource/logs/normal_log.csv` と `resource/logs/abnormal_log.csv` に保存されます。

### 正常ログの取得

手動で正常系列だけを記録したい場合は、`resource/normal_logger.js` を実行します。以下のプロンプトを参考にしてください。

```bash
node resource/normal_logger.js --n 50 --d 100 --p 4
```

上記では 50 本の正常操作系列を 100ms 間隔で開始し、最大4並列で実行します。各操作間にはエンドポイントに応じた人間らしい遅延(ログイン後は0.5〜1.5秒、ページ閲覧後は数秒〜数分など)が挿入され、結果は `resource/logs/normal_log.csv` に追記されます。

### 異常ログの取得

異常操作系列を生成するには `resource/abnormal_logger.js` を使用します。

```bash
node resource/abnormal_logger.js --n 50 --d 100 --p 4
```
こちらは 50 本のランダムな異常シナリオを最大4並列で実行し、`resource/logs/abnormal_log.csv` に保存します。各操作も人間的な遅延を挟みます。

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

各時点で次のエンドポイントを予測するシーケンス学習には `lstm_sequence_train.py` を使用します。主要なパラメータは `config.yaml` の `sequence_model` セクションにまとめられており、`--gpu` オプションでGPUを指定できます。

```bash
python lstm_sequence_train.py --gpu 0
```

このモデルはワンホット入力を用い、各時刻ごとに利用可能なエンドポイントの分布を出力します。

### 各スクリプトのオプション

主要な実行ファイルと設定ファイルの引数および既定値を以下にまとめます。

| ファイル | オプション | 既定値 | 説明 |
| --- | --- | --- | --- |
| attack.py | `--h` | `10` | 表示するログ行数 |
| attack_patterns.py | `--h` | `20` | 表示するログ行数 |
| normal.py | `--h` | `10` | 表示するログ行数 |
| lstm_train.py | `--gpu` | `None` または `config.yaml` の `GPU` | 利用する GPU 番号 |
|  | `--config` | `config.yaml` | 設定ファイルパス |
|  | `--normal` | `resource/logs/normal_log.csv` | 正常ログ CSV |
|  | `--abnormal` | `resource/logs/abnormal_log.csv` | 異常ログ CSV |
|  | `--model` | `lstm_model.h5` | モデルファイル |
|  | `--output-dir` | `<モデル名_日付>` | 学習結果保存先 |
| lstm_sequence_train.py | `--gpu` | `None` または `config.yaml` の `GPU` | 使用 GPU |
|  | `--config` | `config.yaml` | 設定ファイルパス |
|  | `--log` | `config.yaml` の `data.sequence_log` | 学習用ログ |
|  | `--model` | `config.yaml` の `sequence_model.path` | 保存するモデル |
|  | `--epochs` | `config.yaml` の `sequence_model.epochs` | エポック数 |
|  | `--units` | `config.yaml` の `sequence_model.units` | LSTM ユニット数 |
|  | `--dropout` | `config.yaml` の `sequence_model.dropout` | Dropout 率 |
|  | `--second_lstm` | `config.yaml` の `sequence_model.second_lstm` | 2 層目 LSTM を追加 |
| resource/normal_logger.js | `--n` | `100` | 生成する正常系列数 |
|  | `--d` | `100` | 各系列間の待ち時間(ms) |
|  | `--p` | `1` | 同時実行数 |
| resource/abnormal_logger.js | `--n` | `100` | 生成する異常系列数 |
|  | `--d` | `100` | 各系列間の待ち時間(ms) |
|  | `--p` | `1` | 同時実行数 |
| test.js | `--n` | `100` | 正常系列数 |
|  | `--d` | `100` | 正常 delay(ms) |
|  | `--an` | `100` | 異常系列数 |
|  | `--ad` | `100` | 異常 delay(ms) |
| config.yaml | `model.embedding_dim` | `128` | 埋め込み次元数 |
|  | `model.lstm_units` | `100` | LSTM ユニット数 |
|  | `model.epochs` | `300` | 学習エポック数 |
|  | `model.batch_size` | `16` | バッチサイズ |
|  | `model.path` | `lstm_model.h5` | モデルパス |
|  | `data.normal` | `resource/logs/normal_log.csv` | 正常ログ CSV |
|  | `data.abnormal` | `resource/logs/abnormal_log.csv` | 異常ログ CSV |
|  | `data.sequence_log` | `resource/logs/normal_log.csv` | シーケンス学習用ログ |
|  | `sequence_model.units` | `100` | シーケンス LSTM ユニット数 |
|  | `sequence_model.dropout` | `0.0` | Dropout 率 |
|  | `sequence_model.epochs` | `20` | シーケンス学習エポック数 |
|  | `sequence_model.second_lstm` | `false` | 2 層目 LSTM 使用有無 |
|  | `sequence_model.path` | `seq_model.h5` | シーケンスモデルパス |
|  | `GPU` | `null` | 使用 GPU 番号 (無指定時 CPU) |

