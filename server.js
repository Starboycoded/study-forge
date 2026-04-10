import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';




const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);




const app = express();
const PORT = process.env.PORT || 3000;




app.set('trust proxy', 1);




const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });




const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});




const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://study-forge-frontend.vercel.app',
      'https://studyforge-frontend.vercel.app',
    ];




app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));




app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));




const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});




const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' },
});




app.use('/api/', generalLimiter);
app.use('/auth/', authLimiter);




const ALLOWED_MIMETYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
];


const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(pdf|txt|md|docx|doc|jpg|jpeg|png|webp)$/i;
    if (ALLOWED_MIMETYPES.includes(file.mimetype) || allowedExt.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, TXT, JPG, PNG, WEBP files are allowed'));
    }
  },
});




const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'studyforge_jwt_secret_change_in_production');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token. Please login again.' });
  }
};




const chunkText = (text, maxChunkSize = 8000) => {
  if (text.length <= maxChunkSize) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChunkSize;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      if (lastPeriod > start + 1000) end = lastPeriod + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
};




const groqChat = async (systemPrompt, userMessage, model = 'llama-3.3-70b-versatile') => {
  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });
  return response.choices[0].message.content;
};




const parseJSON = (text) => {
  try {
    const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    return JSON.parse(match ? match[1] : text);
  } catch { return null; }
};




app.get('/', (req, res) => {
  res.json({
    status: 'StudyForge API is running', version: '2.2.0', timestamp: new Date().toISOString(),
    endpoints: {
      auth: ['/auth/signup', '/auth/login', '/auth/me'],
      api: ['/api/extract', '/api/flashcards', '/api/quiz', '/api/theory', '/api/plan', '/api/grade', '/api/youtube'],
      sessions: ['/api/sessions', '/api/sessions/save'],
      progress: ['/api/progress/save', '/api/progress/:planId'],
      stats: ['/api/stats'],
    },
  });
});




app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});




app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name, created_at',
      [email.toLowerCase(), hashedPassword, name || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'studyforge_jwt_secret_change_in_production', { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created successfully.', token, user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } });
  } catch (err) { console.error('Signup error:', err); res.status(500).json({ error: 'Failed to create account. Please try again.' }); }
});




app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'studyforge_jwt_secret_change_in_production', { expiresIn: '7d' });
    res.json({ message: 'Login successful.', token, user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } });
  } catch (err) { console.error('Login error:', err); res.status(500).json({ error: 'Login failed. Please try again.' }); }
});




app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) { console.error('Get user error:', err); res.status(500).json({ error: 'Failed to get user info.' }); }
});




app.post('/api/extract', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const filePath = req.file.path;
    const originalName = req.file.originalname || '';
    const mime = req.file.mimetype;
    let extractedText = '';


    if (mime === 'application/pdf' || originalName.match(/\.pdf$/i)) {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword' ||
      originalName.match(/\.docx?$/i)
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (mime === 'text/plain' || originalName.match(/\.(txt|md)$/i)) {
      extractedText = fs.readFileSync(filePath, 'utf8');
    } else {
      const imageData = fs.readFileSync(filePath).toString('base64');
      const response = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Extract all text from this image. Return only the extracted text, nothing else.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${imageData}` } }] }],
        max_tokens: 4096,
      });
      extractedText = response.choices[0].message.content;
    }


    fs.unlinkSync(filePath);
    if (!extractedText || extractedText.trim().length < 10) return res.status(422).json({ error: 'Could not extract readable text from this file. Make sure it contains actual text (not a scanned image).' });
    res.json({ success: true, text: extractedText.trim(), wordCount: extractedText.trim().split(/\s+/).length, charCount: extractedText.trim().length });
  } catch (err) {
    console.error('Extract error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to extract text from file.' });
  }
});




app.post('/api/flashcards', authenticateToken, async (req, res) => {
  try {
    const { content, count = 10, difficulty = 'medium' } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    // Only use the first chunk to avoid generating more cards than requested
    const chunk = chunkText(content)[0];
    const systemPrompt = `You are an expert educator. Generate exactly ${count} high-quality flashcards from the provided content.\nDifficulty level: ${difficulty}.\nReturn ONLY a valid JSON array:\n[{ "front": "Question", "back": "Answer", "topic": "Topic" }]\nNo extra text, just the JSON array.`;
    const result = await groqChat(systemPrompt, chunk);
    const parsed = parseJSON(result);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return res.status(500).json({ error: 'Failed to generate flashcards. Please try again.' });
    // Enforce exact count
    const flashcards = parsed.slice(0, count);
    res.json({ success: true, flashcards, count: flashcards.length });
  } catch (err) { console.error('Flashcards error:', err); res.status(500).json({ error: 'Failed to generate flashcards.' }); }
});




app.post('/api/quiz', authenticateToken, async (req, res) => {
  try {
    const { content, count = 10, type = 'multiple_choice' } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    // Only use the first chunk to avoid generating more questions than requested
    const chunk = chunkText(content)[0];
    const systemPrompt = `You are an expert educator. Generate exactly ${count} quiz questions.\nReturn ONLY a valid JSON array:\n[{ "question": "Q", "options": ["A","B","C","D"], "correct": 0, "explanation": "Why" }]\n"correct" is the index (0-3). No extra text, just the JSON array.`;
    const result = await groqChat(systemPrompt, chunk);
    const parsed = parseJSON(result);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return res.status(500).json({ error: 'Failed to generate quiz. Please try again.' });
    // Enforce exact count
    const questions = parsed.slice(0, count);
    res.json({ success: true, questions, count: questions.length });
  } catch (err) { console.error('Quiz error:', err); res.status(500).json({ error: 'Failed to generate quiz.' }); }
});




// Theory endpoint: generates open-ended questions for the user to defend
app.post('/api/theory', authenticateToken, async (req, res) => {
  try {
    const { content, count = 3, topic = 'the subject' } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    const chunk = chunkText(content)[0];
    const systemPrompt = `You are an expert examiner. Generate exactly ${count} open-ended theory questions about ${topic}.\nThese questions should require the student to explain concepts, analyze ideas, compare theories, or defend a position — not just recall facts.\nReturn ONLY a valid JSON array:\n[{ "question": "Explain why...", "hint": "Consider discussing...", "keyPoints": ["point1", "point2"] }]\nNo extra text, just the JSON array.`;
    const result = await groqChat(systemPrompt, chunk);
    const parsed = parseJSON(result);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return res.status(500).json({ error: 'Failed to generate theory questions. Please try again.' });
    const questions = parsed.slice(0, count);
    res.json({ success: true, questions, count: questions.length });
  } catch (err) { console.error('Theory error:', err); res.status(500).json({ error: 'Failed to generate theory questions.' }); }
});




app.post('/api/plan', authenticateToken, async (req, res) => {
  try {
    const { content, examDate, hoursPerDay = 2, subject = 'General', days } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    let numDays = 7;
    if (days && Number.isFinite(Number(days)) && Number(days) > 0) {
      numDays = Math.round(Number(days));
    } else if (examDate) {
      const match = String(examDate).match(/(\d+)/);
      if (match) numDays = Math.min(Math.max(parseInt(match[1]), 1), 90);
    }
    const systemPrompt = `You are an expert study planner. Create a ${numDays}-day study timetable. You MUST produce exactly ${numDays} days \u2014 no more, no less.\nSubject: ${subject}\nHours/day: ${hoursPerDay}\nReturn ONLY a valid JSON object:\n{"totalDays":${numDays},"hoursPerDay":${hoursPerDay},"plan":[{"day":1,"date":"Day 1","topics":[],"tasks":[],"duration":"${hoursPerDay} hours","focus":"..."}],"tips":[],"summary":""}\nThe "plan" array MUST have exactly ${numDays} entries (day 1 through day ${numDays}). No extra text, just the JSON.`;
    const result = await groqChat(systemPrompt, content.slice(0, 8000));
    const parsed = parseJSON(result);
    if (!parsed) return res.status(500).json({ error: 'Failed to generate study plan. Please try again.' });
    res.json({ success: true, plan: parsed });
  } catch (err) { console.error('Plan error:', err); res.status(500).json({ error: 'Failed to generate study plan.' }); }
});




app.post('/api/grade', authenticateToken, async (req, res) => {
  try {
    const { question, answer, context = '' } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required.' });
    const prompt = `You are an expert examiner. Grade this student answer.\nQuestion: ${question}\n${context ? `Context: ${context.slice(0, 3000)}` : ''}\nAnswer: ${answer}\nReturn ONLY JSON: {"score":85,"grade":"B+","feedback":"","strengths":[],"improvements":[],"modelAnswer":""}\nScore out of 100. No extra text.`;
    const response = await anthropic.messages.create({ model: 'claude-haiku-20240307', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] });
    const parsed = parseJSON(response.content[0].text);
    if (!parsed) return res.status(500).json({ error: 'Failed to grade answer. Please try again.' });
    res.json({ success: true, result: parsed });
  } catch (err) { console.error('Grade error:', err); res.status(500).json({ error: 'Failed to grade answer.' }); }
});




app.post('/api/youtube', authenticateToken, async (req, res) => {
  try {
    const { url, count = 10 } = req.body;
    if (!url) return res.status(400).json({ error: 'YouTube URL is required.' });
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    if (!videoIdMatch) return res.status(400).json({ error: 'Invalid YouTube URL.' });
    const videoId = videoIdMatch[1];
    let transcript = '';
    try {
      const { Innertube } = await import('youtubei.js');
      const youtube = await Innertube.create({ retrieve_player: false });
      const info = await youtube.getInfo(videoId);
      const transcriptData = await info.getTranscript();
      transcript = transcriptData.transcript.content.body.initial_segments.map(seg => seg.snippet.text).join(' ');
    } catch (transcriptErr) {
      console.error('Transcript fetch error:', transcriptErr);
      return res.status(422).json({ error: 'Could not fetch transcript. The video may not have captions enabled.' });
    }
    if (!transcript || transcript.trim().length < 50) return res.status(422).json({ error: 'Transcript is too short or empty.' });
    const systemPrompt = `Generate exactly ${count} flashcards from this transcript.\nReturn ONLY JSON array: [{"front":"","back":"","topic":""}]`;
    const result = await groqChat(systemPrompt, transcript.slice(0, 8000));
    const flashcards = parseJSON(result);
    if (!flashcards || !Array.isArray(flashcards)) return res.status(500).json({ error: 'Failed to generate flashcards from video.' });
    res.json({ success: true, videoId, transcriptLength: transcript.length, flashcards, count: flashcards.length });
  } catch (err) { console.error('YouTube error:', err); res.status(500).json({ error: 'Failed to process YouTube video.' }); }
});




app.post('/api/sessions/save', authenticateToken, async (req, res) => {
  try {
    const { title, type, content, data } = req.body;
    if (!title || !type) return res.status(400).json({ error: 'Title and type are required.' });
    const result = await pool.query(
      'INSERT INTO sessions (user_id, title, type, content, data, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, title, type, created_at',
      [req.user.userId, title, type, content || null, JSON.stringify(data || {})]
    );
    res.status(201).json({ success: true, session: result.rows[0] });
  } catch (err) { console.error('Save session error:', err); res.status(500).json({ error: 'Failed to save session.' }); }
});




app.get('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, type, created_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.userId]);
    res.json({ success: true, sessions: result.rows });
  } catch (err) { console.error('Get sessions error:', err); res.status(500).json({ error: 'Failed to get sessions.' }); }
});




app.get('/api/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1 AND user_id = $2', [req.params.sessionId, req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    res.json({ success: true, session: result.rows[0] });
  } catch (err) { console.error('Get session error:', err); res.status(500).json({ error: 'Failed to get session.' }); }
});




app.delete('/api/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.sessionId, req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    res.json({ success: true, message: 'Session deleted.' });
  } catch (err) { console.error('Delete session error:', err); res.status(500).json({ error: 'Failed to delete session.' }); }
});




app.post('/api/progress/save', authenticateToken, async (req, res) => {
  try {
    const { planId, dayNumber, completed, notes } = req.body;
    if (!planId || dayNumber === undefined) return res.status(400).json({ error: 'planId and dayNumber are required.' });
    await pool.query(
      'INSERT INTO progress (user_id, plan_id, day_number, completed, notes, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (user_id, plan_id, day_number) DO UPDATE SET completed = $4, notes = $5, updated_at = NOW()',
      [req.user.userId, planId, dayNumber, completed || false, notes || null]
    );
    res.json({ success: true, message: 'Progress saved.' });
  } catch (err) { console.error('Save progress error:', err); res.status(500).json({ error: 'Failed to save progress.' }); }
});




app.get('/api/progress/:planId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM progress WHERE user_id = $1 AND plan_id = $2 ORDER BY day_number', [req.user.userId, req.params.planId]);
    res.json({ success: true, progress: result.rows });
  } catch (err) { console.error('Get progress error:', err); res.status(500).json({ error: 'Failed to get progress.' }); }
});




app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const [sessionsResult, progressResult] = await Promise.all([
      pool.query('SELECT type, COUNT(*) as count FROM sessions WHERE user_id = $1 GROUP BY type', [req.user.userId]),
      pool.query('SELECT COUNT(*) as completed FROM progress WHERE user_id = $1 AND completed = true', [req.user.userId]),
    ]);
    const sessionsByType = {};
    sessionsResult.rows.forEach(row => { sessionsByType[row.type] = parseInt(row.count); });
    res.json({
      success: true,
      stats: {
        totalSessions: sessionsResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
        sessionsByType,
        completedStudyDays: parseInt(progressResult.rows[0]?.completed || 0),
      },
    });
  } catch (err) { console.error('Stats error:', err); res.status(500).json({ error: 'Failed to get stats.' }); }
});




app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.message?.includes('CORS')) return res.status(403).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum size is 20MB.' });
  res.status(500).json({ error: err.message || 'Internal server error.' });
});




app.listen(PORT, () => {
  console.log(`StudyForge API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`JWT: ${process.env.JWT_SECRET ? 'SET' : 'USING DEFAULT'}`);
  console.log(`DB: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
  console.log(`Groq: ${process.env.GROQ_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Anthropic: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Origins: ${allowedOrigins.join(', ')}`);
});