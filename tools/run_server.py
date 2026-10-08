#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""卫戍协议复刻 · 本地调试服务器。

在仓库根运行：python tools/run_server.py [--port 8000]

职责：
- 以 web/ 为文档根提供静态文件（替代 `python -m http.server`，玩法不变）；
- 接收 POST /randomsnapshot ：把浏览器端 canvas.toDataURL 导出的 base64 PNG
  保存到 assets/picture/randomsnapshot/<时间戳>.png，并清理该目录只保留最新 3 张。

用法：
    python tools/run_server.py                  # 默认 0.0.0.0:8000，保留 3 张
    python tools/run_server.py --port 9000 --keep 5 --out D:/shots
"""
import argparse
import base64
import json
import os
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
DEFAULT_OUT = os.path.join(ROOT, 'assets', 'picture', 'randomsnapshot')
DEFAULT_KEEP = 3

SNAPSHOT_PATH = '/randomsnapshot'


def prune(directory, keep):
    """只保留目录里最新 keep 张 *.png（按修改时间倒序），删除更旧的。"""
    try:
        files = [os.path.join(directory, n) for n in os.listdir(directory)
                 if n.lower().endswith('.png')]
        files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        for f in files[keep:]:
            try:
                os.remove(f)
            except OSError:
                pass
    except OSError:
        pass


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def log_message(self, fmt, *args):
        # 静默默认访问日志，避免刷屏；需要排查时可临时取消注释
        # sys.stderr.write('%s\n' % (fmt % args))
        pass

    def _send_json(self, code, payload):
        body = payload.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path.split('?')[0] != SNAPSHOT_PATH:
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(length) if length else b''
            text = raw.decode('utf-8', errors='ignore').strip()
            if text.startswith('data:'):
                text = text.split(',', 1)[1]
            png = base64.b64decode(text)
            if not png[:8] == b'\x89PNG\r\n\x1a\n':
                raise ValueError('not a png payload')
            os.makedirs(OUT_DIR, exist_ok=True)
            ts = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:-3]  # 毫秒级时间戳
            path = os.path.join(OUT_DIR, ts + '.png')
            with open(path, 'wb') as f:
                f.write(png)
            prune(OUT_DIR, KEEP)
            self._send_json(200, '{"ok":true}')
        except Exception as e:
            self._send_json(500, '{"ok":false,"err":%s}' % json.dumps(str(e)))


def main():
    global WEB, OUT_DIR, KEEP
    ap = argparse.ArgumentParser(description='卫戍协议复刻 · 本地调试服务器')
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--web', default=WEB, help='静态文件根目录（默认仓库 web/）')
    ap.add_argument('--out', default=DEFAULT_OUT, help='随机快照输出目录（默认 assets/picture/randomsnapshot）')
    ap.add_argument('--keep', type=int, default=DEFAULT_KEEP, help='快照最多保留数量（默认 3）')
    args = ap.parse_args()

    WEB = os.path.abspath(args.web)
    OUT_DIR = os.path.abspath(args.out)
    KEEP = max(1, args.keep)
    os.makedirs(OUT_DIR, exist_ok=True)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print('卫戍协议复刻 server: http://%s:%d  (静态根=%s)' % (args.host, args.port, WEB))
    # print('  随机快照输出: %s (最多保留 %d 张)' % (OUT_DIR, KEEP))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n[停止]')
        httpd.server_close()


if __name__ == '__main__':
    main()
