import argparse
import os
import pandas as pd
import numpy as np
from scipy.io import savemat
import ipaddress


def parse_args():
    parser = argparse.ArgumentParser(
        description="ログCSVを読み込みMATLAB用の.matファイルに変換します")
    parser.add_argument("logfile", help="入力CSVファイル")
    parser.add_argument("-o", "--output", help="出力.matファイル")
    return parser.parse_args()


def preprocess(df):
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.sort_values(["session_id", "timestamp"])

    endpoint_codes, endpoint_uniques = pd.factorize(df["endpoint"])
    df["endpoint_code"] = endpoint_codes

    method_codes, method_uniques = pd.factorize(df["method"])
    df["method_code"] = method_codes

    if "ip" in df.columns:
        def ip_to_int(x):
            try:
                return int(ipaddress.ip_address(x))
            except Exception:
                return -1

        df["ip_int"] = df["ip"].apply(ip_to_int)

    seq_series = df.groupby("session_id")["endpoint_code"].apply(lambda x: np.array(x, dtype=np.int32))
    sequences = seq_series.tolist()

    data = {
        "sequences": np.array(sequences, dtype=object),
        "endpoint_mapping": {str(k): int(v) for v, k in enumerate(endpoint_uniques)},
        "method_mapping": {str(k): int(v) for v, k in enumerate(method_uniques)},
    }
    return data


def main():
    args = parse_args()
    output = args.output or os.path.splitext(args.logfile)[0] + ".mat"

    df = pd.read_csv(args.logfile)
    data = preprocess(df)
    savemat(output, data)
    print(f"saved: {output}")


if __name__ == "__main__":
    main()
