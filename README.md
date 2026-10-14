# CodeKita

CodeKita adalah aplikasi web sosial untuk membuat, menjalankan, berbagi, dan mempelajari proyek HTML, CSS, dan JavaScript.

## Fondasi aplikasi

Repository ini sekarang memiliki integrasi backend Supabase untuk autentikasi, profil, proyek, like, bookmark, follow, komentar, repost, notifikasi, koleksi, dan pesan. Agar fitur online aktif, hubungkan proyek ke instance Supabase milikmu. Tidak ada akun, postingan, atau aktivitas contoh yang disisipkan.

## 1. Buat proyek Supabase

1. Buat proyek di https://supabase.com/dashboard.
2. Buka **SQL Editor**, lalu jalankan seluruh isi `supabase/schema.sql`.
3. Buka **Project Settings → API** atau halaman Connect. Salin Project URL dan publishable key (atau anon key lama).
4. Isi nilai tersebut di `supabase-config.js`.

Gunakan hanya publishable/anon key di frontend. **Jangan pernah memasukkan service_role key atau secret key ke file JavaScript publik.** Kebijakan Row Level Security (RLS) di skema SQL membatasi akses data pengguna.

## 2. Jalankan aplikasi

Buka `index.html` melalui server web lokal atau hosting statis. Contoh: aktifkan GitHub Pages pada repository ini melalui **Settings → Pages**. Karena SDK Supabase dimuat dari CDN, aplikasi memerlukan koneksi internet.

Jika konfigurasi belum diisi, banner status akan ditampilkan dan fitur online tidak akan mengaku berhasil.

## Fitur backend yang disiapkan

- Daftar akun dan masuk menggunakan email/password Supabase Auth
- Profil pengguna
- Feed publik dari database dan publikasi proyek
- Simpan draft proyek di database
- Like, bookmark, follow, komentar, dan repost yang tersimpan di database
- Notifikasi untuk aktivitas komunitas
- Koleksi pribadi dan pesan langsung
- Editor HTML/CSS/JavaScript, live preview sandbox, salin kode, dan unduh HTML

## Struktur

- `index.html` — struktur antarmuka
- `style.css` — desain responsif
- `app.js` — UI, editor kode, dan preview
- `backend.js` — autentikasi dan operasi database
- `supabase-config.js` — konfigurasi frontend yang perlu diisi
- `supabase/schema.sql` — tabel, trigger, serta aturan keamanan RLS

## Keamanan dan batasan

Kode proyek dijalankan pada iframe sandbox tanpa akses ke halaman induk. Tetap perlakukan kode kiriman pengguna sebagai konten tidak tepercaya. Sebelum aplikasi dipublikasikan ke pengguna luas, lakukan pengujian otorisasi, pembatasan ukuran kode, moderasi konten, backup, dan pemantauan.
