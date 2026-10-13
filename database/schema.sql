CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  student_number VARCHAR(60) UNIQUE,
  guardian_phone VARCHAR(30),
  sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
  qr_token VARCHAR(128) UNIQUE,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scanned_by BIGINT NOT NULL REFERENCES users(id),
  class_name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present','late','excused')),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_student_time ON attendance(student_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_time ON attendance(checked_in_at DESC);
