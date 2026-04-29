# SKILL.md — Sistem Penyiram Tanaman Otomatis IoT

Dokumen ini adalah ringkasan lengkap proyek skripsi untuk dipakai sebagai konteks di Claude Web (atau AI lain) saat mendesain block diagram, flowchart, atau dokumentasi visual.

---

## 1. Identitas Proyek

| | |
|---|---|
| **Judul Skripsi** | Rancang Bangun Prototype Penyiram Tanaman Otomatis Berbasis IoT pada Budidaya Cabai |
| **Mahasiswa** | Ahmad Abdul Rohib |
| **Program Studi** | Teknik Elektro, Universitas Negeri Surabaya (UNESA) |
| **Tahun** | 2025 |
| **Objek tanaman** | Cabai rawit |

---

## 2. Tujuan Sistem

Sistem IoT yang dapat:
1. **Memonitor** kelembaban tanah secara real-time dari browser (Next.js + Firebase)
2. **Menyiram otomatis** ketika kelembaban tanah turun di bawah threshold (50%)
3. **Mengontrol manual** pompa (ON/OFF/Auto) dari dashboard web tanpa harus berada dekat ESP32
4. **Logging riwayat** kelembaban (20 data terakhir ditampilkan dalam grafik)

---

## 3. Stack Teknologi

| Layer | Teknologi | Catatan |
|---|---|---|
| **Hardware MCU** | NodeMCU ESP32 (Dev Module) | Built-in WiFi 2.4GHz |
| **Sensor** | Capacitive Soil Moisture Sensor v1.2 | Output analog |
| **Aktuator** | Relay Module 2-channel 5V (active-LOW, optocoupler PC817) | Hanya 1 channel terpakai |
| **Pompa** | Pompa DC mini 12V (water pump submersible/external) | |
| **Power Supply** | Adaptor 12V 2A + Step-Down LM2596 | LM2596 turunkan 12V → 5V untuk ESP32 & relay |
| **Firmware** | Arduino C++ (`penyiraman_otomatis.ino`) | |
| **Library Arduino** | Firebase ESP32 Client (Mobizt), ArduinoJson (Blanchon), WiFiManager (tzapu) | |
| **Database** | Firebase Realtime Database (asia-southeast1) | Free tier (Spark plan) |
| **Frontend** | Next.js 14 + TypeScript + Tailwind + Recharts | |
| **Hosting Frontend** | Vercel (free tier) | |
| **Dev Environment** | Docker (tidak ada Node.js di mesin lokal) | |

---

## 4. Arsitektur Sistem (Block Diagram Logis)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      LINGKUNGAN FISIK                                │
│                                                                       │
│   [Soil Moisture Sensor]         [Pompa DC 12V]                      │
│   GPIO34 (analog read)            12V dari adaptor                   │
│         │                              │                              │
│         │ ADC value (0-4095)           │ kontrol kontak              │
│         ▼                              ▼                              │
│   ┌──────────────────┐         ┌──────────────────┐                  │
│   │ ESP32 NodeMCU    │  GPIO14 │ Relay Module 5V  │                  │
│   │                  │────────▶│ (active-LOW)     │                  │
│   │ - WiFi client    │         └──────────────────┘                  │
│   │ - Firebase SDK   │                                                │
│   │ - Stream listener│                                                │
│   └──────────────────┘                                                │
│         │                                                              │
└─────────┼──────────────────────────────────────────────────────────────┘
          │ HTTPS (WiFi 2.4GHz → router rumah)
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       CLOUD (Firebase)                                 │
│                                                                        │
│   Firebase Realtime Database (asia-southeast1)                        │
│                                                                        │
│   /sensor/                                                             │
│       kelembaban_persen   (float)                                     │
│       kelembaban_raw      (int)                                       │
│       timestamp           (int — detik sejak ESP32 boot)              │
│   /pompa/                                                              │
│       status              (bool — true=ON, false=OFF)                 │
│       mode                ("otomatis" | "manual")                     │
│   /command/                                                            │
│       pump                ("on" | "off" | "auto" | "none")            │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
          │ WebSocket realtime (onValue subscription)
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  BROWSER USER (Vercel-hosted Next.js)                  │
│                                                                        │
│   Dashboard:                                                           │
│   - Status badge (online/offline berdasarkan timestamp)               │
│   - Gauge kelembaban (SVG circular)                                   │
│   - Status pompa + mode (otomatis/manual)                             │
│   - Tombol: NYALAKAN / MATIKAN / KEMBALI KE OTOMATIS                  │
│   - Info card: kelembaban saat ini, threshold, mode                   │
│   - Grafik garis: 20 data kelembaban terakhir                         │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Block Diagram Daya (Power Distribution)

```
[PLN 220V AC]
     │
     ▼
[Adaptor 12V 2A DC]──┬─────────────────▶ [Pompa DC 12V] (via kontak relay)
                     │
                     ▼
              [Step-Down LM2596]
              (kalibrasi: 12V → 5.0V via potensio)
                     │
                     ├─────────────────▶ [ESP32 VIN] (regulator internal → 3.3V)
                     │
                     └─────────────────▶ [Relay VCC] (logic 5V)

GND seluruh komponen disambung jadi satu (common ground).
```

> ⚠️ Wajib kalibrasi LM2596 ke **5.0V** dengan multimeter sebelum disambung ke ESP32. Tegangan default LM2596 baru biasanya 12V → bisa membakar ESP32.

---

## 6. Pin Mapping ESP32

| Komponen | Pin ESP32 | Tipe | Catatan |
|---|---|---|---|
| Soil Moisture Sensor (AOUT) | **GPIO34** | ADC input only | Tidak bisa output |
| Relay Module (IN) | **GPIO14** | Digital output | Active-LOW |
| Tombol Reset WiFi (BOOT bawaan) | **GPIO0** | Digital input pull-up | Dual-purpose |
| Sensor VCC | 3.3V | — | |
| Relay VCC | 5V (dari LM2596) | — | |
| Common GND | GND | — | Semua komponen |

---

## 7. Wiring Detail (Sambungan Pin)

### ESP32 ↔ Soil Moisture Sensor
| ESP32 | Sensor | Warna kabel (saran) |
|---|---|---|
| 3.3V | VCC | Merah |
| GND | GND | Hitam |
| GPIO34 | AOUT | Kuning |

### ESP32 ↔ Relay 2-channel
| ESP32 | Relay | Warna kabel (saran) |
|---|---|---|
| 5V (dari LM2596) | VCC | Putih |
| GND | GND | Abu-abu |
| GPIO14 | IN1 | Ungu |

### Relay ↔ Pompa & Power
- **COM (relay)** ← +12V dari adaptor
- **NO (relay)** → kabel positif pompa
- **Kabel negatif pompa** → GND adaptor (langsung, tidak lewat relay)

### LM2596 ↔ Adaptor & ESP32
- **IN+** ← +12V adaptor
- **IN−** ← GND adaptor
- **OUT+** → ESP32 VIN + Relay VCC (pakai T-junction)
- **OUT−** → GND ESP32 + GND relay (common ground)

---

## 8. Konfigurasi Firmware

File utama: `penyiraman_otomatis.ino`

### Mode operasi (compile-time)

```c
#define ENABLE_FIREBASE   1   // 1 = NORMAL, 0 = TEST OFFLINE
```

| Mode | Behavior |
|---|---|
| **NORMAL** (1) | WiFi + Firebase aktif, kontrol manual via website |
| **TEST OFFLINE** (0) | Hanya sensor + relay otomatis, tanpa network. Berguna untuk debug hardware tanpa WiFi |

### Konstanta penting

```c
#define PIN_SOIL          34       // ADC input
#define PIN_RELAY         14       // Output ke relay (active-LOW)
#define PIN_RESET_WIFI    0        // Tombol BOOT untuk reset WiFi credentials

#define SOIL_KERING       3200     // ADC value saat sensor di udara (kalibrasi per unit)
#define SOIL_BASAH        800      // ADC value saat sensor di air (kalibrasi per unit)
#define THRESHOLD_PERSEN  50.0     // Pompa ON jika kelembaban < 50%
#define INTERVAL_SENSOR   3000     // Baca sensor tiap 3 detik (ms)

#define FIREBASE_HOST     "siram-eea79-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH     "<legacy_secret_token>"
```

### Catatan kalibrasi sensor

Tiap sensor punya nilai ADC berbeda. **Wajib ukur ulang per unit:**
- `SOIL_KERING` = baca ADC saat sensor digantung di udara bebas (kering total)
- `SOIL_BASAH` = baca ADC saat sensor dicelup ke gelas berisi air

Tanpa kalibrasi yang benar, persentase kelembaban tidak akurat.

---

## 9. Logika Penyiraman Otomatis

```
LOOP setiap 3 detik:
  baca sensor → soilPersen
  
  IF mode == "manual":
    skip (tidak ubah pompa, biarkan user kontrol)
  ELSE:
    IF soilPersen < 50%:
      nyalakan pompa
    ELSE:
      matikan pompa
  
  kirim soilPersen + status pompa ke Firebase
```

---

## 10. Alur Kontrol Manual dari Web

```
[User klik "NYALAKAN" di browser]
        │
        ▼
[Next.js: sendCommand("on")]
        │
        ▼
[Firebase /command/pump = "on"]
        │
        │ ← Firebase Stream (FreeRTOS task di ESP32)
        │
        ▼
[ESP32 streamCallback: set cmdPending = true, pendingCmd = "on"]
        │
        ▼
[ESP32 loop(): cek cmdPending → eksekusi setPompa(true, "manual")]
        │
        ▼
[ESP32: tulis /pompa/status = true, /pompa/mode = "manual"]
[ESP32: hapus /command/pump = "none" (mark sudah dieksekusi)]
        │
        ▼
[Firebase realtime listener di browser update UI otomatis]
        │
        ▼
[User lihat: pompa ON, mode MANUAL]
```

**Latency:** < 1 detik dari klik tombol sampai pompa nyala (Firebase stream sangat cepat).

> 💡 **Kenapa pakai pendekatan flag (cmdPending) bukan eksekusi langsung di callback?**
> Stream callback dijalankan di FreeRTOS task terpisah. Jika eksekusi langsung di sana, bisa race condition dengan `kirimKeFirebase()` di loop utama (dua task tulis ke Firebase bersamaan = error). Solusi: callback hanya set flag, eksekusi di loop utama (single-threaded).

---

## 11. Mode "Auto" vs "Manual"

| | Otomatis | Manual |
|---|---|---|
| **Trigger** | Threshold (kelembaban < 50%) | User klik tombol di web |
| **Field `pompa.mode`** | `"otomatis"` | `"manual"` |
| **Cara masuk** | Default saat boot, atau klik "Kembali ke Otomatis" | Klik NYALAKAN / MATIKAN |
| **Behavior** | Pompa ON/OFF mengikuti sensor tiap 3 detik | Pompa stay ON/OFF sesuai kontrol terakhir, abaikan sensor |

---

## 12. WiFi Provisioning (WiFiManager)

ESP32 **tidak hardcode** SSID/password. Saat boot pertama:

```
[ESP32 boot, belum ada credentials]
        │
        ▼
[ESP32 jadi Access Point bernama "SiramAP"]
        │
        ▼
[User HP: konek ke SiramAP → browser auto-buka 192.168.4.1]
        │
        ▼
[User isi: SSID + password jaringan rumah/lab → Save]
        │
        ▼
[ESP32 simpan credentials ke NVS flash]
        │
        ▼
[ESP32 konek ke WiFi rumah → lanjut ke Firebase]

[Boot berikutnya: konek otomatis tanpa portal]
```

**Cara reset (kalau ganti jaringan):**
1. Tahan tombol **BOOT** (GPIO0 bawaan ESP32)
2. Tekan tombol **RST** sebentar
3. Lepas BOOT setelah ~2 detik
4. ESP32 hapus credentials → AP `SiramAP` muncul lagi

---

## 13. Firebase Realtime Database Schema

```
siram-eea79/                              ← root project
├── sensor/
│   ├── kelembaban_persen   : 65.4        (float, 0-100)
│   ├── kelembaban_raw      : 1850        (int, 800-3200)
│   └── timestamp           : 1234        (int, detik sejak boot ESP32)
├── pompa/
│   ├── status              : false       (bool)
│   └── mode                : "otomatis"  (string)
└── command/
    └── pump                : "none"      (string: "on"|"off"|"auto"|"none")
```

**Online detection di frontend:** Jika `Date.now()/1000 - sensor.timestamp > 30` → device dianggap offline (tidak update lebih dari 30 detik).

> ⚠️ **Catatan timestamp:** ESP32 pakai `millis()/1000` (detik sejak boot, BUKAN UNIX epoch). Jadi tidak bisa langsung dipakai untuk waktu absolut. Online detection di frontend pakai logika lain: bandingkan dengan `Date.now()` HANYA jika sebelumnya sudah punya nilai timestamp (delta-based, bukan absolut).

---

## 14. Struktur Frontend (Next.js)

```
/Users/Rizaldi/Project/siram/
├── app/
│   └── page.tsx                ← dashboard utama (gauge + chart + kontrol)
├── hooks/
│   └── usePlantData.ts         ← useSensorData() + usePompaData()
├── lib/
│   └── firebase.ts             ← initialize Firebase, listenSensor/Pompa, sendCommand
├── public/
├── docker-compose.yml          ← dev environment
├── Dockerfile
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── .env.local                  ← Firebase config (TIDAK di-commit)
├── .env.example                ← template
├── penyiraman_otomatis.ino     ← copy firmware (master version di sini)
└── CLAUDE.md                   ← guidance untuk Claude Code
```

### Komponen UI utama (`app/page.tsx`)

1. **`StatusBadge`** — indikator online/offline (hijau pulse / merah)
2. **`MoistureGauge`** — gauge SVG circular, warna berubah sesuai nilai (hijau ≥60%, oranye 40-59%, merah <40%)
3. **`PompaControl`** — status pompa + tombol NYALAKAN/MATIKAN/KEMBALI KE OTOMATIS
4. **`InfoCard`** — kartu info (kelembaban, threshold, mode)
5. **Recharts LineChart** — grafik 20 data kelembaban terakhir, dengan reference line di 50%

---

## 15. Environment Variables (Frontend)

File `.env.local` (tidak di-commit):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://siram-eea79-default-rtdb.asia-southeast1.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=siram-eea79
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Dapat dari: Firebase Console → Project Settings → General → Web App → `firebaseConfig`.

Saat deploy ke Vercel: tambahkan semua env var di Vercel Dashboard → Settings → Environment Variables.

---

## 16. Development Workflow

### Frontend (Docker)

```bash
docker compose build           # pertama kali / setelah ubah package.json
docker compose up              # jalankan dev server di localhost:3000
docker compose exec web npm install <pkg>   # install package baru
docker compose exec web npm run build       # build production
```

### Firmware

1. Buka `penyiraman_otomatis.ino` di Arduino IDE
2. **Tools** → **Board** → ESP32 → "ESP32 Dev Module"
3. **Tools** → **Partition Scheme** → "Huge APP (3MB No OTA)"
4. **Tools** → **Upload Speed** → 115200 (kalau 921600 error)
5. Install library: `Firebase ESP32 Client` (Mobizt), `ArduinoJson` (Blanchon), `WiFiManager` (tzapu)
6. Compile & Upload

---

## 17. Deployment ke Vercel

1. Push folder `/Users/Rizaldi/Project/siram/` ke GitHub
2. Vercel.com → New Project → Import dari GitHub
3. Tambahkan env vars di Vercel Dashboard
4. Deploy → otomatis dapat URL `*.vercel.app`
5. Di-share ke dosen pembimbing untuk demo

---

## 18. Catatan Penting dari Sesi Debugging Sebelumnya

### Masalah yang sudah diatasi:

| Masalah | Solusi |
|---|---|
| Threshold inkonsisten antara firmware/web/dokumen (60/40/30%) | Disatukan ke **50%** (referensi literatur cabai) |
| Polaritas relay salah (active-HIGH vs active-LOW) | Modul 2-channel dengan PC817 = **active-LOW** standard |
| Pompa nyala sebentar saat ESP32 boot | Boot sequence: `digitalWrite(HIGH)` SEBELUM `pinMode(OUTPUT)` |
| Race condition Firebase stream callback ↔ uploadFirebase | Callback hanya set flag, eksekusi di `loop()` |
| Flash overflow setelah tambah WiFiManager | Partition scheme = **Huge APP (3MB No OTA)** |
| Upload error pada 921600 baud | Turunkan ke **115200 baud** |
| Modul relay 1-channel defective (LED IN selalu nyala) | Ganti ke **2-channel module** |
| MQTT version dihapus karena Vercel tidak support broker | Pakai **Firebase Realtime Database** sebagai bridge |

### Hal yang TIDAK dipakai (sengaja):
- ❌ LCD I2C (UI sudah di web)
- ❌ Sensor pH (hanya pakai soil moisture)
- ❌ MQTT (Vercel tidak support persistent connection)
- ❌ ESP32 sebagai web server (resource terbatas, pakai Firebase saja)
- ❌ Hardcode WiFi credentials (sudah pakai WiFiManager provisioning)

---

## 19. Referensi untuk Block Diagram

Saat dibuatkan block diagram di Claude Web, sebutkan jenis-jenis ini:

1. **System Block Diagram (Hardware)** — komponen fisik + sambungan kabel
2. **Power Distribution Diagram** — jalur 220V → 12V → 5V → 3.3V
3. **Software Architecture Diagram** — ESP32 firmware ↔ Firebase ↔ Next.js
4. **Data Flow Diagram (DFD)** — alur data sensor → cloud → user
5. **Sequence Diagram (Kontrol Manual)** — user → web → Firebase → ESP32 → relay
6. **State Diagram (Mode Pompa)** — Otomatis ↔ Manual ON ↔ Manual OFF
7. **Flowchart Logika Penyiraman** — IF-ELSE threshold check
8. **Flowchart WiFi Provisioning** — boot → cek credentials → AP mode / connect

---

## 20. Lokasi File Firmware

Master version (yang diedit): `/Users/Rizaldi/Project/siram/penyiraman_otomatis.ino`

Copy untuk Arduino IDE: `/Users/Rizaldi/Documents/Arduino/penyiraman_otomatis/penyiraman_otomatis.ino`

Sync command:
```bash
cp /Users/Rizaldi/Project/siram/penyiraman_otomatis.ino \
   /Users/Rizaldi/Documents/Arduino/penyiraman_otomatis/penyiraman_otomatis.ino
```

---

## 21. Spesifikasi Hardware Detail (untuk Bill of Materials)

| Komponen | Spesifikasi | Qty |
|---|---|---|
| NodeMCU ESP32 | DevKitC, 38-pin, 4MB flash | 1 |
| Capacitive Soil Moisture Sensor v1.2 | Output analog 0-3V, anti-korosi | 1 |
| Relay Module 2-channel | 5V logic, 250VAC/30VDC max, optocoupler PC817 | 1 |
| Pompa DC | 12V, ~3W, submersible mini | 1 |
| Adaptor DC | 12V 2A, jack 5.5mm | 1 |
| Step-Down LM2596 | Adjustable, 3-40V in, 1.5-35V out, 3A max | 1 |
| Kabel jumper | Male-male, male-female, female-female | secukupnya |
| Selang air | Diameter 6-8mm | secukupnya |
| Wadah/pot tanaman | Untuk cabai rawit | 1 |
| Breadboard / PCB | Opsional untuk pengkabelan rapi | 1 |
| Tombol push button (opsional) | Pengganti tombol BOOT untuk reset WiFi | 0-1 |

---

**Selesai.** Dokumen ini self-contained — bisa di-paste ke Claude Web sebagai konteks lengkap untuk membuat block diagram, flowchart, atau visualisasi lain.
