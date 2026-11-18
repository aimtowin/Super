import json
import sqlite3
import sys
from pathlib import Path

path = '/opt/new-api/shared/data/app/one-api.db'
alias = 'gpt-image-native'
native_target = 'gpt-image-2.6-flare'
price = 0.01369863

con = sqlite3.connect(path)
con.row_factory = sqlite3.Row
cur = con.cursor()
try:
    cur.execute('BEGIN IMMEDIATE')
    row = cur.execute('SELECT models, model_mapping FROM channels WHERE id = 12').fetchone()
    if row is None:
        raise SystemExit('channel 12 missing')
    models = [item.strip() for item in str(row['models']).split(',') if item.strip()]
    if alias not in models:
        models.append(alias)
    mapping = json.loads(row['model_mapping'] or '{}')
    mapping[alias] = native_target
    cur.execute(
        'UPDATE channels SET models = ?, model_mapping = ? WHERE id = 12',
        (','.join(models), json.dumps(mapping, ensure_ascii=False, separators=(',', ':'))),
    )
    for group in ('default', 'svip', 'vip'):
        existing = cur.execute(
            'SELECT 1 FROM abilities WHERE "group" = ? AND model = ? AND channel_id = 12',
            (group, alias),
        ).fetchone()
        if existing is None:
            cur.execute(
                'INSERT INTO abilities ("group", model, channel_id, enabled, priority, weight, tag) '
                'VALUES (?, ?, 12, 1, 5, 0, ?)',
                (group, alias, ''),
            )
    price_row = cur.execute("SELECT value FROM options WHERE key = 'ModelPrice'").fetchone()
    model_price = json.loads(price_row['value']) if price_row else {}
    model_price[alias] = price
    cur.execute(
        "INSERT INTO options (key, value) VALUES ('ModelPrice', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (json.dumps(model_price, ensure_ascii=False, separators=(',', ':')),),
    )
    con.commit()
    print('patched', alias, 'models=', models, 'mapping=', mapping)
except Exception as exc:
    con.rollback()
    print('FAILED', exc, file=sys.stderr)
    raise
finally:
    con.close()