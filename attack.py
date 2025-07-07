import argparse
import requests
import os

parser = argparse.ArgumentParser()
parser.add_argument('--h', type=int, default=10,
                    help='表示するログ行数')
args = parser.parse_args()

base = 'http://localhost:3000'

# normal login to get token
resp = requests.post(f'{base}/login', json={'user_id': 'attacker'})
resp.raise_for_status()
token = resp.json().get('token')

# invalid token attack
bad_token = token[:-1] + 'x'
headers_bad = {'Authorization': f'Bearer {bad_token}'}
try:
    requests.get(f'{base}/browse', headers=headers_bad)
except requests.RequestException:
    pass

# request nonexistent endpoint
headers = {'Authorization': f'Bearer {token}'}
try:
    requests.get(f'{base}/admin', headers=headers)
except requests.RequestException:
    pass

# logout and reuse token
requests.post(f'{base}/logout', headers=headers)
try:
    requests.get(f'{base}/browse', headers=headers)
except requests.RequestException:
    pass

log_file = os.path.join('resource', 'logs', 'request_log.csv')
if os.path.exists(log_file):
    with open(log_file, 'r') as f:
        lines = f.readlines()[-args.h:]
        print(''.join(lines))
else:
    print('Log file not found')
