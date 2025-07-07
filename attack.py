import requests
import subprocess
import time
import os

SERVER_PATH = os.path.join('resource', 'server.js')

server = subprocess.Popen(['node', SERVER_PATH])
# wait for server to start
time.sleep(1)

base = 'http://localhost:3000'

try:
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
finally:
    server.terminate()
    server.wait()

log_file = os.path.join('resource', 'logs', 'request_log.csv')
if os.path.exists(log_file):
    with open(log_file, 'r') as f:
        lines = f.readlines()[-10:]
        print(''.join(lines))
else:
    print('Log file not found')
