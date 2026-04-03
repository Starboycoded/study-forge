require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── JWT Auth Middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: "Unauthorized: no token provided" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: invalid or expired token" });
  }
}

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit hit — max 10 AI requests per minute." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts — try again in 15 minutes." },
});

app.use("/api", globalLimiter);

// ── AI Clients ────────────────────────────────────────────────────────────────
async function groq(prompt, system = "", maxTokens = 4096) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Groq error: ${data.error.message}`);
  return data.choices[0].message.content;
}

async function claude(userContent, system = "") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Claude error: ${data.error.message}`);
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJSON(text) {
  const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(clean); } catch (e) {}
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) try { return JSON.parse(arrMatch[0]); } catch (e) {}
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch (e) {}
  return null;
}

function truncate(text, chars = 5000) {
  return text.length > chars ? text.slice(0, chars) + "\n...[content continues]" : text;
}

function chunkText(text, chunkSize = 6000, overlap = 500) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

async function generateFlashcardsFromChunk(courseName, content, count) {
  const system = `You are an expert study assistant. Generate high-quality exam-focused flashcards. Return ONLY valid JSON arrays — no markdown, no explanation, no extra text.`;
  const prompt = `Generate exactly ${count} flashcards from the following study material for the course "${courseName}".

STUDY MATERIAL:
${content}

DISTRIBUTION:
- ${Math.round(count * 0.3)} definition cards: "What is [term]?"
- ${Math.round(count * 0.25)} explanation cards: "How does X work?"
- ${Math.round(count * 0.2)} comparison cards: "What is the difference between X and Y?"
- ${Math.round(count * 0.15)} application cards: "Give an example of X"
- ${Math.round(count * 0.1)} critical thinking: "What are the limitations of X?"

RULES:
- Answers must be 3-6 sentences minimum
- Never repeat the same topic twice
- Cover ALL major topics

Return ONLY this JSON array:
[{"q":"question text","a":"detailed answer text","course":"${courseName}"}]`;
  const raw = await groq(prompt, system, 6000);
  return parseJSON(raw) || [];
}

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) =>
  res.json({ status: "StudyForge API running", version: "2.0" })
);

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES — Public, no token needed
// ══════════════════════════════════════════════════════════════════════════════

// POST /auth/signup
app.post("/auth/signup", authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await db.query(
      "INSERT INTO users (email, password, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name",
      [email.toLowerCase(), hashedPassword, name || null]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
app.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await db.query(
      "SELECT id, email, name, password FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me — get current logged in user
app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, email, name, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API ROUTES — Protected, JWT required
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/extract
app.post("/api/extract", requireAuth, upload.array("files", 20), async (req, res) => {
  try {
    const results = [];
    for (const file of req.files) {
      const isPDF = file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf");
      let text = "";
      if (isPDF) {
        try {
          const parsed = await pdfParse(file.buffer);
          text = parsed.text || "";
        } catch (e) {
          text = "[Could not extract PDF text — file may be image-based]";
        }
      } else {
        text = file.buffer.toString("utf-8");
      }
      results.push({
        name: file.originalname,
        text: text.trim(),
        size: file.size,
        charCount: text.trim().length,
      });
    }
    res.json({ files: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards
app.post("/api/flashcards", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { courseName = "Course", content, count = 25 } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const CHUNK_SIZE = 6000;
    if (content.length <= CHUNK_SIZE) {
      const cards = await generateFlashcardsFromChunk(courseName, content, count);
      if (!cards.length) return res.status(500).json({ error: "Could not generate flashcards — try again" });
      return res.json({ cards, count: cards.length });
    }
    const chunks = chunkText(content, CHUNK_SIZE, 500);
    const cardsPerChunk = Math.ceil(count / chunks.length);
    const allCards = [];
    for (const chunk of chunks) {
      const cards = await generateFlashcardsFromChunk(courseName, chunk, cardsPerChunk);
      allCards.push(...cards);
    }
    const seen = new Set();
    const unique = allCards.filter((c) => {
      const key = c.q?.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const final = unique.slice(0, count);
    if (!final.length) return res.status(500).json({ error: "Could not generate flashcards — try again" });
    res.json({ cards: final, count: final.length });
  } catch (err) {
    console.error("Flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quiz
app.post("/api/quiz", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { courseName = "Course", content, mcqCount = 5, theoryCount = 4 } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const system = `You are an expert exam creator. Always return ONLY valid JSON — no markdown fences, no explanation.`;
    const prompt = `Create a mixed quiz for the course "${courseName}".

STUDY MATERIAL:
${truncate(content, 6000)}

PART A — ${mcqCount} MCQ questions (4 options, one correct answer, include explanation)
PART B — ${theoryCount} Theory questions (include modelAnswer, marks: 5)

Return ONLY this JSON array:
[
  {"type":"mcq","q":"question","options":["A","B","C","D"],"answer":0,"explanation":"why correct"},
  {"type":"theory","q":"Explain...","modelAnswer":"comprehensive answer...","marks":5}
]`;
    const raw = await groq(prompt, system, 5000);
    const questions = parseJSON(raw);
    if (!questions || !questions.length) return res.status(500).json({ error: "Could not generate quiz — try again" });
    const valid = questions.filter((q) =>
      q.type && q.q && (
        (q.type === "mcq" && Array.isArray(q.options) && typeof q.answer === "number") ||
        (q.type === "theory" && q.modelAnswer)
      )
    );
    res.json({ questions: valid, count: valid.length });
  } catch (err) {
    console.error("Quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plan
app.post("/api/plan", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { courses, examWeeks = 4, hoursPerDay = 2 } = req.body;
    if (!courses || !courses.length) return res.status(400).json({ error: "courses is required" });
    const today = new Date();
    const examDate = new Date(today);
    examDate.setDate(today.getDate() + examWeeks * 7);
    const studyDays = examWeeks * 7 - 7;
    const hoursPerCourse = Math.floor((studyDays * hoursPerDay) / courses.length);
    const courseInfo = courses.map((c) => `Course: ${c.name}\n${truncate(c.content || "", 1500)}`).join("\n\n---\n\n");
    const system = `You are an expert academic advisor. Always return ONLY valid JSON arrays with no extra text.`;
    const prompt = `Create a day-by-day study timetable.

Today: ${today.toISOString().split("T")[0]}
Exam: ${examDate.toISOString().split("T")[0]} | Hours/day: ${hoursPerDay} | Study days: ${studyDays} | Hours per course: ~${hoursPerCourse}h

COURSES:
${courseInfo}

RULES: Start tomorrow, rotate courses, last 7 days = revision, max 30 entries, be specific with topic names.

Return ONLY:
[{"date":"YYYY-MM-DD","course":"name","topic":"specific topic","pages":"Pages X-Y","duration":"${hoursPerDay}h","type":"study","done":false}]

For revision days use "type":"revision"`;
    const raw = await groq(prompt, system, 4000);
    const plan = parseJSON(raw);
    if (!plan || !plan.length) return res.status(500).json({ error: "Could not generate timetable — try again" });
    const withIds = plan
      .filter((p) => p.date && p.course && p.topic)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p, i) => ({ ...p, id: "p" + i, done: false }));
    res.json({ plan: withIds, count: withIds.length });
  } catch (err) {
    console.error("Plan error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/grade
app.post("/api/grade", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers || !answers.length) return res.status(400).json({ error: "answers is required" });
    const prompt = `Grade these student theory answers strictly and fairly.

${answers.map((a, i) => `QUESTION ${i + 1} (${a.marks || 5} marks):\n${a.q}\n\nMODEL ANSWER:\n${a.modelAnswer}\n\nSTUDENT ANSWER:\n${a.studentAnswer || "(No answer)"}`).join("\n---\n")}

Return ONLY: [{"score":3,"feedback":"specific feedback"}]`;
    const raw = await claude(prompt, "You are a strict but fair academic marker. Return only valid JSON arrays.");
    const grades = parseJSON(raw);
    if (!grades || !grades.length) return res.status(500).json({ error: "Could not grade answers — try again" });
    res.json({ grades });
  } catch (err) {
    console.error("Grade error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/youtube
app.post("/api/youtube", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { url, topic = "" } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || "";
    if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });
    let transcriptText = null;
    try {
      const { Innertube } = await import("youtubei.js");
      const youtube = await Innertube.create({ retrieve_player: false });
      const info = await youtube.getInfo(videoId);
      const transcriptData = await info.getTranscript();
      const segments = transcriptData?.transcript?.content?.body?.initial_segments || [];
      transcriptText = segments.map((s) => s?.snippet?.text || "").join(" ").trim() || null;
    } catch (e) {
      console.warn("Transcript unavailable:", e.message);
    }
    const system = `You are a study assistant. Return ONLY valid JSON arrays.`;
    let prompt;
    if (transcriptText) {
      prompt = `Generate 8 flashcards from this YouTube transcript:\n\n${truncate(transcriptText, 6000)}\n\nReturn ONLY: [{"q":"question","a":"detailed answer","course":"From YouTube"}]`;
    } else {
      if (!topic) return res.status(422).json({ error: "No transcript available. Please provide a topic hint.", requiresTopic: true });
      prompt = `Generate 8 flashcards on the topic: "${topic}"\n\nReturn ONLY: [{"q":"question","a":"detailed answer","course":"From YouTube (topic-based)"}]`;
    }
    const raw = await groq(prompt, system, 3000);
    const cards = parseJSON(raw);
    if (!cards || !cards.length) return res.status(500).json({ error: "Could not generate cards — try again" });
    res.json({ cards, count: cards.length, source: transcriptText ? "transcript" : "topic-based" });
  } catch (err) {
    console.error("YouTube error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────
app.post("/api/sessions/save", requireAuth, async (req, res) => {
  try {
    const { type, courseName, data } = req.body;
    if (!type || !data) return res.status(400).json({ error: "type and data required" });
    const result = await db.query(
      "INSERT INTO sessions (user_id, type, course_name, data, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id",
      [req.user.id, type, courseName || null, JSON.stringify(data)]
    );
    res.json({ success: true, sessionId: result.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sessions", requireAuth, async (req, res) => {
  try {
    const { type } = req.query;
    const query = type
      ? "SELECT id, type, course_name, created_at FROM sessions WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC"
      : "SELECT id, type, course_name, created_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC";
    const result = await db.query(query, type ? [req.user.id, type] : [req.user.id]);
    res.json({ sessions: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM sessions WHERE id=$1 AND user_id=$2",
      [req.params.sessionId, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Session not found" });
    res.json({ session: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM sessions WHERE id=$1 AND user_id=$2",
      [req.params.sessionId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Progress ──────────────────────────────────────────────────────────────────
app.post("/api/progress/save", requireAuth, async (req, res) => {
  try {
    const { planId, sessionId, done } = req.body;
    if (!planId || !sessionId) return res.status(400).json({ error: "planId and sessionId required" });
    await db.query(
      `INSERT INTO progress (user_id, plan_id, session_id, done, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (user_id, plan_id, session_id)
       DO UPDATE SET done=$4, updated_at=NOW()`,
      [req.user.id, planId, sessionId, done ?? true]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/progress/:planId", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT session_id, done, updated_at FROM progress WHERE user_id=$1 AND plan_id=$2",
      [req.user.id, req.params.planId]
    );
    res.json({ progress: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const [s, p] = await Promise.all([
      db.query(
        "SELECT type, COUNT(*) as count FROM sessions WHERE user_id=$1 GROUP BY type",
        [req.user.id]
      ),
      db.query(
        "SELECT COUNT(*) as total, SUM(CASE WHEN done=true THEN 1 ELSE 0 END) as completed FROM progress WHERE user_id=$1",
        [req.user.id]
      ),
    ]);
    const sessionCounts = {};
    for (const row of s.rows) sessionCounts[row.type] = parseInt(row.count);
    const pr = p.rows[0];
    res.json({
      sessions: sessionCounts,
      progress: {
        total: parseInt(pr.total) || 0,
        completed: parseInt(pr.completed) || 0,
        completionRate: pr.total > 0 ? Math.round((pr.completed / pr.total) * 100) : 0,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StudyForge API v2.0 running on port ${PORT}`);
  console.log(`Groq key: ${process.env.GROQ_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`Claude key: ${process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`JWT secret: ${process.env.JWT_SECRET ? "✓ set" : "✗ MISSING — AUTH WILL FAIL"}`);
  console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "* (all)"}`);
});
