import argparse
import csv
import os
from collections import defaultdict
import yaml

import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dropout, TimeDistributed, Dense
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.utils import to_categorical

# --- GPU / 設定ファイル オプション先読み ------------------------------
pre_ap = argparse.ArgumentParser(add_help=False)
pre_ap.add_argument('--gpu', type=int, default=None,
                    help='利用するGPU番号。指定しない場合はCPUのみを使用')
pre_ap.add_argument('--config', default='config.yaml',
                    help='設定ファイル YAML のパス')
pre_args, _ = pre_ap.parse_known_args()

cfg_gpu = None
cfg = {}
if os.path.exists(pre_args.config):
    with open(pre_args.config, 'r') as f:
        cfg = yaml.safe_load(f) or {}
        cfg_gpu = cfg.get('GPU')

gpu_id = pre_args.gpu if pre_args.gpu is not None else cfg_gpu
if gpu_id is None:
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
    print('GPU を使用せずに学習を実行します')
else:
    os.environ['CUDA_VISIBLE_DEVICES'] = str(gpu_id)
    print(f'GPU {gpu_id} を使用して学習を実行します')


def read_sequences(csv_file):
    """CSVからユーザー単位の操作系列を抽出"""
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
                # 0 をパディング専用インデックスとして予約する
                vocab[e] = len(vocab) + 1
    return vocab


def create_dataset(seqs, vocab):
    """入力Xと教師信号yを生成する"""
    X, y = [], []
    for s in seqs:
        if len(s) < 2:
            continue
        idx = [vocab[e] for e in s]
        X.append(idx[:-1])
        y.append(idx[1:])
    max_len = max(len(seq) for seq in X)
    X_pad = pad_sequences(X, maxlen=max_len, padding='post')
    y_pad = pad_sequences(y, maxlen=max_len, padding='post')
    num_classes = len(vocab) + 1
    X_oh = to_categorical(X_pad, num_classes=num_classes)
    y_oh = to_categorical(y_pad, num_classes=num_classes)
    return X_oh, y_oh


def create_model(num_endpoints, units=100, dropout_rate=0.0, second_lstm=False):
    model = Sequential()
    model.add(LSTM(units, return_sequences=True, input_shape=(None, num_endpoints)))
    if dropout_rate > 0:
        model.add(Dropout(dropout_rate))
    if second_lstm:
        model.add(LSTM(units, return_sequences=True))
    model.add(TimeDistributed(Dense(num_endpoints, activation='softmax')))
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    return model


def main():
    ap = argparse.ArgumentParser(description='次操作予測用 LSTM 学習',
                                 parents=[pre_ap])
    ap.add_argument('--log', default=None, help='学習用ログCSV')
    ap.add_argument('--model', default=None, help='保存するモデルファイル')
    ap.add_argument('--epochs', type=int, default=None)
    ap.add_argument('--units', type=int, default=None)
    ap.add_argument('--dropout', type=float, default=None)
    ap.add_argument('--second_lstm', action='store_true', help='2層目のLSTMを追加')
    args = ap.parse_args()

    seq_log = args.log or cfg.get('data', {}).get('sequence_log',
                        os.path.join('resource', 'logs', 'normal_log.csv'))
    model_cfg = cfg.get('sequence_model', {})
    model_path = args.model or model_cfg.get('path', 'seq_model.h5')
    epochs = args.epochs if args.epochs is not None else model_cfg.get('epochs', 20)
    units = args.units if args.units is not None else model_cfg.get('units', 100)
    dropout = args.dropout if args.dropout is not None else model_cfg.get('dropout', 0.0)
    second = args.second_lstm or model_cfg.get('second_lstm', False)

    seqs = read_sequences(seq_log)
    vocab = build_vocab(seqs)
    X, y = create_dataset(seqs, vocab)

    model = create_model(len(vocab) + 1, units, dropout, second)
    model.fit(X, y, epochs=epochs, batch_size=8, validation_split=0.2)
    model.save(model_path)
    print('モデル保存:', model_path)


if __name__ == '__main__':
    main()
