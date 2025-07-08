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
