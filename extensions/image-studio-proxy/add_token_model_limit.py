import sqlite3
path='/opt/new-api/shared/data/app/one-api.db'
con=sqlite3.connect(path)
cur=con.cursor()
try:
    cur.execute('BEGIN IMMEDIATE')
    row=cur.execute("SELECT model_limits FROM tokens WHERE id=7").fetchone()
    current=str(row[0] or '')
    items=[item.strip() for item in current.split(',') if item.strip()]
    if 'gpt-image-native' not in items:
        items.append('gpt-image-native')
        cur.execute("UPDATE tokens SET model_limits=? WHERE id=7", (','.join(items),))
    con.commit()
    print('token model_limits=', ','.join(items))
except Exception:
    con.rollback()
    raise
finally:
    con.close()