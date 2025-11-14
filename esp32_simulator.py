from __future__ import annotations

import argparse
import json
import signal
import sys
from typing import Tuple

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover - helper for local demo only
    print("Missing dependency: paho-mqtt. Install with 'pip install paho-mqtt'.", file=sys.stderr)
    sys.exit(1)


PATTERN_DESCRIPTION = {
    "3short_1long": "震动提示：3 短 1 长 (词语 1)",
    "2short_2long": "震动提示：2 短 2 长 (词语 2)",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate ESP32 wristband via MQTT events")
    parser.add_argument("--host", default="localhost", help="MQTT broker host (default: localhost)")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port (default: 1883)")
    parser.add_argument("--player", help="Optional nickname filter（只监听某个手环）")
    parser.add_argument("--client-id", default="esp32-sim", help="MQTT clientId prefix")
    return parser.parse_args()


def topic_filters(args: argparse.Namespace) -> Tuple[Tuple[str, int], ...]:
    topics = [("undercover/broadcast", 0)]
    if args.player:
        topics.append((f"undercover/player/{args.player}", 0))
    else:
        topics.append(("undercover/player/#", 0))
    return tuple(topics)


def on_connect(client: mqtt.Client, userdata, flags, rc):  # type: ignore[override]
    if rc != 0:
        print(f"Failed to connect to MQTT broker (rc={rc})", file=sys.stderr)
        return
    for topic, qos in userdata["topics"]:
        client.subscribe(topic, qos=qos)
        print(f"Subscribed to {topic}")


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage):  # type: ignore[override]
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except json.JSONDecodeError:
        print(f"[{msg.topic}] {msg.payload}")
        return
    event_type = payload.get("type")
    if event_type == "word_assignment":
        describe_assignment(msg.topic, payload)
    elif event_type == "countdown_warning":
        seconds = payload.get("secondsRemaining", 30)
        print(f"[{msg.topic}] 倒计时进入最后 {seconds} 秒，触发蜂鸣提示")
    elif event_type == "voting_started":
        print(f"[{msg.topic}] 投票阶段开始，停止描述")
    elif event_type == "game_result":
        color = payload.get("color", "green")
        winner = payload.get("winner", False)
        outcome = "胜利" if winner else "失败"
        print(f"[{msg.topic}] 本阵营{outcome}，亮{color}灯")
    else:
        print(f"[{msg.topic}] {payload}")


def describe_assignment(topic: str, payload: dict):
    desc = PATTERN_DESCRIPTION.get(payload.get("pattern"), "震动提示：自定义模式")
    word_idx = payload.get("wordIndex")
    word = payload.get("word", "?")
    print(f"[{topic}] 词语 {word_idx}: {word} -> {desc}")


def main():
    args = parse_args()
    topics = topic_filters(args)
    userdata = {"topics": topics}
    client = mqtt.Client(client_id=f"{args.client_id}-{args.player or 'all'}", userdata=userdata)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(args.host, args.port, keepalive=60)

    def handle_exit(signum, frame):  # pragma: no cover
        print("\nStopping simulator...")
        client.disconnect()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    print("ESP32 wristband simulator running. Press Ctrl+C to exit.")
    client.loop_forever()


if __name__ == "__main__":
    main()
