#!/usr/bin/env python3
"""Tiny local receiver for browser-side sprite/view-set export tools
(tools/sprite-render.html, tools/pet-render.html). The render tool POSTs one
PNG blob per file with an X-Filename header; this just writes each blob to
--out. Needs CORS headers because the render page is served from the
dev-server origin (e.g. http://localhost:8123) while this listens on its own
port, which makes the browser send a preflight OPTIONS for the custom
X-Filename header.
"""
import argparse
import http.server
import os


def make_handler(out_dir):
    class Handler(http.server.BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'X-Filename, Content-Type')

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_POST(self):
            filename = self.headers.get('X-Filename')
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            if not filename or '/' in filename or '..' in filename:
                self.send_response(400)
                self._cors()
                self.end_headers()
                return
            path = os.path.join(out_dir, filename)
            with open(path, 'wb') as f:
                f.write(body)
            print(f'wrote {path} ({len(body)} bytes)')
            self.send_response(200)
            self._cors()
            self.end_headers()

        def log_message(self, fmt, *args):
            pass  # quiet; we print our own line above

    return Handler


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8799)
    ap.add_argument('--out', default='.')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    server = http.server.HTTPServer(('127.0.0.1', args.port), make_handler(args.out))
    print(f'export-receiver listening on 127.0.0.1:{args.port}, writing to {args.out}')
    server.serve_forever()
