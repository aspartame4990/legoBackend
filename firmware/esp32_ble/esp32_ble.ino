#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// 保持与前端一致的 UUID，这样你不用改前端代码也能搜到
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ESP32 板载 LED 通常是 GPIO 2
#define LED_PIN 2

bool deviceConnected = false;

// 服务器回调：处理连接和断开
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println(">>> 蓝牙已连接 (Device Connected) <<<");
      digitalWrite(LED_PIN, HIGH); // 连接亮灯
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println(">>> 蓝牙已断开 (Device Disconnected) <<<");
      digitalWrite(LED_PIN, LOW);  // 断开灭灯
      
      // 重新开始广播，以便下次连接
      pServer->startAdvertising(); 
      Serial.println("正在重新广播 (Advertising started again)");
    }
};

// 特征回调：处理数据写入
class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string value = pCharacteristic->getValue();
      if (value.length() > 0) {
        // 根据用户需求，收到 A/B 时打印特定字符串
        if (value == "A") {
          Serial.println("test vibe A");
        } else if (value == "B") {
          Serial.println("test vibe B");
        } else {
          Serial.print("收到指令: ");
          Serial.println(value.c_str());
        }
        
        // 收到任何数据闪烁一下，表示通信成功
        digitalWrite(LED_PIN, LOW);
        delay(100);
        digitalWrite(LED_PIN, HIGH);
      }
    }
};

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  
  Serial.println("正在启动 BLE...");

  // 1. 初始化设备名称
  BLEDevice::init("LegoSense_Band");

  // 2. 创建服务器
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // 3. 创建服务
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // 4. 创建特征 (允许读、写、通知)
  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->setCallbacks(new MyCallbacks());

  // 5. 启动服务
  pService->start();

  // 6. 开始广播 (让手机/电脑能搜到)
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  // 解决 iPhone 连接问题的一些参数
  pAdvertising->setMinPreferred(0x06);  
  pAdvertising->setMinPreferred(0x12);
  
  BLEDevice::startAdvertising();
  
  Serial.println("BLE 启动成功! 等待连接...");
  Serial.println("请打开 Host 面板点击 'Connect Bracelet'");
}

void loop() {
  // 主循环不需要做什么，回调函数会处理一切
  delay(1000);
}
