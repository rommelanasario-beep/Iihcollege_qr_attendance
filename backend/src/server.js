import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import crypto from 'node:crypto';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 5000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

app.use(cors({ origin: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '100kb' }));

const query = (sql, params = []) => pool.query(sql, params);
const safeUser = u => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role, studentNumber: u.student_number || null });

function signToken(u) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  return jwt.sign({ sub: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
}
function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Please log in again.' }); }
}
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required.' });

async function ensureAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  const existing = await query('SELECT id FROM users WHERE lower(email)=lower($1)', [ADMIN_EMAIL]);
  if (!existing.rowCount) {
    await query(`INSERT INTO users(full_name,email,password_hash,role,is_approved)
      VALUES($1,lower($2),$3,'admin',true)`,
      [ADMIN_NAME || 'Administrator', ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 12)]);
    console.log('Initial admin account created from environment configuration.');
  }
}
async function sendParentSms(phone, message) {
  const token = process.env.SMS_API_TOKEN;
  const url = process.env.SMS_API_URL;
  if (!token || !url || !phone) {
    console.log('SMS not sent: SMS provider credentials or guardian phone missing.');
    return { sent: false, reason: 'SMS not configured' };
  }
  const body = new URLSearchParams({ apikey: token, number: phone, message });
  if (process.env.SMS_SENDER_NAME) body.set('sendername', process.env.SMS_SENDER_NAME);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) {
    console.error('SMS provider error:', response.status);
    return { sent: false, reason: 'SMS provider error' };
  }
  return { sent: true };
}

app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, service: 'IIH College Attendance API' }); }
  catch { res.status(503).json({ ok: false, error: 'Database unavailable' }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, studentNumber, guardianPhone, smsConsent } = req.body || {};
    if (!fullName?.trim() || !email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 8)
      return res.status(400).json({ error: 'Enter your full name, valid email, and password with at least 8 characters.' });
    const { rows } = await query(`INSERT INTO users(full_name,email,password_hash,role,student_number,guardian_phone,sms_consent,is_approved)
      VALUES($1,lower($2),$3,'student',$4,$5,$6,false)
      RETURNING id,full_name,email,role,student_number`,
      [fullName.trim(), email.trim(), await bcrypt.hash(password, 12), studentNumber?.trim() || null,
       guardianPhone?.trim() || null, smsConsent === true]);
    res.status(201).json({ message: 'Registration submitted. An administrator must approve your account before attendance access is enabled.', user: safeUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or student number is already registered.' });
    console.error(e); res.status(500).json({ error: 'Could not register account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email || '']);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
      return res.status(401).json({ error: 'Incorrect email or password.' });
    if (!u.is_approved && u.role !== 'admin')
      return res.status(403).json({ error: 'Your account is waiting for administrator approval.' });
    res.json({ token: signToken(u), user: safeUser(u) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed.' }); }
});

app.get('/api/me', auth, async (req, res) => {
  const { rows } = await query('SELECT id,full_name,email,role,student_number FROM users WHERE id=$1', [req.user.sub]);
  if (!rows[0]) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: safeUser(rows[0]) });
});

app.get('/api/student/qr', auth, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student account required.' });
  const { rows } = await query('SELECT id,full_name,qr_token FROM users WHERE id=$1 AND is_approved=true', [req.user.sub]);
  if (!rows[0]) return res.status(403).json({ error: 'Student account is not approved.' });
  let qrToken = rows[0].qr_token;
  if (!qrToken) {
    qrToken = crypto.randomBytes(24).toString('hex');
    await query('UPDATE users SET qr_token=$1 WHERE id=$2', [qrToken, req.user.sub]);
  }
  const dataUrl = await QRCode.toDataURL(qrToken, { width: 280, margin: 2 });
  res.json({ qr: dataUrl, studentName: rows[0].full_name, note: 'Show this code to authorized school staff. Do not post it publicly.' });
});

app.post('/api/attendance/scan', auth, adminOnly, async (req, res) => {
  try {
    const { qrToken, className } = req.body || {};
    if (!qrToken) return res.status(400).json({ error: 'QR token is required.' });
    const { rows } = await query(`SELECT id,full_name,student_number,guardian_phone,sms_consent
      FROM users WHERE qr_token=$1 AND role='student' AND is_approved=true`, [qrToken]);
    const student = rows[0];
    if (!student) return res.status(404).json({ error: 'QR code is invalid or student is not approved.' });
    const result = await query(`INSERT INTO attendance(student_id,scanned_by,class_name,status)
      VALUES($1,$2,$3,'present') RETURNING id,checked_in_at`,
      [student.id, req.user.sub, className?.trim() || 'Class']);
    let sms = { sent: false, reason: 'No guardian SMS consent or phone.' };
    if (student.sms_consent && student.guardian_phone) {
      const time = new Date(result.rows[0].checked_in_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
      sms = await sendParentSms(student.guardian_phone, `IIH College: ${student.full_name} was marked PRESENT for ${className?.trim() || 'class'} at ${time}.`);
    }
    res.status(201).json({ message: 'Attendance recorded.', student: { id: student.id, name: student.full_name, studentNumber: student.student_number }, attendance: result.rows[0], sms });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not record attendance.' }); }
});

app.get('/api/admin/dashboard', auth, adminOnly, async (_req, res) => {
  try {
    const [students, today, recent, pending] = await Promise.all([
      query(`SELECT count(*)::int AS total FROM users WHERE role='student'`),
      query(`SELECT count(DISTINCT student_id)::int AS total FROM attendance WHERE (checked_in_at AT TIME ZONE 'Asia/Manila')::date=(now() AT TIME ZONE 'Asia/Manila')::date`),
      query(`SELECT a.id,u.full_name,u.student_number,a.class_name,a.status,a.checked_in_at
        FROM attendance a JOIN users u ON u.id=a.student_id ORDER BY a.checked_in_at DESC LIMIT 20`),
      query(`SELECT id,full_name,email,student_number,created_at FROM users WHERE role='student' AND is_approved=false ORDER BY created_at ASC`)
    ]);
    res.json({ totalStudents: students.rows[0].total, presentToday: today.rows[0].total, recentAttendance: recent.rows, pendingStudents: pending.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load dashboard.' }); }
});
app.get('/api/admin/students', auth, adminOnly, async (_req, res) => {
  const { rows } = await query(`SELECT id,full_name,email,student_number,is_approved,created_at FROM users WHERE role='student' ORDER BY full_name`);
  res.json({ students: rows });
});
app.patch('/api/admin/students/:id/approve', auth, adminOnly, async (req, res) => {
  const { rows } = await query(`UPDATE users SET is_approved=true WHERE id=$1 AND role='student' RETURNING id,full_name,email`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Student not found.' });
  res.json({ message: 'Student approved.', student: rows[0] });
});
app.get('/api/admin/attendance', auth, adminOnly, async (_req, res) => {
  const { rows } = await query(`SELECT a.id,u.full_name,u.student_number,a.class_name,a.status,a.checked_in_at
    FROM attendance a JOIN users u ON u.id=a.student_id ORDER BY a.checked_in_at DESC LIMIT 200`);
  res.json({ attendance: rows });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });

await ensureAdmin().catch(e => { console.error('Admin initialization failed:', e.message); process.exit(1); });
app.listen(PORT, () => console.log(`IIH College API listening on port ${PORT}`));
