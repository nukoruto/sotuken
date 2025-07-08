import argparse
import csv
import os
from collections import defaultdict

import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dropout, TimeDistributed, Dense
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.utils import to_categorical


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
                vocab[e] = len(vocab)
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
    num_classes = len(vocab)
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
    ap = argparse.ArgumentParser(description='次操作予測用 LSTM 学習')
    ap.add_argument('--log', default=os.path.join('resource', 'logs', 'normal_log.csv'),
                    help='学習用ログCSV')
    ap.add_argument('--model', default='seq_model.h5', help='保存するモデルファイル')
    ap.add_argument('--epochs', type=int, default=20)
    ap.add_argument('--units', type=int, default=100)
    ap.add_argument('--dropout', type=float, default=0.0)
    ap.add_argument('--second_lstm', action='store_true', help='2層目のLSTMを追加')
    args = ap.parse_args()

    seqs = read_sequences(args.log)
    vocab = build_vocab(seqs)
    X, y = create_dataset(seqs, vocab)

    model = create_model(len(vocab), args.units, args.dropout, args.second_lstm)
    model.fit(X, y, epochs=args.epochs, batch_size=8, validation_split=0.2)
    model.save(args.model)
    print('モデル保存:', args.model)


if __name__ == '__main__':
    main()
