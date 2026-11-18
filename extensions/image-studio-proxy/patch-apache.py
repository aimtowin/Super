from pathlib import Path

path = Path('/etc/apache2/sites-enabled/000-ip-portal.conf')
text = path.read_text(encoding='utf-8')
needle = '    # Super Lib 2.4.0 更新源'
block = '''    # Image Studio generation proxy: password-gated, upstream key stays here.
    ProxyPass /image-studio-api/ http://127.0.0.1:8791/
    ProxyPassReverse /image-studio-api/ http://127.0.0.1:8791/

'''
if '/image-studio-api/' not in text:
    if needle not in text:
        raise SystemExit('insertion point not found')
    text = text.replace(needle, block + needle, 1)
    path.write_text(text, encoding='utf-8')
    print('inserted')
else:
    print('already present')