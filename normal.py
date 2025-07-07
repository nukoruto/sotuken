import argparse
import requests
import time
import os

parser = argparse.ArgumentParser()
parser.add_argument('--h', type=int, default=10,
                    help='表示するログ行数')
args = parser.parse_args()

BASE = 'http://localhost:3000'


def main():
    """正常な順序でリクエストを送り、ログを確認するスクリプト"""

    resp = requests.post(f'{BASE}/login', json={'user_id': 'normal_user'})
    resp.raise_for_status()
    token = resp.json().get('token')
    headers = {'Authorization': f'Bearer {token}'}

    requests.get(f'{BASE}/browse', headers=headers)
    time.sleep(0.5)
    requests.post(f'{BASE}/edit', headers=headers)
    time.sleep(0.5)
    requests.post(f'{BASE}/logout', headers=headers)

    log_file = os.path.join('resource', 'logs', 'request_log.csv')
    if os.path.exists(log_file):
        with open(log_file, 'r') as f:
            lines = f.readlines()[-args.h:]
            print(''.join(lines))
    else:
        print('Log file not found')


if __name__ == '__main__':
    main()
