## 栈说明
- 后端：FastAPI（轻量内存态，`app/main.py`）
- 前端：Vite + TypeScript（源码在 `frontend/`，多页面入口 `host.html` / `participant.html`，构建产物输出到 `static/`）
- MQTT/手环指令在此轻量版未接入（仅保留震动/LED 语义），可后续扩展。

## 启动后端
```shell
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## 前端（Vite 多页面）
```shell
npm install
npm run dev      # 本地调试（默认 http://localhost:5173/host.html ，记得同时跑后端 8080）
npm run build    # 输出到 static/ 目录，由 FastAPI 直接托管
npm run preview  # 预览打包产物
```

## 访问
- 房主：`http://localhost:8080/host.html`
- 玩家：`http://localhost:8080/participant.html`

## 游戏1: 谁是卧底
- 房主填写两组主题后点击“开始游戏一”
- 手环振动模式：A= S-S-S-L，B= S-S-L-L
- 描述倒计时 2:30，最后 30 秒触发快速短振提示
- 自动进入投票；房主可“结束投票”强制结算
- 结果：猜对 → 绿灯+三短振；猜错 → 红灯+一长振

## 游戏2: LegoSense（情绪浮现）
- 房主点击“开始游戏二”
- 玩家提交情绪词；房主实时看到情绪走廊
- 房主添加分组（名称+颜色），为玩家选择所属分组后点击“应用 LED 分组”
- 同组手环应显示同色灯光（本版本仅保留 API/前端逻辑，未接入真实硬件）
