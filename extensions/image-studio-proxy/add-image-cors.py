from pathlib import Path

path = Path('/etc/apache2/sites-enabled/000-ip-portal.conf')
text = path.read_text(encoding='utf-8')
needle = '    ProxyPass /downloads/super/ !'
block = '''    <Location "/downloads/super/image-studio/">
        Header always set Access-Control-Allow-Origin "*"
        Header always set Access-Control-Expose-Headers "Content-Length, Content-Range"
    </Location>

'''
if 'Access-Control-Allow-Origin' not in text:
    if needle not in text:
        raise SystemExit('insertion point not found')
    text = text.replace(needle, block + needle, 1)
    path.write_text(text, encoding='utf-8')
    print('inserted')
else:
    print('already present')