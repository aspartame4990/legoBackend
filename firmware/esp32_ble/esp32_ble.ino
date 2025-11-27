#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <FastLED.h>

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define LED_PIN 25
#define NUM_LEDS 3
#define VIBE_PIN 32

bool deviceConnected = false;
CRGB leds[NUM_LEDS];

// --- Vibration State Machine ---
struct VibeStep {
  int duration;  // ms
  int intensity; // 0 or >0
};

// Patterns
VibeStep patternA[] = {{1000, 255}, {1000, 0}, {1000, 255}, {1000, 0}};
VibeStep patternB[] = {
    {100, 255}, {100, 0}, {100, 255}, {100, 0},
    {100, 255}, {100, 0}, {100, 255}, {100, 0},
    {100, 255}, {100, 0}};

struct VibeState {
  bool active;
  const VibeStep *currentPattern;
  size_t patternLength;
  size_t currentStepIndex;
  unsigned long stepStartTime;
} vibeState = {false, NULL, 0, 0, 0};

// --- LED State Machine ---
enum LedMode {
  LED_STATIC,
  LED_BREATHING,
  LED_BLINKING,
  LED_FLASH_ACK
};

struct LedState {
  LedMode mode;
  CRGB targetColor;
  CRGB previousColor; // For restoring after flash
  unsigned long flashStartTime;
  unsigned long breathStartTime;
} ledState = {LED_STATIC, CRGB::Black, CRGB::Black, 0, 0};


void setVibeIntensity(bool on) { digitalWrite(VIBE_PIN, on ? HIGH : LOW); }

void startVibration(const VibeStep *pattern, size_t length) {
  vibeState.active = true;
  vibeState.currentPattern = pattern;
  vibeState.patternLength = length;
  vibeState.currentStepIndex = 0;
  vibeState.stepStartTime = millis();
  
  // Execute first step immediately
  setVibeIntensity(pattern[0].intensity > 0);
}

void stopVibration() {
  vibeState.active = false;
  setVibeIntensity(false);
}

void updateVibration() {
  if (!vibeState.active) return;

  unsigned long now = millis();
  const VibeStep *step = &vibeState.currentPattern[vibeState.currentStepIndex];

  if (now - vibeState.stepStartTime >= step->duration) {
    // Move to next step
    vibeState.currentStepIndex++;
    if (vibeState.currentStepIndex >= vibeState.patternLength) {
      stopVibration();
    } else {
      vibeState.stepStartTime = now;
      const VibeStep *nextStep = &vibeState.currentPattern[vibeState.currentStepIndex];
      setVibeIntensity(nextStep->intensity > 0);
    }
  }
}

void setLedStatic(CRGB color) {
  ledState.mode = LED_STATIC;
  ledState.targetColor = color;
  fill_solid(leds, NUM_LEDS, color);
  FastLED.show();
}

void setLedBreathing(CRGB color) {
  ledState.mode = LED_BREATHING;
  ledState.targetColor = color;
  ledState.breathStartTime = millis();
}

void setLedBlinking(CRGB color) {
  ledState.mode = LED_BLINKING;
  ledState.targetColor = color;
}

void triggerFlashAck() {
  // Only flash if not already flashing to avoid weirdness, or overwrite
  if (ledState.mode != LED_FLASH_ACK) {
    ledState.previousColor = (ledState.mode == LED_STATIC) ? ledState.targetColor : ledState.targetColor; 
    // If breathing, previousColor is the base color.
  }
  ledState.mode = LED_FLASH_ACK;
  ledState.flashStartTime = millis();
  fill_solid(leds, NUM_LEDS, CRGB::White);
  FastLED.show();
}

void updateLed() {
  unsigned long now = millis();

  // Reset brightness to max for non-breathing modes
  if (ledState.mode != LED_BREATHING) {
    FastLED.setBrightness(255);
  }

  if (ledState.mode == LED_FLASH_ACK) {
    if (now - ledState.flashStartTime > 500) { // 500ms flash
      // Restore previous
      if (ledState.previousColor == CRGB::Black) {
         setLedStatic(CRGB::Black);
      } else {
         setLedStatic(ledState.targetColor); 
      }
    }
  } else if (ledState.mode == LED_BREATHING) {
    // 5s period = 5000ms. 12 BPM.
    // Use global brightness for smoother effect
    uint8_t brightness = beatsin8(12, 50, 255); 
    FastLED.setBrightness(brightness);
    fill_solid(leds, NUM_LEDS, ledState.targetColor);
    FastLED.show();
  } else if (ledState.mode == LED_BLINKING) {
    // Rapid blinking: 250ms ON, 250ms OFF (2Hz)
    bool on = (now / 250) % 2 == 0;
    if (on) {
      fill_solid(leds, NUM_LEDS, ledState.targetColor);
    } else {
      fill_solid(leds, NUM_LEDS, CRGB::Black);
    }
    FastLED.show();
  }
}

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println(">>> BLE Connected <<<");
    triggerFlashAck();
  };

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    Serial.println(">>> BLE Disconnected <<<");
    setLedStatic(CRGB::Black);
    pServer->startAdvertising();
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue();
    if (value.length() == 0) return;

    String cmd = value;
    cmd.trim();
    if (cmd.length() == 0) return;
    cmd.toLowerCase();

    Serial.print("Cmd: ");
    Serial.println(cmd);

    bool handled = false;

    // Vibration Commands
    if (cmd == "a" || cmd == "1") {
      startVibration(patternA, sizeof(patternA) / sizeof(patternA[0]));
      handled = true;
    } else if (cmd == "b" || cmd == "2") {
      startVibration(patternB, sizeof(patternB) / sizeof(patternB[0]));
      handled = true;
    } else if (cmd == "vib_on") {
      setVibeIntensity(true);
      handled = true;
    } else if (cmd == "vib_off") {
      stopVibration();
      handled = true;
    }
    
    // LED Commands
    // Format: "color r,g,b" or "breath r,g,b"
    if (cmd.startsWith("color ")) {
      int r, g, b;
      if (sscanf(cmd.c_str(), "color %d,%d,%d", &r, &g, &b) == 3) {
        setLedStatic(CRGB(r, g, b));
        handled = true;
      }
    } else if (cmd.startsWith("breath ")) {
      int r, g, b;
      if (sscanf(cmd.c_str(), "breath %d,%d,%d", &r, &g, &b) == 3) {
        setLedBreathing(CRGB(r, g, b));
        handled = true;
      }
    } else if (cmd.startsWith("blink ")) {
      int r, g, b;
      if (sscanf(cmd.c_str(), "blink %d,%d,%d", &r, &g, &b) == 3) {
        setLedBlinking(CRGB(r, g, b));
        handled = true;
      }
    } else if (cmd == "red") {
      setLedStatic(CRGB::Red); handled = true;
    } else if (cmd == "green") {
      setLedStatic(CRGB::Green); handled = true;
    } else if (cmd == "blue") {
      setLedStatic(CRGB::Blue); handled = true;
    } else if (cmd == "white") {
      setLedStatic(CRGB::White); handled = true;
    } else if (cmd == "off") {
      setLedStatic(CRGB::Black); handled = true;
    }

    if (!handled) {
      Serial.println("Unknown Cmd");
    }
    
    // Optional: Flash ACK on every command? 
    // Maybe annoying for breathing updates. Let's only flash on connect or specific events.
    // Or just flash for vibration commands?
    // The previous code flashed on every write.
    // Let's keep it but maybe skip if breathing?
    // User didn't specify, but "FlashAck" interrupts breathing.
    // Let's disable FlashAck for "breath" commands to keep it smooth.
    if (!cmd.startsWith("breath")) {
       triggerFlashAck();
    }
  }
};

void setup() {
  Serial.begin(115200);

  FastLED.addLeds<NEOPIXEL, LED_PIN>(leds, NUM_LEDS);
  FastLED.clear(true);
  setLedStatic(CRGB::Black);

  pinMode(VIBE_PIN, OUTPUT);
  setVibeIntensity(false);

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

  Serial.println("BLE Ready.");
}

void loop() {
  updateVibration();
  updateLed();
  delay(5); // Small delay to prevent CPU hogging
}
