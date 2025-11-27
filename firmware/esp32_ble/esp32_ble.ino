#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <FastLED.h>

// 保持与前端一致的 UUID
#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define LED_PIN 25
#define NUM_LEDS 3
#define VIBE_PIN 32

bool deviceConnected = false;
CRGB leds[NUM_LEDS];
CRGB currentColor = CRGB::Black;

// 定义振动步骤结构体
struct VibeStep {
  int duration;  // 持续时间 (ms)
  int intensity; // 振动强度 (0-255)
};

// 模式 A: 2s 高、2s 低，共 4s
VibeStep patternA[] = {{1000, 255}, {1000, 0}, {1000, 255}, {1000, 0}, {0, 0}};

// 模式 B: 0.5s 高、0.5s 低循环，共 4s
VibeStep patternB[] = {
    {100, 255}, {100, 0}, {100, 255}, {100, 0},
    {100, 255}, {100, 0}, {100, 255}, {100, 0},
    {100, 255}, {100, 0}, {0, 0}};

void showColor(const CRGB &color, bool remember = false) {
  for (uint16_t i = 0; i < NUM_LEDS; ++i) {
    leds[i] = color;
  }
  FastLED.show();
  if (remember) {
    currentColor = color;
  }
}

void setColor(const CRGB &color) { showColor(color, true); }

void flashAck() {
  CRGB previous = currentColor;
  showColor(CRGB::White);
  delay(1000);
  showColor(previous);
}

void setVibeIntensity(bool on) { digitalWrite(VIBE_PIN, on ? HIGH : LOW); }

void playPattern(const VibeStep *pattern, size_t length, const char *label) {
  Serial.print("Playing Pattern ");
  Serial.println(label);
  for (size_t i = 0; i < length; ++i) {
    setVibeIntensity(pattern[i].intensity > 0);
    delay(pattern[i].duration);
  }
  setVibeIntensity(false);
  Serial.println("Pattern Finished");
}

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println(">>> 蓝牙已连接 <<<");
    flashAck();
  };

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    Serial.println(">>> 蓝牙已断开 <<<");
    setColor(CRGB::Black);
    pServer->startAdvertising();
    Serial.println("重新广播...");
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue();
    if (value.length() == 0) {
      return;
    }

    String cmd = value;
    cmd.trim();
    if (cmd.length() == 0) {
      return;
    }
    cmd.toLowerCase();

    Serial.print("Received Cmd: ");
    Serial.println(cmd);

    bool handled = false;

    if (cmd.length() == 1) {
      char simple = cmd[0];
      if (simple == 'a' || simple == '1') {
        playPattern(patternA, sizeof(patternA) / sizeof(patternA[0]), "A");
        handled = true;
      } else if (simple == 'b' || simple == '2') {
        playPattern(patternB, sizeof(patternB) / sizeof(patternB[0]), "B");
        handled = true;
      }
    } else if (cmd == "red") {
      setColor(CRGB::Red);
      handled = true;
    } else if (cmd == "green") {
      setColor(CRGB::Green);
      handled = true;
    } else if (cmd == "blue") {
      setColor(CRGB::Blue);
      handled = true;
    } else if (cmd == "white") {
      setColor(CRGB::White);
      handled = true;
    } else if (cmd == "off") {
      setColor(CRGB::Black);
      handled = true;
    } else if (cmd == "vib_on") {
      setVibeIntensity(true);
      handled = true;
    } else if (cmd == "vib_off") {
      setVibeIntensity(false);
      handled = true;
    }

    if (!handled) {
      Serial.print("Unknown Cmd: ");
      Serial.println(value.c_str());
    }

    flashAck();
  }
};

void setup() {
  Serial.begin(115200);

  // FastLED setup
  FastLED.addLeds<NEOPIXEL, LED_PIN>(leds, NUM_LEDS);
  FastLED.clear(true);
  setColor(CRGB::Black);

  pinMode(VIBE_PIN, OUTPUT);
  setVibeIntensity(0);

  Serial.println("Starting BLE...");

  BLEDevice::init("X-Block_Band");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ |
                               BLECharacteristic::PROPERTY_WRITE |
                               BLECharacteristic::PROPERTY_NOTIFY);
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("BLE Ready. FastLED controller active.");
}

void loop() { delay(5); }
