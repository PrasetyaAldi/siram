# Wiring Diagram — Sistem Penyiram Tanaman Otomatis ESP32

Dokumen ini berisi seluruh sambungan pin & kabel untuk sistem. Bisa di-copy-paste ke AI image generator (Claude, ChatGPT dengan DALL-E, Midjourney, dll.) untuk render diagram visual.

---

## Komponen yang Dipakai

| No | Komponen | Spesifikasi |
|----|----------|-------------|
| 1 | NodeMCU ESP32 | DevKitC 38-pin |
| 2 | Capacitive Soil Moisture Sensor v1.2 | Output analog |
| 3 | Relay Module 2-channel | 5V, active-LOW, optocoupler PC817 |
| 4 | Pompa DC | 12V mini |
| 5 | Step-Down LM2596 | Adjustable, kalibrasi ke output 5V |
| 6 | Adaptor DC | 12V 2A |

---

## TABEL 1 — Sambungan Daya (Power Distribution)

| Dari | Ke | Catatan |
|------|----|---------| 
| Adaptor 12V (+) | LM2596 IN+ | Kabel merah |
| Adaptor 12V (−) | LM2596 IN− | Kabel hitam (jadi GND utama) |
| Adaptor 12V (+) | Relay COM (channel 1) | Cabang dari adaptor (T-junction) |
| LM2596 OUT+ | ESP32 VIN | Kabel merah, pastikan sudah 5V |
| LM2596 OUT+ | Relay VCC | Cabang T-junction dari OUT+ |
| LM2596 OUT− | ESP32 GND | Common ground |
| LM2596 OUT− | Relay GND | Common ground |

> ⚠️ **WAJIB:** Sebelum menyambung LM2596 ke ESP32, putar potensiometer LM2596 sambil ukur dengan multimeter sampai output **tepat 5.0V**. Default LM2596 baru bisa output 12V dan akan merusak ESP32.

---

## TABEL 2 — Sambungan Sensor Kelembaban (Soil Moisture)

| Pin Sensor | Pin ESP32 | Warna Kabel (saran) |
|------------|-----------|---------------------|
| VCC | 3.3V | Merah |
| GND | GND | Hitam |
| AOUT (analog) | GPIO34 | Kuning |
| DOUT (digital) | — (tidak dipakai) | — |

---

## TABEL 3 — Sambungan Relay Module ke ESP32

| Pin Relay | Pin ESP32 | Warna Kabel (saran) |
|-----------|-----------|---------------------|
| VCC | 5V (dari LM2596) | Putih |
| GND | GND | Abu-abu |
| IN1 (signal) | GPIO14 | Ungu |
| IN2 (signal) | — (tidak dipakai) | — |

> **Polarity:** GPIO14 = LOW → pompa NYALA. GPIO14 = HIGH → pompa MATI.

---

## TABEL 4 — Sambungan Output Relay ke Pompa

Channel 1 relay sebagai saklar untuk pompa 12V.

| Terminal Relay | Sambung ke | Catatan |
|----------------|------------|---------|
| COM (Common) | Adaptor 12V (+) | Sumber tegangan |
| NO (Normally Open) | Pompa kabel (+) | Aktif saat relay ditarik |
| NC (Normally Closed) | — (tidak dipakai) | — |
| Pompa kabel (−) | Adaptor 12V (−) / GND | Langsung ke GND, tidak lewat relay |

---

## TABEL 5 — Ringkasan Pin ESP32 Terpakai

| GPIO | Fungsi | Tipe | Komponen |
|------|--------|------|----------|
| GPIO34 | Input analog | ADC only | Soil Moisture AOUT |
| GPIO14 | Output digital | Active-LOW | Relay IN1 |
| GPIO0 | Input digital | Pull-up internal | Tombol BOOT bawaan (reset WiFi) |
| 3.3V | Power output | — | VCC sensor |
| 5V/VIN | Power input | — | Dari LM2596 OUT+ |
| GND | Ground | — | Common ground semua |

---

## TABEL 6 — Common Ground (Wajib!)

Semua GND berikut harus disambung jadi satu titik (common ground):

| Komponen | Pin GND |
|----------|---------|
| Adaptor 12V | (−) |
| LM2596 | IN− dan OUT− |
| ESP32 | GND |
| Relay Module | GND |
| Soil Moisture Sensor | GND |
| Pompa | (−) |

> Kalau salah satu GND tidak disambung ke common ground, sistem tidak akan stabil — sensor bisa baca nilai random, relay bisa salah trigger.

---

## TABEL 7 — Kabel yang Dibutuhkan

| Jenis Kabel | Jumlah (estimasi) | Untuk |
|-------------|------------------|-------|
| Jumper Male-Female | ~10 | ESP32 ↔ sensor & relay |
| Jumper Male-Male | ~5 | Antar breadboard |
| Kabel listrik 0.75mm | secukupnya | Adaptor → LM2596, relay → pompa |
| Selang air | secukupnya | Output pompa ke pot tanaman |

---

## DIAGRAM ASCII (untuk referensi visual cepat)

```
┌──────────────┐
│ Adaptor 12V  │
│   2A DC      │
└──┬───────┬───┘
   │ (+)   │ (−)
   │       │
   │       └──────────────────┬──────────────────┐
   │                          │                  │
   │                          │                  │
   ├──▶ LM2596 IN+            │                  │
   │       │                  │                  │
   │       ▼                  │                  │
   │   OUT+ = 5.0V            │                  │
   │       │                  │                  │
   │       ├──▶ ESP32 VIN     │                  │
   │       │                  │                  │
   │       └──▶ Relay VCC     │                  │
   │                          │                  │
   │   LM2596 OUT−            │                  │
   │       │                  │                  │
   │       ├──▶ ESP32 GND ────┤                  │
   │       │                  │                  │
   │       └──▶ Relay GND ────┤                  │
   │                          │                  │
   │   ESP32                  │                  │
   │   ├── 3.3V ──▶ Sensor VCC│                  │
   │   ├── GND  ──▶ Sensor GND┤                  │
   │   ├── GPIO34 ◀─ Sensor AOUT                 │
   │   └── GPIO14 ──▶ Relay IN1                  │
   │                                             │
   └──▶ Relay COM                                 │
                                                  │
        Relay NO ──▶ Pompa (+)                   │
                                                  │
                     Pompa (−) ────────────────── ┘
                                              GND common
```

---

## CHECKLIST SEBELUM POWER ON

- [ ] LM2596 sudah dikalibrasi ke **5.0V** (ukur dengan multimeter)
- [ ] Common ground sudah dipasang (semua GND tersambung)
- [ ] Polaritas relay benar: COM ke +12V, NO ke pompa (+)
- [ ] Polaritas pompa benar: pompa (+) ke relay NO, pompa (−) ke GND
- [ ] Sensor VCC ke **3.3V** ESP32 (BUKAN 5V — bisa rusak)
- [ ] Relay VCC ke **5V** dari LM2596 (BUKAN 3.3V — relay tidak akan trigger)
- [ ] GPIO34 ke AOUT sensor (BUKAN DOUT)
- [ ] Adaptor belum dicolok sebelum semua kabel terpasang

---

## PROMPT UNTUK GENERATE IMAGE

Copy text di bawah ini ke AI image generator:

```
Generate a clear technical wiring diagram for an IoT plant watering system with the following components:

1. ESP32 NodeMCU DevKitC (center)
2. Capacitive Soil Moisture Sensor v1.2 (left)
3. Relay Module 2-channel 5V with PC817 optocoupler (right)
4. DC Water Pump 12V (far right)
5. LM2596 Step-Down converter (top)
6. 12V 2A DC Adapter (top-left)

Connections to show:
- 12V Adapter (+) → LM2596 IN+ AND Relay COM (split)
- 12V Adapter (−) → common ground rail
- LM2596 OUT+ (5V) → ESP32 VIN AND Relay VCC
- LM2596 OUT− → common ground
- ESP32 3.3V → Sensor VCC
- ESP32 GND → Sensor GND, Relay GND, common ground
- ESP32 GPIO34 ← Sensor AOUT (analog signal)
- ESP32 GPIO14 → Relay IN1 (active-LOW signal)
- Relay COM ← +12V from adapter
- Relay NO → Pump (+)
- Pump (−) → common ground

Style: clean schematic / breadboard-style layout, labeled wires with colors:
- Red wire = +V (power positive)
- Black wire = GND (ground)
- Yellow wire = analog signal (sensor)
- Purple wire = digital signal (GPIO14)
- White wire = 5V power

Show component labels clearly. Background white. Professional technical drawing style suitable for an undergraduate engineering thesis (skripsi).
```

---

**File ini self-contained** — bisa langsung di-paste ke AI image generator atau dipakai sebagai referensi saat merangkai hardware.
