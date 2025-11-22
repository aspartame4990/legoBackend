## 栈说明
- 后端：FastAPI（轻量内存态，`app/main.py`）
- 前端：TypeScript 源码在 `frontend/`，当前已编译好的 JS/HTML/CSS 在 `static/`
- MQTT/手环指令在此轻量版未接入（仅保留震动/LED 语义），可后续扩展。

## 启动后端
```shell
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## 前端（可选重新编译）
已提供编译后的 `static/js/host.js` 与 `static/js/player.js`。若修改 `frontend/*.ts`，需：
```shell
npm install
npm run build
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
