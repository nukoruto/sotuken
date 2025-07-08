import argparse
import csv
import os
from collections import defaultdict

# --- GPU オプション先読み ---------------------------------------------
pre_ap = argparse.ArgumentParser(add_help=False)
pre_ap.add_argument('--gpu', type=int, default=None,
                    help='利用するGPU番号。指定しない場合はCPUのみを使用')
pre_args, _ = pre_ap.parse_known_args()
if pre_args.gpu is None:
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
    print('GPU を使用せずに学習を実行します')
else:
    os.environ['CUDA_VISIBLE_DEVICES'] = str(pre_args.gpu)
    print(f'GPU {pre_args.gpu} を使用して学習を実行します')

try:
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import Embedding, LSTM, Dense
    from tensorflow.keras.preprocessing.sequence import pad_sequences
except ImportError:  # pragma: no cover - tensorflow not installed
    Sequential = load_model = Embedding = LSTM = Dense = pad_sequences = None

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


# --- メイン -------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description='LSTM 学習スクリプト')
    ap.add_argument('--normal', default=os.path.join('resource', 'logs', 'normal_log.csv'),
                    help='正常ログCSVのパス')
    ap.add_argument('--abnormal', default=os.path.join('resource', 'logs', 'abnormal_log.csv'),
                    help='異常ログCSVのパス')
    ap.add_argument('--model', default='lstm_model.h5', help='保存/読み込みするモデルパス')
    ap.add_argument('--gpu', type=int, default=pre_args.gpu,
                    help='利用するGPU番号。指定しない場合はCPUのみを使用')
    args = ap.parse_args()

    if Sequential is None:
        print('TensorFlow がインストールされていません')
        return

    normal_seqs = read_sequences(args.normal)
    abnormal_seqs = read_sequences(args.abnormal)

    all_seqs = normal_seqs + abnormal_seqs
    vocab = build_vocab(all_seqs)
    X = encode_sequences(all_seqs, vocab)
    y = [0] * len(normal_seqs) + [1] * len(abnormal_seqs)

    max_len = max(len(s) for s in X)
    X_pad = pad_sequences(X, maxlen=max_len)

    if os.path.exists(args.model):
        model = load_model(args.model)
    else:
        model = create_model(len(vocab))

    model.fit(X_pad, y, epochs=10, batch_size=8, validation_split=0.2)
    model.save(args.model)
    print('モデル保存:', args.model)


if __name__ == '__main__':
    main()
