import argparse
import requests
import subprocess
import time
import os

SERVER_PATH = os.path.join('resource', 'server.js')

parser = argparse.ArgumentParser()
parser.add_argument('--h', type=int, default=10,
                    help='表示するログ行数')
args = parser.parse_args()

BASE = 'http://localhost:3000'

def start_server(log_dir):
    os.makedirs(log_dir, exist_ok=True)
    env = os.environ.copy()
    env['LOG_DIR'] = log_dir
    return subprocess.Popen(['node', SERVER_PATH], env=env)


def scenario_browse_then_logout():
    resp = requests.post(f'{BASE}/login', json={'user_id': 'userA'})
    token = resp.json()['token']
    h = {'Authorization': f'Bearer {token}'}
    requests.get(f'{BASE}/browse', headers=h)
    time.sleep(0.2)
    requests.post(f'{BASE}/logout', headers=h)


def scenario_edit_then_logout():
    resp = requests.post(f'{BASE}/login', json={'user_id': 'userB'})
    token = resp.json()['token']
    h = {'Authorization': f'Bearer {token}'}
    requests.post(f'{BASE}/edit', headers=h)
    time.sleep(0.2)
    requests.post(f'{BASE}/logout', headers=h)


def scenario_mix_operations():
    resp = requests.post(f'{BASE}/login', json={'user_id': 'userC'})
    token = resp.json()['token']
    h = {'Authorization': f'Bearer {token}'}
    requests.get(f'{BASE}/browse', headers=h)
    time.sleep(0.2)
    requests.post(f'{BASE}/edit', headers=h)
    time.sleep(0.2)
    requests.get(f'{BASE}/browse', headers=h)
    time.sleep(0.2)
    requests.post(f'{BASE}/logout', headers=h)


def main():
    log_dir = os.path.join('resource', 'logs', time.strftime('%Y%m%d_%H%M%S'))
    server = start_server(log_dir)
    time.sleep(1)
    try:
        scenario_browse_then_logout()
        scenario_edit_then_logout()
        scenario_mix_operations()
    finally:
        server.terminate()
        server.wait()
        log_file = os.path.join(log_dir, 'request_log.csv')
        if os.path.exists(log_file):
            with open(log_file, 'r') as f:
                lines = f.readlines()[-args.h:]
                print(''.join(lines))
        else:
            print('Log file not found')


if __name__ == '__main__':
    main()
