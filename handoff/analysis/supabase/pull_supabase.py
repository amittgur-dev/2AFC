#!/usr/bin/env python3
"""Download the experiment tables from Supabase into CSV and JSON files.

Reads the tables through the project's REST API with a key that may read
them. The browser's publishable (anon) key cannot: the tables are protected
and the anon key can only call record_rows(). Use a SECRET key:
Supabase dashboard -> Project Settings -> API Keys -> "Secret keys" (a key
starting with sb_secret_...), or the legacy "service_role" key (a long JWT
starting with eyJ...). Treat that key like a password: never commit it, never
paste it into a shared document, and revoke it in the dashboard if it leaks.

Usage:
  python3 pull_supabase.py --url https://yrgwlvqkqgqxcfcyxkta.supabase.co --key sb_secret_... --out data/
  SUPABASE_URL=... SUPABASE_KEY=... python3 pull_supabase.py --out data/

Options:
  --tables  comma-separated list (default: all six: the two *_sessions, two
            *_trials tables and two *_latest_sessions views)
  --page-size  rows per request (default 1000; the project's "Max rows" API
            setting caps this, 1000 by default)

Output: <out>/<table>.csv (JSON columns as JSON text, like the dashboard's
CSV export) and <out>/<table>.json (the rows as returned by the API).
Standard library only; no installation needed.
"""
import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

TABLES = [
    'lines_with_edges_sessions', 'lines_with_edges_trials', 'lines_with_edges_latest_sessions',
    'similarity_with_rotation_sessions', 'similarity_with_rotation_trials', 'similarity_with_rotation_latest_sessions',
]


def fetch_rows(url, key, table, page_size):
    base = url.rstrip('/') + '/rest/v1/' + table
    headers = {'apikey': key, 'Accept': 'application/json'}
    if key.startswith('eyJ'):  # a legacy JWT key also goes in the Authorization header
        headers['Authorization'] = 'Bearer ' + key
    rows, offset = [], 0
    while True:
        query = urllib.parse.urlencode({'select': '*', 'order': 'id.asc', 'limit': page_size, 'offset': offset})
        req = urllib.request.Request(base + '?' + query, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                page = json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            if e.code in (401, 403) or 'permission denied' in body:
                sys.exit(f'{table}: HTTP {e.code}. The key cannot read this table; use the secret / service_role key, not the publishable (anon) key. Server said: {body[:300]}')
            if e.code == 404:
                sys.exit(f'{table}: HTTP 404. The table or view does not exist; run supabase/migrations/0001_experiment_tables.sql in the SQL Editor. Server said: {body[:300]}')
            sys.exit(f'{table}: HTTP {e.code}: {body[:300]}')
        if not isinstance(page, list):
            sys.exit(f'{table}: unexpected response: {str(page)[:300]}')
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def cell(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def write_csv(path, rows):
    columns = []
    for r in rows:
        for k in r:
            if k not in columns:
                columns.append(k)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(columns)
        for r in rows:
            w.writerow([cell(r.get(c)) for c in columns])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default=os.environ.get('SUPABASE_URL'), help='project URL, https://<ref>.supabase.co')
    ap.add_argument('--key', default=os.environ.get('SUPABASE_KEY'), help='secret (sb_secret_...) or service_role key')
    ap.add_argument('--out', default='supabase-export', help='output directory')
    ap.add_argument('--tables', default=','.join(TABLES))
    ap.add_argument('--page-size', type=int, default=1000)
    a = ap.parse_args()
    if not a.url or not a.key:
        ap.error('give --url and --key (or SUPABASE_URL and SUPABASE_KEY)')
    if a.key.startswith('sb_publishable_'):
        ap.error('this is the publishable (anon) key; it cannot read the tables. Use the secret key (sb_secret_...) or the legacy service_role key.')
    os.makedirs(a.out, exist_ok=True)
    for table in [t.strip() for t in a.tables.split(',') if t.strip()]:
        rows = fetch_rows(a.url, a.key, table, a.page_size)
        with open(os.path.join(a.out, table + '.json'), 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
        write_csv(os.path.join(a.out, table + '.csv'), rows)
        print(f'{table}: {len(rows)} rows')


if __name__ == '__main__':
    main()
