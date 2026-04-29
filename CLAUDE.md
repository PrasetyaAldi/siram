# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Konteks Proyek

Skripsi: **Rancang Bangun Prototype Penyiram Tanaman Otomatis Berbasis IoT pada Budidaya Cabai**
Mahasiswa: Ahmad Abdul Rohib — Teknik Elektro UNESA 2025

Sistem IoT penyiraman otomatis tanaman cabai rawit. ESP32 membaca sensor kelembaban tanah dan mengontrol pompa via relay. Website Next.js di Vercel untuk monitoring dan kontrol manual dari browser via Firebase Realtime Database.

---

## Stack Teknologi

| Layer    | Teknologi                                                              |
|----------|------------------------------------------------------------------------|
| Hardware | NodeMCU ESP32, Capacitive Soil Moisture Sensor, Relay, Pompa DC, Step-Down LM2596 |
| Firmware | Arduino C++ — `penyiraman_otomatis.ino`                               |
| Database | Firebase Realtime Database (monitoring & kontrol dari website)        |
| Frontend | Next.js 14 + TypeScript + Recharts + Tailwind                         |
| Hosting  | Vercel free tier                                                       |
| Dev env  | Docker (tidak ada Node di local)                                       |

---

## Arsitektur Sistem

```
[Soil Moisture Sensor] ──analog──▶ [ESP32] ──HTTP PUT──▶ [Firebase RTDB]
                                      │                        │
                              [Relay + Pompa]         realtime listener
                                      │                        │
                                      │                [Next.js di Vercel]
                                ◀──stream event──         (browser)
                                /command/pump
```

**Alur data:**
- ESP32 baca sensor tiap **3 detik** → tulis ke `/sensor` dan `/pompa` di Firebase
- Browser subscribe realtime ke `/sensor` dan `/pompa` → update UI otomatis
- Tombol kontrol di browser → tulis ke `/command/pump` di Firebase
- ESP32 terima command via **Firebase stream** (< 1 detik) → eksekusi pompa → hapus command → tulis status terbaru

---

## Pin Mapping ESP32

| Komponen           | Pin    | Keterangan                     |
|--------------------|--------|--------------------------------|
| Soil Moisture AOUT | GPIO34 | ADC input (read-only)          |
| Relay IN           | GPIO14 | Output digital (active-LOW)    |

---

## Firmware — Hal Penting

**Library yang dibutuhkan di Arduino IDE:**
- `Firebase ESP32 Client` by Mobizt
- `ArduinoJson` by Benoit Blanchon

**Kalibrasi sensor (wajib diukur ulang per unit):**
- `SOIL_KERING` = nilai ADC saat sensor di udara (~3200)
- `SOIL_BASAH` = nilai ADC saat sensor di air (~800)

**Command dari website** (ditulis ke Firebase `/command/pump`):
- `"on"` → nyalakan pompa, mode manual
- `"off"` → matikan pompa, mode manual
- `"auto"` → kembali ke mode otomatis
- `"none"` → tidak ada command (default/sudah dieksekusi)

**Mekanisme stream:** `Firebase.setStreamCallback()` menjalankan listener di FreeRTOS task terpisah. Callback hanya set flag `cmdPending`, eksekusi sebenarnya dilakukan di `loop()` untuk menghindari race condition dengan `uploadFirebase()`.

**Threshold otomatis:** Pompa ON jika `kelembaban < 50%` (konstanta `THRESHOLD_PERSEN` di firmware).

---

## Frontend (Next.js) — Struktur Kode

```
app/page.tsx          ← dashboard utama (gauge + chart + kontrol pompa)
hooks/usePlantData.ts ← useSensorData() + usePompaData() — Firebase realtime
lib/firebase.ts       ← konfigurasi Firebase + listenSensor/listenPompa/sendCommand
```

**Alur data frontend:**
- `listenSensor` / `listenPompa` → Firebase `onValue` → update state React realtime
- `sendCommand("on"|"off"|"auto")` → tulis ke `/command/pump` di Firebase
- Offline detection: jika `sensor.timestamp` > 30 detik yang lalu → `online = false`

**Firebase RTDB schema:**
```
/sensor/kelembaban_persen  (float)
/sensor/kelembaban_raw     (int)
/sensor/timestamp          (int — detik sejak ESP32 boot)
/pompa/status              (bool)
/pompa/mode                ("otomatis" | "manual")
/command/pump              ("on" | "off" | "auto" | "none")
```

---

## Development dengan Docker

```bash
# Pertama kali / setelah ubah package.json
docker compose build

# Jalankan dev server (hot-reload aktif via volume mount)
docker compose up

# Install package baru
docker compose exec web npm install <package-name>

# Build production
docker compose exec web npm run build
```

Dev server berjalan di `http://localhost:3000`.

---

## Environment Variables

Buat `.env.local` di root (tidak di-commit). Lihat `.env.example` untuk semua key yang dibutuhkan. Semua key diawali `NEXT_PUBLIC_FIREBASE_`.

Cara dapat nilai: Firebase Console → Project Settings → General → Web App → `firebaseConfig` object.

---

## Deploy ke Vercel

Push ke GitHub lalu connect repo di vercel.com. Tambahkan semua env var dari `.env.local` di Vercel Dashboard → Settings → Environment Variables.
