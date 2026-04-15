// ================================================================
//  SISTEM PENYIRAM TANAMAN OTOMATIS - ESP32
//  Skripsi: Ahmad Abdul Rohib - Teknik Elektro UNESA 2025
//
//  Hardware:
//    - NodeMCU ESP32
//    - Capacitive Soil Moisture Sensor (GPIO34)
//    - Relay Module active-LOW (GPIO14)
//    - Pompa DC
//    - Power Supply 12V + Step-Down LM2596 (output 5V)
//
//  Platform:
//    - Firebase Realtime Database (data sensor + command)
//    - Website custom Next.js di Vercel (monitoring + kontrol)
//
//  Library yang dibutuhkan (install via Library Manager):
//    - Firebase ESP32 Client by Mobizt
//    - ArduinoJson by Benoit Blanchon
// ================================================================

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ArduinoJson.h>

// ----------------------------------------------------------------
// KONFIGURASI - SESUAIKAN BAGIAN INI
// ----------------------------------------------------------------

// WiFi
#define WIFI_SSID       "2.4G Anin"
#define WIFI_PASSWORD   "wudhudulu"

// Firebase - ambil dari Firebase Console
#define FIREBASE_HOST   "siram-eea79-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH   "WNsapcWPsbRLK7jkMSYdr2iC3BiYrVFxJQ62Q4UO"

// Pin
#define PIN_SOIL        34    // GPIO34 - ADC input sensor kelembaban
#define PIN_RELAY       14    // GPIO14 - Output ke relay (active-LOW)

// Kalibrasi sensor capacitive soil moisture
// Ukur sendiri dengan multimeter / serial monitor:
//   KERING  = tempel sensor di udara bebas, catat nilai ADC
//   BASAH   = celupkan sensor ke air, catat nilai ADC
#define SOIL_KERING     3200  // Nilai ADC saat tanah/udara kering
#define SOIL_BASAH      800   // Nilai ADC saat tanah basah / dalam air

// Threshold penyiraman (sesuai proposal: pompa ON jika < 60%)
#define THRESHOLD_PERSEN  60.0

// Interval
#define INTERVAL_SENSOR   3000    // Baca sensor + kirim Firebase tiap 3 detik (ms)

// ----------------------------------------------------------------
// PATH FIREBASE REALTIME DATABASE
//
// Struktur data di Firebase:
// {
//   "sensor": {
//     "kelembaban_persen": 45.2,
//     "kelembaban_raw": 2100,
//     "timestamp": 1234567890
//   },
//   "pompa": {
//     "status": true,        // true = ON, false = OFF
//     "mode": "otomatis"     // "otomatis" atau "manual"
//   },
//   "command": {
//     "pump": "none"         // "on", "off", "auto", atau "none"
//   }
// }
// ----------------------------------------------------------------

#define PATH_SENSOR_PERSEN    "/sensor/kelembaban_persen"
#define PATH_SENSOR_RAW       "/sensor/kelembaban_raw"
#define PATH_SENSOR_TIMESTAMP "/sensor/timestamp"
#define PATH_POMPA_STATUS     "/pompa/status"
#define PATH_POMPA_MODE       "/pompa/mode"
#define PATH_COMMAND_PUMP     "/command/pump"

// ----------------------------------------------------------------
// VARIABEL GLOBAL
// ----------------------------------------------------------------

FirebaseData   fbData;      // untuk upload sensor + eksekusi command
FirebaseData   streamData;  // khusus stream realtime /command/pump
FirebaseAuth   fbAuth;
FirebaseConfig fbConfig;

bool  pumpState  = false;   // Status pompa saat ini
bool  modeManual = false;   // false = otomatis, true = manual
float soilPersen = 0.0;
int   soilRaw    = 0;

unsigned long lastSensor = 0;

// Flag command dari stream callback
// Stream berjalan di FreeRTOS task terpisah — gunakan flag volatile
// agar perubahan langsung terlihat di loop() tanpa race condition
volatile bool cmdPending = false;
String        pendingCmd = "";

// ----------------------------------------------------------------
// FUNGSI BACA SENSOR KELEMBABAN
// ----------------------------------------------------------------

float bacaSoilMoisture() {
  // Rata-rata 10 sampel untuk kurangi noise ADC
  long total = 0;
  for (int i = 0; i < 10; i++) {
    total += analogRead(PIN_SOIL);
    delay(5);
  }
  soilRaw = total / 10;

  // Constrain agar tidak keluar range
  soilRaw = constrain(soilRaw, SOIL_BASAH, SOIL_KERING);

  // Konversi ke persen: kering = 0%, basah = 100%
  float persen = map(soilRaw, SOIL_KERING, SOIL_BASAH, 0, 100);
  return constrain(persen, 0.0, 100.0);
}

// ----------------------------------------------------------------
// FUNGSI KONTROL POMPA
// ----------------------------------------------------------------

void setPompa(bool nyala, String mode) {
  pumpState  = nyala;
  modeManual = (mode == "manual");

  // Relay active-LOW: nyala = LOW, mati = HIGH
  // Set HIGH dulu saat boot sudah ditangani di setup()
  digitalWrite(PIN_RELAY, nyala ? LOW : HIGH);

  Serial.printf("[POMPA] %s | Mode: %s\n",
    nyala ? "NYALA" : "MATI",
    mode.c_str()
  );
}

// ----------------------------------------------------------------
// FUNGSI KIRIM DATA KE FIREBASE
// ----------------------------------------------------------------

void kirimKeFirebase() {
  if (!Firebase.ready()) return;

  // Kirim data sensor
  Firebase.setFloat(fbData, PATH_SENSOR_PERSEN, soilPersen);
  Firebase.setInt(fbData, PATH_SENSOR_RAW, soilRaw);
  Firebase.setInt(fbData, PATH_SENSOR_TIMESTAMP, (int)(millis() / 1000));

  // Kirim status pompa
  Firebase.setBool(fbData, PATH_POMPA_STATUS, pumpState);
  Firebase.setString(fbData, PATH_POMPA_MODE, modeManual ? "manual" : "otomatis");

  Serial.printf("[FIREBASE] Kirim: %.1f%% | Pompa: %s\n",
    soilPersen, pumpState ? "ON" : "OFF"
  );
}

// ----------------------------------------------------------------
// FIREBASE STREAM CALLBACK
// Dipanggil otomatis oleh library saat nilai /command/pump berubah.
// Hanya set flag — eksekusi pompa dilakukan di loop() agar aman.
// ----------------------------------------------------------------

void streamCallback(StreamData data) {
  if (data.dataType() != "string") return;
  String cmd = data.stringData();
  if (cmd == "none" || cmd == "") return;

  Serial.printf("[STREAM] Command diterima: %s\n", cmd.c_str());
  pendingCmd = cmd;
  cmdPending = true;
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("[STREAM] Timeout - library reconnect otomatis");
  }
}

// ----------------------------------------------------------------
// FUNGSI LOGIKA OTOMATIS
// ----------------------------------------------------------------

void logikaPenyiraman() {
  // Jika sedang mode manual, skip logika otomatis
  if (modeManual) return;

  if (soilPersen < THRESHOLD_PERSEN) {
    // Tanah terlalu kering -> nyalakan pompa
    if (!pumpState) {
      setPompa(true, "otomatis");
    }
  } else {
    // Tanah sudah cukup lembab -> matikan pompa
    if (pumpState) {
      setPompa(false, "otomatis");
    }
  }
}

// ----------------------------------------------------------------
// KONEKSI WIFI
// ----------------------------------------------------------------

void konekWiFi() {
  Serial.printf("\n[WIFI] Menghubungkan ke: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int coba = 0;
  while (WiFi.status() != WL_CONNECTED && coba < 30) {
    delay(500);
    Serial.print(".");
    coba++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Terhubung! IP: %s\n",
      WiFi.localIP().toString().c_str()
    );
  } else {
    Serial.println("\n[WIFI] Gagal terhubung. Restart...");
    ESP.restart();
  }
}

// ----------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("  Sistem Penyiram Tanaman Otomatis");
  Serial.println("  ESP32 + Firebase + Vercel");
  Serial.println("========================================\n");

  // Set relay HIGH dulu sebelum pinMode agar pompa tidak sempat nyala
  // (saat pin masih LOW default, relay active-LOW akan langsung nyala)
  digitalWrite(PIN_RELAY, HIGH);
  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, HIGH);

  // Koneksi WiFi
  konekWiFi();

  // Konfigurasi Firebase
  fbConfig.host                        = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token  = FIREBASE_AUTH;

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  fbData.setResponseSize(1024);
  streamData.setResponseSize(1024);

  // Tunggu Firebase siap
  Serial.print("[FIREBASE] Menghubungkan");
  int fbCoba = 0;
  while (!Firebase.ready() && fbCoba < 10) {
    delay(500);
    Serial.print(".");
    fbCoba++;
  }
  Serial.println(Firebase.ready() ? " Terhubung!" : " Timeout, lanjut...");

  // Reset command saat boot (hindari command lama tereksekusi)
  Firebase.setString(fbData, PATH_COMMAND_PUMP, "none");

  // Mulai stream realtime ke /command/pump
  // Library menjalankan ini di FreeRTOS task terpisah — callback
  // dipanggil dalam milidetik saat nilai di Firebase berubah
  Firebase.beginStream(streamData, PATH_COMMAND_PUMP);
  Firebase.setStreamCallback(streamData, streamCallback, streamTimeoutCallback);

  // Baca sensor pertama kali sebelum loop agar logika otomatis
  // tidak salah trigger akibat nilai default soilPersen = 0.0
  soilPersen = bacaSoilMoisture();
  Serial.printf("\n[SENSOR] Kelembaban awal: %.1f%% (raw: %d)\n",
    soilPersen, soilRaw
  );

  logikaPenyiraman();
  kirimKeFirebase();

  Serial.println("\n[SIAP] Sistem berjalan...\n");
}

// ----------------------------------------------------------------
// LOOP UTAMA
// ----------------------------------------------------------------

void loop() {
  // Jaga koneksi WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Terputus, reconnect...");
    konekWiFi();
  }

  // 1. Eksekusi command dari website (di-set oleh streamCallback)
  //    Dilakukan di main task agar tidak ada race condition
  //    dengan operasi Firebase di kirimKeFirebase()
  if (cmdPending) {
    cmdPending    = false;
    String cmd    = pendingCmd;
    pendingCmd    = "";

    if (cmd == "on") {
      setPompa(true, "manual");
      Serial.println("[COMMAND] Terima: pompa ON (manual)");

    } else if (cmd == "off") {
      setPompa(false, "manual");
      Serial.println("[COMMAND] Terima: pompa OFF (manual)");

    } else if (cmd == "auto") {
      modeManual = false;
      Serial.println("[COMMAND] Terima: mode otomatis");
    }

    // Hapus command di Firebase agar tidak tereksekusi ulang saat boot
    Firebase.setString(fbData, PATH_COMMAND_PUMP, "none");

    // Upload status pompa terbaru langsung setelah command
    Firebase.setBool(fbData, PATH_POMPA_STATUS, pumpState);
    Firebase.setString(fbData, PATH_POMPA_MODE, modeManual ? "manual" : "otomatis");
  }

  // 2. Baca sensor + kirim ke Firebase tiap INTERVAL_SENSOR (3 detik)
  unsigned long now = millis();
  if (now - lastSensor >= INTERVAL_SENSOR) {
    lastSensor = now;

    soilPersen = bacaSoilMoisture();
    Serial.printf("[SENSOR] Kelembaban: %.1f%% | raw: %d\n",
      soilPersen, soilRaw
    );

    // Jalankan logika penyiraman otomatis
    logikaPenyiraman();

    // Kirim data ke Firebase
    kirimKeFirebase();
  }
}
