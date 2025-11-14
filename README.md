## 启动服务器
```shell
mvn spring-boot:run
```


## 游戏1: 谁是卧底

### 房主
`http://localhost:8080/host.html`

### 玩家(至少3名)
`http://localhost:8080/participant.html`


### 手环/项链模拟器
若暂时没有实体 ESP32，可使用根目录下的 `esp32_simulator.py` 模拟震动、蜂鸣和灯光。
1. 安装依赖：
   ```shell
   pip install paho-mqtt
   ```
2. 启动模拟器（可选参数过滤玩家）：
   ```shell
   python esp32_simulator.py --host localhost --port 1883 --player 玩家昵称
   ```   
   不传 `--player` 时默认订阅 `undercover/#`，能看到所有事件日志，适合演示与调试；如需只看某个玩家收到的mqtt指令，则传入对应昵称。
   ```shell
   python esp32_simulator.py --host localhost --port 1883 
   ```

## 游戏2: TODO