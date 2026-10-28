#!/usr/bin/env python3
"""Dev server for site/ on :8124, sending the same headers as production.

Reads the `headers` rules of site/vercel.json (sources are path-to-regexp patterns;
the simple ones used there read as regular expressions) and applies them, so the CSP
is exercised locally. Caching is always off in dev.
  python3 tools/serve.py [port]
"""
import functools, http.server, json, pathlib, re, socketserver, sys

SITE = pathlib.Path(__file__).resolve().parent.parent / 'site'
RULES = [(re.compile('^' + r['source'] + '$'), r['headers'])
         for r in json.loads((SITE / 'vercel.json').read_text())['headers']]


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split('?')[0]
        for pattern, headers in RULES:
            if pattern.match(path):
                for h in headers:
                    if h['key'].lower() != 'cache-control':
                        self.send_header(h['key'], h['value'])
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', port), functools.partial(Handler, directory=str(SITE))) as httpd:
    httpd.serve_forever()
