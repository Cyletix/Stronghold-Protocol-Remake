"""历史遗留入口（已弃用）。

本项目运行链路不再依赖该服务。请改用：
- 本地调试：tools/run_server.py
- 联机服务：tools/room_server.js / tools/start-room.ps1

该脚本保留仅作回溯，不要作为日常执行入口。
"""

if __name__ == "__main__":
    print("已弃用：tools/main.py 已下线，不参与当前运行链路。")
    print("请改用 tools/run_server.py 或 tools/room_server.js。")
    raise SystemExit(1)
