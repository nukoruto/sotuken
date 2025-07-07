import argparse
import requests
import subprocess
import time
import os
import base64
import json
import jwt

SERVER_PATH = os.path.join('resource', 'server.js')
SECRET = 'change_this_to_env_secret'
parser = argparse.ArgumentParser()
parser.add_argument('--h', type=int, default=20,
                    help='表示するログ行数')
args = parser.parse_args()

BASE = 'http://localhost:3000'

def start_server():
    return subprocess.Popen(['node', SERVER_PATH])

def a1_unauthenticated():
    try:
        requests.post(f'{BASE}/edit', timeout=5)
    except requests.RequestException:
        pass

def a2_after_logout():
    r = requests.post(f'{BASE}/login', json={'user_id': 'a2'})
    token = r.json()['token']
    h = {'Authorization': f'Bearer {token}'}
    requests.post(f'{BASE}/logout', headers=h)
    try:
        requests.get(f'{BASE}/browse', headers=h)
    except requests.RequestException:
        pass

def a3_out_of_order():
    r = requests.post(f'{BASE}/login', json={'user_id': 'a3'})
    token = r.json()['token']
    h = {'Authorization': f'Bearer {token}'}
    requests.post(f'{BASE}/logout', headers=h)
    try:
        requests.post(f'{BASE}/edit', headers=h)
    except requests.RequestException:
        pass

def a4_token_clone():
    r = requests.post(f'{BASE}/login', json={'user_id': 'a4'})
    token = r.json()['token']
    h1 = {'Authorization': f'Bearer {token}', 'User-Agent': 'UA1', 'X-Forwarded-For': '1.1.1.1'}
    h2 = {'Authorization': f'Bearer {token}', 'User-Agent': 'UA2', 'X-Forwarded-For': '2.2.2.2'}
    requests.get(f'{BASE}/browse', headers=h1)
    try:
        requests.get(f'{BASE}/browse', headers=h2)
    except requests.RequestException:
        pass

def a5_token_tamper():
    r = requests.post(f'{BASE}/login', json={'user_id': 'a5'})
    token = r.json()['token']
    parts = token.split('.')
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + '=='))
    payload['user_id'] = 'admin'
    tampered_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    tampered = '.'.join([parts[0], tampered_payload, parts[2]])
    h = {'Authorization': f'Bearer {tampered}'}
    try:
        requests.get(f'{BASE}/browse', headers=h)
    except requests.RequestException:
        pass

def a6_parallel_sessions():
    r1 = requests.post(f'{BASE}/login', json={'user_id': 'a6'})
    r2 = requests.post(f'{BASE}/login', json={'user_id': 'a6'})
    t1 = r1.json()['token']
    t2 = r2.json()['token']
    h1 = {'Authorization': f'Bearer {t1}'}
    h2 = {'Authorization': f'Bearer {t2}'}
    requests.get(f'{BASE}/browse', headers=h1)
    requests.get(f'{BASE}/browse', headers=h2)

def a7_rapid_ops():
    for _ in range(5):
        try:
            requests.post(f'{BASE}/login', json={'user_id': 'a7'})
        except requests.RequestException:
            pass
        time.sleep(0.1)

def a8_expired_token():
    token = jwt.encode({'user_id': 'a8', 'exp': int(time.time()) - 1}, SECRET, algorithm='HS256')
    h = {'Authorization': f'Bearer {token}'}
    try:
        requests.get(f'{BASE}/browse', headers=h)
    except requests.RequestException:
        pass

def a9_spoofing():
    r = requests.post(f'{BASE}/login', json={'user_id': 'a9'})
    token = r.json()['token']
    h1 = {'Authorization': f'Bearer {token}', 'User-Agent': 'UA1', 'Referer': 'http://a/'}
    h2 = {'Authorization': f'Bearer {token}', 'User-Agent': 'UA2', 'Referer': 'http://b/'}
    requests.get(f'{BASE}/browse', headers=h1)
    try:
        requests.get(f'{BASE}/browse', headers=h2)
    except requests.RequestException:
        pass

def a10_skip_sequence():
    r = requests.post(f'{BASE}/login', json={'user_id': 'a10'})
    token = r.json()['token']
    h = {'Authorization': f'Bearer {token}'}
    requests.post(f'{BASE}/edit', headers=h)

def print_log(lines=20):
    log = os.path.join('resource', 'logs', 'request_log.csv')
    if os.path.exists(log):
        with open(log) as f:
            for l in f.readlines()[-lines:]:
                print(l.strip())


def main():
    server = start_server()
    time.sleep(1)
    try:
        a1_unauthenticated()
        a2_after_logout()
        a3_out_of_order()
        a4_token_clone()
        a5_token_tamper()
        a6_parallel_sessions()
        a7_rapid_ops()
        a8_expired_token()
        a9_spoofing()
        a10_skip_sequence()
    finally:
        server.terminate()
        server.wait()
        print_log(args.h)

if __name__ == '__main__':
    main()
