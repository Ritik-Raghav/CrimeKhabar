#!/usr/bin/env python3
"""
Local dev server: serves your static site + proxies WordPress API (fixes CORS).

Usage:
  python3 dev-server.py

Open: http://localhost:8080
Set in js/config.js: USE_LOCAL_PROXY: true
"""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.parse
import json
import os

PORT = 8080


def load_wp_target():
    """Read WP_API_URL from js/config.js so proxy always matches your WordPress path."""
    if os.environ.get('WP_TARGET'):
        return os.environ['WP_TARGET'].rstrip('/')
    config = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'js', 'config.js')
    try:
        import re
        with open(config, encoding='utf-8') as f:
            m = re.search(r"WP_API_URL:\s*['\"]([^'\"]+)['\"]", f.read())
        if m:
            return m.group(1).rstrip('/')
    except OSError:
        pass
    return 'http://localhost:8000/wordpress'


WP_TARGET = load_wp_target()


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/wp-proxy'):
            self.proxy_wordpress()
        else:
            super().do_GET()

    def proxy_wordpress(self):
        # /wp-proxy/wp/v2/posts?per_page=5 -> {WP}/wordpress/index.php?rest_route=/wp/v2/posts&...
        rest_path = self.path.split('?', 1)[0]
        rest_path = rest_path[len('/wp-proxy'):] or '/'
        if '?' in self.path:
            query = self.path.split('?', 1)[1]
        else:
            query = ''

        api_path = rest_path if rest_path.startswith('/wp/v2') else f'/wp/v2{rest_path}'

        use_rest_route = os.environ.get('WP_USE_REST_ROUTE', '1') != '0'
        if use_rest_route:
            wp_url = (
                f'{WP_TARGET}/index.php?rest_route={urllib.parse.quote(api_path, safe="/")}'
            )
            if query:
                wp_url += '&' + query
        else:
            wp_url = f'{WP_TARGET}/wp-json{api_path}'
            if query:
                wp_url += '?' + query

        try:
            req = urllib.request.Request(wp_url, headers={'User-Agent': 'news-app-dev-proxy'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            msg = json.dumps({'error': str(e), 'wp_url': wp_url}).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(msg)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('', PORT), DevHandler)
    print(f'Static site + WP proxy: http://localhost:{PORT}')
    print(f'WordPress backend:      {WP_TARGET}')
    print('Press Ctrl+C to stop')
    server.serve_forever()
