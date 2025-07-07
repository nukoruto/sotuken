# Session Attack Tests

This repository contains a simple Node.js server and utilities for logging web session behaviour. `attack_patterns.py` demonstrates ten abnormal patterns (A1-A10) such as unauthenticated access, token reuse and spoofing.

## Usage

Install Node dependencies and the Python requirements:

```bash
npm install
pip install -r requirements.txt
```

Run the attack sequence:

```bash
python3 attack_patterns.py
```

Log output is written to `resource/logs/request_log.csv`.
