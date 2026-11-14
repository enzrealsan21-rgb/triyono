# TRIYONO AI — Full-stack starter

Website ini sudah berisi:
- Landing page responsif.
- Pendaftaran dan login pengguna.
- Password di-hash menggunakan bcrypt.
- Session login disimpan di SQLite.
- Chatbot AI melalui OpenAI Responses API.
- Riwayat percakapan per pengguna.
- Dashboard admin (statistik dan daftar pengguna).
- API key hanya dibaca oleh server dari `.env`, tidak dikirim ke browser.
- Rate limit dasar untuk login, daftar, dan chat.

## Persyaratan
- Node.js 20 atau lebih baru.
- Koneksi internet untuk memasang paket dan mengakses API AI.
- API key OpenAI untuk mengaktifkan jawaban AI sungguhan. Tanpa API key, website tetap berjalan dalam mode demo.

## Menjalankan di komputer
1. Ekstrak ZIP.
2. Buka folder `triyono-ai` di VS Code atau terminal.
3. Jalankan `npm install`.
4. Salin `.env.example` menjadi `.env`.
   - Windows PowerShell: `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
5. Edit `.env`:
   - Isi `SESSION_SECRET` dengan string acak panjang (minimal 32 karakter).
   - Isi `ADMIN_EMAIL`.
   - Isi `ADMIN_PASSWORD` dengan password admin kuat minimal 12 karakter.
   - Isi `OPENAI_API_KEY` untuk mengaktifkan AI sungguhan.
   - Model default `gpt-6-luna`; ganti sesuai model yang tersedia di akun API.
6. Jalankan `npm start`.
7. Buka `http://localhost:3000`.

Akun admin pertama dibuat otomatis saat server pertama kali dijalankan jika ADMIN_EMAIL dan ADMIN_PASSWORD sudah valid. Simpan kredensialnya dengan aman.

## Catatan API AI
Server mengirim permintaan ke `POST https://api.openai.com/v1/responses`. Kunci API wajib disimpan di `.env` pada server. Jangan pernah menaruh kunci API dalam `public/app.js`, HTML, atau kode yang dibagikan ke publik. Penggunaan API dapat menimbulkan biaya sesuai pemakaian dan pengaturan akun API.

## Deploy online
Deploy sebagai aplikasi Node.js yang mendukung:
- Node.js 20+
- Environment variables
- Persistent disk/volume untuk folder `data/` (database SQLite dan sesi)
- HTTPS

Atur environment variables yang sama di dashboard penyedia hosting. Set `NODE_ENV=production`, `PORT` biasanya disediakan oleh hosting. Pastikan `SESSION_SECRET`, password admin, dan API key tidak pernah dipublikasikan. Jangan memakai SQLite pada hosting yang menghapus file lokal setiap deploy; gunakan database terkelola atau persistent volume.

## Keamanan & privasi
Ini starter project, bukan audit keamanan produksi. Sebelum membuka pendaftaran publik, tambahkan verifikasi email, perlindungan CSRF yang sesuai, kebijakan privasi, ketentuan layanan, backup database, pemantauan, dan pengaturan retensi/penghapusan data. Jangan masukkan informasi pribadi sensitif ke chatbot. Untuk penggunaan oleh pelajar, minta pendampingan orang tua/guru saat menyiapkan akun layanan dan pembayaran.

## Struktur
- `server.js` — backend, autentikasi, database, API chat, admin.
- `public/index.html` — tampilan website.
- `public/style.css` — desain.
- `public/app.js` — interaksi browser.
- `.env.example` — contoh konfigurasi.
