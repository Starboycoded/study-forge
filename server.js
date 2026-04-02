require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
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

// ── Auth Middleware ───────────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token || token !== apiKey) {
    return res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
  }
  next();
}

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit hit — max 10 AI requests per minute." },
});

app.use("/api", globalLimiter);
app.use("/api", requireApiKey);

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
- Cover ALL major topics, not just the first section

Return ONLY this JSON array:
[{"q":"question text","a":"detailed answer text","course":"${courseName}"}]`;
  const raw = await groq(prompt, system, 6000);
  return parseJSON(raw) || [];
}

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) =>
  res.json({ status: "StudyForge API running", version: "2.0" })
);

// ── POST /api/extract ─────────────────────────────────────────────────────────
app.post("/api/extract", upload.array("files", 20), async (req, res) => {
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

// ── POST /api/flashcards ──────────────────────────────────────────────────────
app.post("/api/flashcards", aiLimiter, async (req, res) => {
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

// ── POST /api/quiz ────────────────────────────────────────────────────────────
app.post("/api/quiz", aiLimiter, async (req, res) => {
  try {
    const { courseName = "Course", content, mcqCount = 5, theoryCount = 4 } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const system = `You are an expert exam creator. Always return ONLY valid JSON — no markdown fences, no explanation.`;
    const prompt = `Create a mixed quiz for the course "${courseName}".

STUDY MATERIAL:
${truncate(content, 6000)}

PART A — ${mcqCount} MCQ questions:
- 4 options each (A, B, C, D)
- One correct answer
- Include explanation for correct answer

PART B — ${theoryCount} Theory questions:
- Start with: "Explain...", "Discuss...", "Compare and contrast...", "Analyse...", "Evaluate..."
- Include modelAnswer (4-8 sentences)
- marks: 5

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

// ── POST /api/plan ────────────────────────────────────────────────────────────
app.post("/api/plan", aiLimiter, async (req, res) => {
  try {
    const { courses, examWeeks = 4, hoursPerDay = 2 } = req.body;
    if (!courses || !courses.length) return res.status(400).json({ error: "courses is required" });

    const today = new Date();
    const examDate = new Date(today);
    examDate.setDate(today.getDate() + examWeeks * 7);
    const studyDays = examWeeks * 7 - 7;
    const hoursPerCourse = Math.floor((studyDays * hoursPerDay) / courses.length);

    const courseInfo = courses
      .map((c) => `Course: ${c.name}\n${truncate(c.content || "", 1500)}`)
      .join("\n\n---\n\n");

    const system = `You are an expert academic advisor. Always return ONLY valid JSON arrays with no extra text.`;
    const prompt = `Create a day-by-day study timetable for a student.

Today: ${today.toISOString().split("T")[0]}
Exam date: ${examDate.toISOString().split("T")[0]} (${examWeeks} weeks away)
Hours/day: ${hoursPerDay} | Study days: ${studyDays} | Courses: ${courses.length} | Hours per course: ~${hoursPerCourse}h

COURSES:
${courseInfo}

RULES:
1. Start from tomorrow
2. Rotate courses across days
3. Last 7 days = revision sessions
4. Max 30 entries total
5. Be specific with topic names (not just "Chapter 1")

Return ONLY this JSON array:
[{"date":"YYYY-MM-DD","course":"name","topic":"specific topic name","pages":"Pages X-Y","duration":"${hoursPerDay}h","type":"study","done":false}]

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

// ── POST /api/grade ───────────────────────────────────────────────────────────
app.post("/api/grade", aiLimiter, async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers || !answers.length) return res.status(400).json({ error: "answers is required" });

    const prompt = `Grade the following student theory answers strictly and fairly.

${answers
  .map(
    (a, i) => `QUESTION ${i + 1} (${a.marks || 5} marks):
${a.q}

MODEL ANSWER:
${a.modelAnswer}

STUDENT ANSWER:
${a.studentAnswer || "(No answer provided)"}`
  )
  .join("\n---\n")}

GRADING CRITERIA:
- Award marks for correct concepts, accurate explanations, relevant examples
- Deduct marks for missing key points, inaccuracies, vague answers
- Blank or irrelevant answer = 0
- Be honest — do not inflate scores

Return ONLY a JSON array:
[{"score":3,"feedback":"specific feedback: what was good, what was missing, how to improve"}]`;

    const raw = await claude(prompt, "You are a strict but fair academic marker. Return only valid JSON arrays.");
    const grades = parseJSON(raw);
    if (!grades || !grades.length) return res.status(500).json({ error: "Could not grade answers — try again" });
    res.json({ grades });
  } catch (err) {
    console.error("Grade error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/youtube ─────────────────────────────────────────────────────────
app.post("/api/youtube", aiLimiter, async (req, res) => {
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
      prompt = `Generate 8 flashcards from this YouTube video transcript:

${truncate(transcriptText, 6000)}

Create:
- 3 definition/concept cards
- 3 explanation/how-it-works cards
- 2 application/example cards

Each answer must be 3-5 sentences. Base answers ONLY on the transcript.

Return ONLY: [{"q":"question","a":"detailed answer","course":"From YouTube"}]`;
    } else {
      if (!topic) {
        return res.status(422).json({
          error: "No transcript available for this video. Please provide a topic hint.",
          requiresTopic: true,
        });
      }
      prompt = `Generate 8 flashcards on the topic: "${topic}"

Create:
- 3 definition/concept cards
- 3 explanation cards
- 2 application cards

Each answer must be 3-5 sentences.

Return ONLY: [{"q":"question","a":"detailed answer","course":"From YouTube (topic-based)"}]`;
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

// ── POST /api/progress/save ───────────────────────────────────────────────────
app.post("/api/progress/save", async (req, res) => {
  try {
    const { userId, planId, sessionId, done } = req.body;
    if (!userId || !planId || !sessionId) {
      return res.status(400).json({ error: "userId, planId, sessionId required" });
    }
    await db.query(
      `INSERT INTO progress (user_id, plan_id, session_id, done, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (user_id, plan_id, session_id)
       DO UPDATE SET done=$4, updated_at=NOW()`,
      [userId, planId, sessionId, done ?? true]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/progress/:userId/:planId ─────────────────────────────────────────
app.get("/api/progress/:userId/:planId", async (req, res) => {
  try {
    const { userId, planId } = req.params;
    const result = await db.query(
      `SELECT session_id, done, updated_at FROM progress WHERE user_id=$1 AND plan_id=$2`,
      [userId, planId]
    );
    res.json({ progress: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sessions/save ───────────────────────────────────────────────────
app.post("/api/sessions/save", async (req, res) => {
  try {
    const { userId, type, courseName, data } = req.body;
    if (!userId || !type || !data) {
      return res.status(400).json({ error: "userId, type, data required" });
    }
    const result = await db.query(
      `INSERT INTO sessions (user_id, type, course_name, data, created_at)
       VALUES ($1,$2,$3,$4,NOW()) RETURNING id`,
      [userId, type, courseName || null, JSON.stringify(data)]
    );
    res.json({ success: true, sessionId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sessions/:userId ─────────────────────────────────────────────────
app.get("/api/sessions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    const query = type
      ? `SELECT id, type, course_name, created_at FROM sessions WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC`
      : `SELECT id, type, course_name, created_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC`;
    const result = await db.query(query, type ? [userId, type] : [userId]);
    res.json({ sessions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sessions/:userId/:sessionId ──────────────────────────────────────
app.get("/api/sessions/:userId/:sessionId", async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const result = await db.query(
      `SELECT * FROM sessions WHERE id=$1 AND user_id=$2`,
      [sessionId, userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Session not found" });
    res.json({ session: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/sessions/:userId/:sessionId ───────────────────────────────────
app.delete("/api/sessions/:userId/:sessionId", async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    await db.query(
      `DELETE FROM sessions WHERE id=$1 AND user_id=$2`,
      [sessionId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats/:userId ────────────────────────────────────────────────────
app.get("/api/stats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const [s, p] = await Promise.all([
      db.query(`SELECT type, COUNT(*) as count FROM sessions WHERE user_id=$1 GROUP BY type`, [userId]),
      db.query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN done=true THEN 1 ELSE 0 END) as completed FROM progress WHERE user_id=$1`,
        [userId]
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StudyForge API v2.0 running on port ${PORT}`);
  console.log(`Groq key: ${process.env.GROQ_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`Claude key: ${process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`API key auth: ${process.env.API_KEY ? "✓ enabled" : "⚠ disabled"}`);
  console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "* (all)"}`);
});
