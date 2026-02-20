# Login Credentials Guide (password default: `adminimpact`)

Panduan singkat menyiapkan email dan password untuk mengakses dashboard.

## Cara kerja otentikasi
- Form login mengirim `email` dan `password` ke `/api/login`.
- Backend mencari pengguna di tabel Supabase `dashboard_users` dan mencocokkan `password` dengan `password_hash` (bcrypt).
- Token JWT disimpan di `localStorage` (`ip_token`), lalu pengguna diarahkan ke `/dashboard`.

## Prasyarat
- Environment variables sudah terisi: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IMPACT_LINK_SECRET`.
- Akses ke Supabase project yang memuat tabel `dashboard_users` dan (opsional) `companies`.

## Membuat kredensial baru
1) Hasilkan hash bcrypt untuk password default **adminimpact**:
```bash
node -e "console.log(require('bcryptjs').hashSync('adminimpact', 10))"
```
2) Masukkan record ke tabel `dashboard_users` (via SQL editor atau Table view):
```sql
insert into dashboard_users (id, email, full_name, role, company_id, password_hash, is_active)
values (
  gen_random_uuid(),                  -- atau UUID lain
  'admin@example.com',                -- email login
  'Admin Impact Plus',                -- nama tampilan
  'super_admin',                      -- atau 'company_admin'
  null,                               -- isi dengan UUID perusahaan jika perlu
  '<HASH_BCRYPT_HASIL_LANGKAH_1>',    -- hash bcrypt untuk adminimpact
  true                                -- harus aktif
);
```
3) Jika pengguna terkait perusahaan, pastikan `company_id` mengacu pada row di tabel `companies`.

## Aturan kata sandi
- Password default untuk semua akun: **adminimpact**. Ganti hash pada akun terkait jika kebijakan berubah.
- Frontend hanya memastikan password tidak kosong; backend memverifikasi bcrypt hash.
- Disarankan tetap gunakan minimal 8 karakter dengan kombinasi huruf, angka, dan simbol jika mengubah kebijakan.

## Uji login
1) Jalankan aplikasi lalu buka halaman `/login`.
2) Masukkan email dan password yang di-insert.
3) Jika berhasil, token tersimpan di `localStorage` dan Anda diarahkan ke dashboard.

## Rotasi / pencabutan akses
- Set `is_active = false` untuk menonaktifkan akun tanpa menghapus record.
- Untuk ganti password, update `password_hash` dengan hash baru.
