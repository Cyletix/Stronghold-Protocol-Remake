#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""卫戍协议复刻 - 协议探针服务器 (log-everything)

用途：让改版客户端连到本机，记录它发出的所有 HTTP 请求，
用于逆向登录流程 + 数据接口。后续再逐步实现真实应答。
"""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def _log(self):
        print("\n=== %s %s ===" % (self.command, self.path))
        for k, v in self.headers.items():
            print("  %s: %s" % (k, v))
    def _read_body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        if n:
            b = self.rfile.read(n)
            print("Body(%d):" % n, b[:3000])
            return b
        return b""
    def _reply(self):
        payload = b'{"result":0}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def do_GET(self):
        self._log(); self._reply()
    def do_POST(self):
        self._log(); self._read_body(); self._reply()
    def do_PUT(self):
        self._log(); self._read_body(); self._reply()
    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print("log-everything server on 0.0.0.0:%d" % port)
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()