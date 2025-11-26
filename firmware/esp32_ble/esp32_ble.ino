#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// 保持与前端一致的 UUID
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define LED_PIN 2
#define VIBE_PIN 4

// PWM 设置
#define PWM_CHANNEL 0
#define PWM_FREQ 5000
#define PWM_RES 8

bool deviceConnected = false;

// 定义振动步骤结构体
struct VibeStep {
  int duration;  // 持续时间 (ms)
  int intensity; // 振动强度 (0-255)
};

// 模式 A: .-.-.- (短-长-短-长 节奏)
// 模拟莫尔斯电码风格：短震(100ms) + 间歇(100ms) + 长震(300ms) + 间歇(100ms)
VibeStep patternA[] = {
  {100, 255}, {100, 0}, {300, 255}, {100, 0}, // .-
  {100, 255}, {100, 0}, {300, 255}, {100, 0}, // .-
  {100, 255}, {100, 0}, {300, 255}, {0, 0}    // .- (结束)
};

// 模式 B: .....----- (急促短震 + 长震)
// 5次急促短震(50ms) + 3次长震(400ms)
VibeStep patternB[] = {
  {50, 180}, {50, 0}, {50, 180}, {50, 0}, {50, 180}, {50, 0}, {50, 180}, {50, 0}, {50, 180}, {50, 0}, // .....
  {400, 220}, {200, 0}, {400, 220}, {200, 0}, {400, 220}, {0, 0} // --- (结束)
};

VibeStep* currentPattern = nullptr;
int patternIndex = 0;
unsigned long stepStartTime = 0;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println(">>> 蓝牙已连接 <<<");
      digitalWrite(LED_PIN, HIGH);
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println(">>> 蓝牙已断开 <<<");
      digitalWrite(LED_PIN, LOW);
      pServer->startAdvertising(); 
      Serial.println("重新广播...");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue();
      if (value.length() > 0) {
        char cmd = value[0];
        
        if (cmd.equals("A") || cmd.equals("1")) {
          Serial.println("Playing Pattern A: .-.-.-");
          currentPattern = patternA;
          patternIndex = 0;
          stepStartTime = millis();
          ledcWrite(PWM_CHANNEL, currentPattern[0].intensity);
        } else if (cmd.equals("B") || cmd.equals("2")) {
          Serial.println("Playing Pattern B: .....-----");
          currentPattern = patternB;
          patternIndex = 0;
          stepStartTime = millis();
          ledcWrite(PWM_CHANNEL, currentPattern[0].intensity);
        } else {
          Serial.print("Unknown Cmd: ");
          Serial.println(value.c_str());
        }
        
        // 闪灯反馈
        digitalWrite(LED_PIN, LOW);
        delay(50);
        digitalWrite(LED_PIN, HIGH);
      }
    }
};

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RES);
  ledcAttachPin(VIBE_PIN, PWM_CHANNEL);
  
  Serial.println("Starting BLE...");

  BLEDevice::init("X-Block_Band");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE Ready.");
}

void loop() {
  if (currentPattern != nullptr) {
    if (millis() - stepStartTime >= currentPattern[patternIndex].duration) {
      // Move to next step
      patternIndex++;
      
      // Check for end of pattern (duration == 0)
      if (currentPattern[patternIndex].duration == 0) {
        currentPattern = nullptr;
        ledcWrite(PWM_CHANNEL, 0); // Stop
        Serial.println("Pattern Finished");
      } else {
        // Execute next step
        stepStartTime = millis();
        ledcWrite(PWM_CHANNEL, currentPattern[patternIndex].intensity);
      }
    }
  }
  
  delay(5);
}
