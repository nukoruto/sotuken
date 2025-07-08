# Session Attack Tests

This repository contains a simple Node.js server and utilities for logging web session behaviour. `attack_patterns.py` demonstrates ten abnormal patterns (A1-A10) such as unauthenticated access, token reuse and spoofing.

## Usage

Install Node dependencies and the Python requirements:

```bash
npm install
pip install -r requirements.txt
```

Run the attack sequence using npm:

```bash
npm test
```

Log output is written to `resource/logs/request_log.csv`.

### Scenarios

Normal and abnormal user flows for realistic web services are stored under
`src/scenarios/`.  Normal scenarios simulate typical shopping and forum
behaviour, while abnormal ones describe suspicious or out‑of‑order actions.
These JSON files can be executed via the capture routes to generate additional
operation logs for model training.  Over thirty scenarios are now provided,
covering e‑commerce purchases, cart operations, forum posts, error cases and
stress patterns.  The latest version adds `/profile` and `/search` endpoints for
profile management and public keyword lookup.  Normal scenarios now include a
flow visiting these endpoints, while abnormal scenarios test unauthenticated
access and out‑of‑order profile updates.

### LSTM Training

A simple TensorFlow based trainer is provided to learn normal vs abnormal
operation sequences.  Use `lstm_train.py` to train or update the model:

```bash
python lstm_train.py --model my_model.h5 --output-dir runs/exp1
```

Normal and abnormal CSV logs from `resource/logs/` are used by default. Pass
`--normal` or `--abnormal` to specify different files.  The model file
specified with `--model` is loaded directly if it exists.  Use
`--output-dir` to set a custom directory for saving new runs.

To train with GPU acceleration, specify the GPU device number:

```bash
python lstm_train.py --model my_model.h5 --output-dir runs/gpu --gpu 0
```

If `--gpu` is omitted, training runs on CPU only. Ensure TensorFlow with GPU
support is installed.

### Next Step Prediction

For sequence-to-sequence style training that predicts the next endpoint at each step,
use `lstm_sequence_train.py`:

```bash
python lstm_sequence_train.py --log resource/logs/normal_log.csv --model seq_model.h5
```

This model uses one-hot encoded inputs and outputs a class distribution over the
available endpoints for every time step.
