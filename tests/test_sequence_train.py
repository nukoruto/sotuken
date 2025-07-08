import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
import lstm_sequence_train as lstm


def test_dataset_and_training():
    seqs = lstm.read_sequences(os.path.join('resource', 'logs', 'normal_log.csv'))
    seqs = seqs[:2]
    vocab = lstm.build_vocab(seqs)
    X, y = lstm.create_dataset(seqs, vocab)
    model = lstm.create_model(len(vocab) + 1, units=10)
    history = model.fit(X, y, epochs=1, batch_size=1, verbose=0)
    assert history.history['loss'], 'no loss value'

