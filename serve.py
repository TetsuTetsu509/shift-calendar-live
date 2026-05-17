import os, sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(os.environ.get('PORT', 3456))
os.chdir('/Users/teppei/Desktop/shift-calendar')
httpd = HTTPServer(('', port), SimpleHTTPRequestHandler)
print(f'Serving on port {port}', flush=True)
httpd.serve_forever()
