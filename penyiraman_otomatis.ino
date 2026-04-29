// ================================================================
//  SISTEM PENYIRAM TANAMAN OTOMATIS - ESP32
//  Skripsi: Ahmad Abdul Rohib - Teknik Elektro UNESA 2025
//
//  Hardware:
//    - NodeMCU ESP32
//    - Capacitive Soil Moisture Sensor (GPIO34)
//    - Relay Module active-LOW (GPIO14)
//    - Pompa DC
//
//  Platform:
//    - Firebase Realtime Database (mode normal)
//    - Website custom Next.js di Vercel (monitoring + kontrol)
//
//  Library:
//    - Firebase ESP32 Client by Mobizt
//    - ArduinoJson by Benoit Blanchon
//    - WiFiManager by tzapu
// ================================================================

// ----------------------------------------------------------------
// MODE OPERASI
//   1 = NORMAL    : WiFi + Firebase + kontrol manual via website
//   0 = TEST      : offline, hanya sensor + relay otomatis (no network)
// ----------------------------------------------------------------
#define ENABLE_FIREBASE   1

#if ENABLE_FIREBASE
  #include <WiFiManager.h>
  #include <FirebaseESP32.h>
  #include <ArduinoJson.h>
#endif

// ----------------------------------------------------------------
// KONFIGURASI - SESUAIKAN BAGIAN INI
// ----------------------------------------------------------------

#if ENABLE_FIREBASE
  // Firebase - ambil dari Firebase Console
  #define FIREBASE_HOST   "siram-eea79-default-rtdb.asia-southeast1.firebasedatabase.app"
  #define FIREBASE_AUTH   "WNsapcWPsbRLK7jkMSYdr2iC3BiYrVFxJQ62Q4UO"
#endif

// Pin
#define PIN_SOIL        34    // GPIO34 - ADC input sensor kelembaban
#define PIN_RELAY       14    // GPIO14 - Output ke relay (active-LOW)
#define PIN_RESET_WIFI   0    // GPIO0  - Tombol BOOT bawaan ESP32 (tahan saat power on untuk reset WiFi)

// Kalibrasi sensor capacitive soil moisture
// Ukur sendiri dengan multimeter / serial monitor:
//   KERING  = tempel sensor di udara bebas, catat nilai ADC
//   BASAH   = celupkan sensor ke air, catat nilai ADC
#define SOIL_KERING     3200
#define SOIL_BASAH      800

// Threshold penyiraman: pompa ON jika kelembaban < THRESHOLD_PERSEN
#define THRESHOLD_PERSEN  50.0

// Interval
#define INTERVAL_SENSOR   3000    // Baca sensor tiap 3 detik (ms)

// ----------------------------------------------------------------
// PATH FIREBASE & VARIABEL GLOBAL (hanya dipakai mode normal)
// ----------------------------------------------------------------

#if ENABLE_FIREBASE
  #define PATH_SENSOR_PERSEN    "/sensor/kelembaban_persen"
  #define PATH_SENSOR_RAW       "/sensor/kelembaban_raw"
  #define PATH_SENSOR_TIMESTAMP "/sensor/timestamp"
  #define PATH_POMPA_STATUS     "/pompa/status"
  #define PATH_POMPA_MODE       "/pompa/mode"
  #define PATH_COMMAND_PUMP     "/command/pump"

  FirebaseData   fbData;
  FirebaseData   streamData;
  FirebaseAuth   fbAuth;
  FirebaseConfig fbConfig;

  volatile bool cmdPending = false;
  String        pendingCmd = "";
#endif

bool  pumpState  = false;
bool  modeManual = false;
float soilPersen = 0.0;
int   soilRaw    = 0;

unsigned long lastSensor = 0;

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

  soilRaw = constrain(soilRaw, SOIL_BASAH, SOIL_KERING);

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
  digitalWrite(PIN_RELAY, nyala ? LOW : HIGH);

  Serial.printf("[POMPA] %s | Mode: %s\n",
    nyala ? "NYALA" : "MATI",
    mode.c_str()
  );
}

#if ENABLE_FIREBASE
// ----------------------------------------------------------------
// FUNGSI KIRIM DATA KE FIREBASE
// ----------------------------------------------------------------

void kirimKeFirebase() {
  if (!Firebase.ready()) return;

  Firebase.setFloat(fbData, PATH_SENSOR_PERSEN, soilPersen);
  Firebase.setInt(fbData, PATH_SENSOR_RAW, soilRaw);
  Firebase.setInt(fbData, PATH_SENSOR_TIMESTAMP, (int)(millis() / 1000));

  Firebase.setBool(fbData, PATH_POMPA_STATUS, pumpState);
  Firebase.setString(fbData, PATH_POMPA_MODE, modeManual ? "manual" : "otomatis");

  Serial.printf("[FIREBASE] Kirim: %.1f%% | Pompa: %s | Mode: %s\n",
    soilPersen,
    pumpState ? "ON" : "OFF",
    modeManual ? "MANUAL" : "OTOMATIS"
  );
}

// ----------------------------------------------------------------
// FIREBASE STREAM CALLBACK
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
// KONEKSI WIFI (WiFiManager — captive portal saat setup pertama)
// ----------------------------------------------------------------

void konekWiFi() {
  // Tahan tombol BOOT (GPIO0) saat power on → hapus credentials tersimpan
  if (digitalRead(PIN_RESET_WIFI) == LOW) {
    WiFiManager wm;
    wm.resetSettings();
    Serial.println("[WIFI] Credentials dihapus. Restart...");
    delay(1000);
    ESP.restart();
  }

  WiFiManager wm;
  wm.setConnectTimeout(30);       // timeout konek ke WiFi tersimpan: 30 detik
  wm.setConfigPortalTimeout(120); // portal tutup otomatis setelah 2 menit

  Serial.println("[WIFI] Menghubungkan...");
  // autoConnect: konek otomatis jika credentials ada, buka portal "SiramAP" jika belum
  if (!wm.autoConnect("SiramAP")) {
    Serial.println("[WIFI] Gagal / timeout. Restart...");
    ESP.restart();
  }

  Serial.printf("[WIFI] Terhubung! SSID: %s | IP: %s\n",
    WiFi.SSID().c_str(),
    WiFi.localIP().toString().c_str()
  );
}
#endif  // ENABLE_FIREBASE

// ----------------------------------------------------------------
// FUNGSI LOGIKA OTOMATIS
// ----------------------------------------------------------------

void logikaPenyiraman() {
  if (modeManual) return;

  if (soilPersen < THRESHOLD_PERSEN) {
    if (!pumpState) {
      setPompa(true, "otomatis");
    }
  } else {
    if (pumpState) {
      setPompa(false, "otomatis");
    }
  }
}

// ----------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("  Sistem Penyiram Tanaman Otomatis");
#if ENABLE_FIREBASE
  Serial.println("  Mode: NORMAL (WiFi + Firebase aktif)");
#else
  Serial.println("  Mode: TEST OFFLINE (sensor + relay only)");
#endif
  Serial.println("========================================\n");

  // Relay active-LOW: pastikan pin HIGH dulu sebelum pinMode agar pompa tidak
  // sempat nyala saat boot (pin default LOW akan langsung trigger relay ON)
  digitalWrite(PIN_RELAY, HIGH);
  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, HIGH);

#if ENABLE_FIREBASE
  pinMode(PIN_RESET_WIFI, INPUT_PULLUP);
  konekWiFi();

  fbConfig.host                        = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token  = FIREBASE_AUTH;

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  fbData.setResponseSize(1024);
  streamData.setResponseSize(1024);

  Serial.print("[FIREBASE] Menghubungkan");
  int fbCoba = 0;
  while (!Firebase.ready() && fbCoba < 10) {
    delay(500);
    Serial.print(".");
    fbCoba++;
  }
  Serial.println(Firebase.ready() ? " Terhubung!" : " Timeout, lanjut...");

  Firebase.setString(fbData, PATH_COMMAND_PUMP, "none");

  Firebase.beginStream(streamData, PATH_COMMAND_PUMP);
  Firebase.setStreamCallback(streamData, streamCallback, streamTimeoutCallback);
#endif

  // Baca sensor pertama kali
  soilPersen = bacaSoilMoisture();
  Serial.printf("\n[SENSOR] Kelembaban awal: %.1f%% (raw: %d)\n",
    soilPersen, soilRaw
  );

  logikaPenyiraman();

#if ENABLE_FIREBASE
  kirimKeFirebase();
#endif

  Serial.println("\n[SIAP] Sistem berjalan...\n");
}

// ----------------------------------------------------------------
// LOOP UTAMA
// ----------------------------------------------------------------

void loop() {
#if ENABLE_FIREBASE
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Terputus, reconnect...");
    WiFi.reconnect();
    int coba = 0;
    while (WiFi.status() != WL_CONNECTED && coba < 20) {
      delay(500);
      coba++;
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WIFI] Gagal reconnect. Restart...");
      ESP.restart();
    }
    Serial.printf("[WIFI] Reconnected! IP: %s\n", WiFi.localIP().toString().c_str());
  }

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

    Firebase.setString(fbData, PATH_COMMAND_PUMP, "none");
    Firebase.setBool(fbData, PATH_POMPA_STATUS, pumpState);
    Firebase.setString(fbData, PATH_POMPA_MODE, modeManual ? "manual" : "otomatis");
  }
#endif

  unsigned long now = millis();
  if (now - lastSensor >= INTERVAL_SENSOR) {
    lastSensor = now;

    soilPersen = bacaSoilMoisture();
    Serial.printf("[SENSOR] Kelembaban: %.1f%% | raw: %d\n",
      soilPersen, soilRaw
    );

    logikaPenyiraman();

#if ENABLE_FIREBASE
    kirimKeFirebase();
#else
    Serial.printf("[STATUS] Pompa: %s | Threshold: %.0f%%\n",
      pumpState ? "ON" : "OFF",
      THRESHOLD_PERSEN
    );
#endif
  }
}
