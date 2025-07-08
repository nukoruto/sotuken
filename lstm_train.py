import argparse
import csv
import os
from collections import defaultdict, Counter
from datetime import datetime
import yaml
import numpy as np

try:
    import matplotlib.pyplot as plt
except Exception:  # pragma: no cover - matplotlib may be missing
    plt = None

# --- GPU / 設定ファイル オプション先読み ------------------------------
pre_ap = argparse.ArgumentParser(add_help=False)
pre_ap.add_argument('--gpu', type=int, default=None,
                    help='利用するGPU番号。指定しない場合はCPUのみを使用')
pre_ap.add_argument('--config', default='config.yaml',
                    help='設定ファイル YAML のパス')
pre_args, _ = pre_ap.parse_known_args()

# 設定ファイルから GPU 指定がある場合は取得
cfg_gpu = None
if os.path.exists(pre_args.config):
    with open(pre_args.config, 'r') as f:
        cfg = yaml.safe_load(f) or {}
        cfg_gpu = cfg.get('GPU')
else:
    cfg = {}

gpu_id = pre_args.gpu if pre_args.gpu is not None else cfg_gpu
if gpu_id is None:
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
    print('GPU を使用せずに学習を実行します')
else:
    os.environ['CUDA_VISIBLE_DEVICES'] = str(gpu_id)
    print(f'GPU {gpu_id} を使用して学習を実行します')

try:
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import Embedding, LSTM, Dense
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    from tensorflow.keras.callbacks import Callback
except ImportError:  # pragma: no cover - tensorflow not installed
    Sequential = load_model = Embedding = LSTM = Dense = pad_sequences = Callback = None

# --- データ読み込み -----------------------------------------------------

def read_sequences(csv_file):
    """CSV からユーザー単位の操作系列を抽出"""
    sequences = defaultdict(list)
    with open(csv_file, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            uid = row.get('now_id') or row.get('user_id')
            sequences[uid].append(row['endpoint'])
    return list(sequences.values())


def build_vocab(seqs):
    vocab = {}
    for s in seqs:
        for e in s:
            if e not in vocab:
                vocab[e] = len(vocab) + 1  # 0 reserved for padding
    return vocab


def encode_sequences(seqs, vocab):
    return [[vocab[e] for e in s] for s in seqs]


# --- モデル構築 ---------------------------------------------------------

def create_model(vocab_size, embedding_dim=32, lstm_units=32):
    model = Sequential([
        Embedding(vocab_size + 1, embedding_dim, mask_zero=True),
        LSTM(lstm_units),
        Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model


class PlotCallback(Callback):
    """学習中の損失をリアルタイム描画しファイル保存"""

    def __init__(self, out_dir):
        self.out_dir = out_dir
        self.losses = []
        self.val_losses = []
        if plt:
            plt.ion()
            self.fig, self.ax = plt.subplots()

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        self.losses.append(logs.get('loss'))
        self.val_losses.append(logs.get('val_loss'))
        if not plt:
            return
        self.ax.cla()
        self.ax.plot(range(1, epoch + 2), self.losses, label='loss')
        if any(self.val_losses):
            self.ax.plot(range(1, epoch + 2), self.val_losses, label='val_loss')
        self.ax.set_xlabel('Epoch')
        self.ax.set_ylabel('Loss')
        self.ax.legend()
        self.fig.tight_layout()
        self.fig.canvas.draw()
        self.fig.canvas.flush_events()
        self.fig.savefig(os.path.join(self.out_dir, 'training.png'))


# --- メイン -------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description='LSTM 学習スクリプト',
                                 parents=[pre_ap])
    ap.add_argument('--normal', default=os.path.join('resource', 'logs', 'normal_log.csv'),
                    help='正常ログCSVのパス')
    ap.add_argument('--abnormal', default=os.path.join('resource', 'logs', 'abnormal_log.csv'),
                    help='異常ログCSVのパス')
    ap.add_argument('--model', default=None, help='保存/読み込みするモデルパス')
    ap.add_argument('--output-dir', default=None,
                    help='学習結果を保存するディレクトリ')
    args = ap.parse_args()

    # YAML 設定の読み込み
    cfg = {}
    if os.path.exists(args.config):
        with open(args.config, 'r') as f:
            cfg = yaml.safe_load(f) or {}

    model_cfg = cfg.get('model', {})

    normal_path = cfg.get('data', {}).get('normal', args.normal)
    abnormal_path = cfg.get('data', {}).get('abnormal', args.abnormal)
    model_path = args.model or model_cfg.get('path', 'lstm_model.h5')

    load_path = model_path  # 指定されたモデルパスをそのまま読み込みに使用

    # 出力用ディレクトリ（日付と時間）
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    out_dir = args.output_dir or os.path.splitext(model_path)[0] + '_' + timestamp
    os.makedirs(out_dir, exist_ok=True)
    model_path = os.path.join(out_dir, os.path.basename(model_path))

    embedding_dim = model_cfg.get('embedding_dim', 32)
    lstm_units = model_cfg.get('lstm_units', 32)
    epochs = model_cfg.get('epochs', 10)
    batch_size = model_cfg.get('batch_size', 8)

    if Sequential is None:
        print('TensorFlow がインストールされていません')
        return

    normal_seqs = read_sequences(normal_path)
    abnormal_seqs = read_sequences(abnormal_path)

    all_seqs = normal_seqs + abnormal_seqs
    vocab = build_vocab(all_seqs)
    X = encode_sequences(all_seqs, vocab)
    y = np.array([0] * len(normal_seqs) + [1] * len(abnormal_seqs), dtype='int32')

    max_len = max(len(s) for s in X)
    X_pad = pad_sequences(X, maxlen=max_len)

    if os.path.exists(load_path):
        model = load_model(load_path)
    else:
        model = create_model(len(vocab), embedding_dim, lstm_units)

    callback = PlotCallback(out_dir)
    model.fit(
        X_pad,
        y,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=0.2,
        callbacks=[callback]
    )
    model.save(model_path)
    print('モデル保存:', model_path)

    # --- 評価 -----------------------------------------------------------
    preds = (model.predict(X_pad) > 0.5).astype(int).reshape(-1)
    pred_counts = Counter(preds)
    true_counts = Counter(y)
    accuracy = (preds == y).mean()
    print(
        f"予測: 正常 {pred_counts.get(0,0)}件, 異常 {pred_counts.get(1,0)}件"
    )
    print(
        f"実際: 正常 {true_counts.get(0,0)}件, 異常 {true_counts.get(1,0)}件"
    )
    print(f"正答率: {accuracy:.4f}")


if __name__ == '__main__':
    main()
