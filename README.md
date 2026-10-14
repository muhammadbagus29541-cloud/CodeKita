# CodeKita UI/UX Prototype

Prototype frontend interaktif berbasis HTML, CSS, dan JavaScript murni. Tidak membutuhkan backend atau proses build.

## Menjalankan
1. Ekstrak ZIP.
2. Buka `index.html` di browser modern.
3. Untuk pengalaman clipboard/iframe yang lebih konsisten, jalankan folder ini melalui server statis lokal (misalnya Live Server atau `python -m http.server`).

## Halaman yang tersedia
- Beranda/feed, tab Untuk Kamu dan Mengikuti
- Jelajahi, pencarian dan filter
- Buat proyek dari template
- Detail proyek, preview visual, tab kode, salin kode, Remix
- Notifikasi dan filter
- Pesan simulasi
- Tersimpan dan koleksi lokal
- Profil dan edit profil
- CodeKita Studio dengan editor HTML/CSS/JavaScript, Run, preview sandbox iframe, mode desktop/mobile, salin kode dan unduh HTML

## Batasan prototype
- Data disimpan di memori browser selama halaman berjalan; belum ada akun sungguhan, backend, sinkronisasi, atau database.
- Like, follow, komentar, pesan, repost, draft, koleksi, dan publikasi adalah simulasi frontend.
- Sandbox iframe merupakan demonstrasi awal, bukan jaminan keamanan produksi. Sebelum publikasi, implementasikan isolasi origin terpisah, CSP, pembatasan jaringan, validasi server, rate limit, moderasi, serta pengujian keamanan.
- Jangan masukkan token, kata sandi, atau informasi rahasia ke kode demo.
- Google Fonts membutuhkan koneksi internet; fallback font tetap tersedia.

## Struktur
- `index.html` — struktur halaman dan komponen
- `style.css` — desain responsif desktop dan mobile
- `app.js` — data demo dan interaksi frontend
