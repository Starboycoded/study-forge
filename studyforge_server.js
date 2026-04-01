require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { YoutubeTranscript } = require("youtube-transcript");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Allowed origins ───────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
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
// Protects all /api/* routes with a shared API key.
// Set API_KEY in your .env. Clients send: Authorization: Bearer <key>
function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // If no key set, skip auth (dev mode)

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token || token !== apiKey) {
    return res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
  }
  next();
}

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
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
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
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

/**
 * Splits large text into overlapping chunks for processing.
 * Overlap ensures context isn't lost at chunk boundaries.
 */
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

/**
 * Generates flashcards from a single chunk of text.
 */
async function generateFlashcardsFromChunk(courseName, content, count) {
  const system = `You are an expert study assistant. You generate high-quality, 
exam-focused flashcards. Always return ONLY valid JSON arrays — no markdown, no explanation, 
no extra text. If you cannot complete all cards due to length, still close the JSON array properly.`;

  const prompt = `Generate exactly ${count} flashcards from the following study material for the course "${courseName}".

STUDY MATERIAL:
${content}

DISTRIBUTION REQUIREMENTS:
- ${Math.round(count * 0.3)} definition cards: "What is [term]?" — clear, precise definitions
- ${Math.round(count * 0.25)} explanation cards: "How does X work?" / "Why does X happen?" — deeper understanding  
- ${Math.round(count * 0.2)} comparison cards: "What is the difference between X and Y?"
- ${Math.round(count * 0.15)} application cards: "Give an example of X" / "When would you use X?"
- ${Math.round(count * 0.1)} critical thinking: "What are the limitations of X?" / "What happens if X?"

RULES:
- Answers must be detailed and complete (3-6 sentences minimum)
- Questions must test real understanding, not just memory
- Cover ALL major topics in the material, not just the first section
- Never repeat the same topic twice

Return ONLY this JSON array (no other text):
[{"q":"question text","a":"detailed answer text","course":"${courseName}"}]`;

  const raw = await groq(prompt, system, 6000);
  return parseJSON(raw) || [];
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) =>
  res.json({ status: "StudyForge API running", version: "2.0" })
);

// ── POST /api/extract ─────────────────────────────────────────────────────────
app.post("/api/extract", upload.array("files", 20), async (req, res) => {
  try {
    const results = [];
    for (const file of req.files) {
      const isPDF =
        file.mimetype === "application/pdf" ||
        file.originalname.endsWith(".pdf");
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
        path: req.body[`path_${file.originalname}`] || file.originalname,
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
// Now handles large content via chunking — no more 6000-char cutoff.
// Body: { courseName, content, count? }
app.post("/api/flashcards", aiLimiter, async (req, res) => {
  try {
    const { courseName = "Course", content, count = 25 } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const CHUNK_SIZE = 6000;

    // If content fits in one chunk, process normally
    if (content.length <= CHUNK_SIZE) {
      const cards = await generateFlashcardsFromChunk(courseName, content, count);
      if (!cards.length) {
        return res.status(500).json({ error: "Could not generate flashcards — try again" });
      }
      return res.json({ cards, count: cards.length });
    }

    // Large content: split into chunks, generate cards per chunk, deduplicate
    const chunks = chunkText(content, CHUNK_SIZE, 500);
    const cardsPerChunk = Math.ceil(count / chunks.length);
    const allCards = [];

    for (const chunk of chunks) {
      const cards = await generateFlashcardsFromChunk(courseName, chunk, cardsPerChunk);
      allCards.push(...cards);
    }

    // Deduplicate by question similarity (simple exact match on q)
    const seen = new Set();
    const unique = allCards.filter((c) => {
      const key = c.q?.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Return up to requested count
    const final = unique.slice(0, count);
    if (!final.length) {
      return res.status(500).json({ error: "Could not generate flashcards — try again" });
    }

    res.json({ cards: final, count: final.length });
  } catch (err) {
    console.error("Flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quiz ────────────────────────────────────────────────────────────
app.post("/api/quiz", aiLimiter, async (req, res) => {
  try {
    const {
      courseName = "Course",
      content,
      mcqCount = 5,
      theoryCount = 4,
    } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const system = `You are an expert exam creator. You create rigorous, 
fair quiz questions that test genuine understanding. Always return ONLY valid JSON — 
no markdown fences, no explanation before or after the JSON.`;

    const prompt = `Create a mixed quiz for the course "${courseName}" from the following study material.

STUDY MATERIAL:
${truncate(content, 6000)}

REQUIREMENTS:

PART A — ${mcqCount} Objective (Multiple Choice) Questions:
- Test factual knowledge, definitions, processes
- Each must have exactly 4 options (A, B, C, D)
- Only ONE correct answer
- Wrong options must be plausible (not obviously wrong)
- Include a brief explanation of why the correct answer is right

PART B — ${theoryCount} Theory Questions (written response):
- Require in-depth explanation and analysis
- Use these starters ONLY: "Explain...", "Discuss...", "Compare and contrast...", "Describe the process of...", "Analyse...", "Evaluate..."
- Must test understanding beyond memorisation
- Each worth 5 marks
- Include a comprehensive model answer (what a top student would write)

RULES:
- Cover different topics — do NOT ask multiple questions on the same thing
- Theory questions must be answerable from the study material
- Model answers should be 4-8 sentences, comprehensive

Return ONLY this JSON array:
[
  {
    "type": "mcq",
    "q": "question text",
    "options": ["option A", "option B", "option C", "option D"],
    "answer": 0,
    "explanation": "why this answer is correct"
  },
  {
    "type": "theory",
    "q": "Explain the concept of...",
    "modelAnswer": "A comprehensive model answer covering all key points...",
    "marks": 5
  }
]`;

    const raw = await groq(prompt, system, 5000);
    const questions = parseJSON(raw);

    if (!questions || !questions.length) {
      return res.status(500).json({ error: "Could not generate quiz — try again" });
    }

    const valid = questions.filter(
      (q) =>
        q.type &&
        q.q &&
        ((q.type === "mcq" &&
          Array.isArray(q.options) &&
          typeof q.answer === "number") ||
          (q.type === "theory" && q.modelAnswer))
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
    if (!courses || !courses.length)
      return res.status(400).json({ error: "courses is required" });

    const today = new Date();
    const examDate = new Date(today);
    examDate.setDate(today.getDate() + examWeeks * 7);

    const studyDays = examWeeks * 7 - 7;
    const totalStudyHours = studyDays * hoursPerDay;
    const hoursPerCourse = Math.floor(totalStudyHours / courses.length);

    const courseInfo = courses
      .map((c) => {
        const preview = c.content
          ? truncate(c.content, 1500)
          : `Files: ${(c.fileNames || []).join(", ")}`;
        return `Course: ${c.name}\nContent preview:\n${preview}`;
      })
      .join("\n\n---\n\n");

    const system = `You are an expert academic advisor creating detailed, realistic study timetables.
Always return ONLY valid JSON arrays with no extra text or markdown.`;

    const prompt = `Create a day-by-day study timetable for a student.

STUDENT INFO:
- Today's date: ${today.toISOString().split("T")[0]}
- Exam date: ${examDate.toISOString().split("T")[0]} (${examWeeks} weeks away)
- Study time available: ${hoursPerDay} hours per day
- Total study days: ${studyDays} days (last 7 days reserved for revision)
- Courses: ${courses.length}

COURSE MATERIALS:
${courseInfo}

TIMETABLE RULES:
1. Start from TOMORROW (${new Date(today.getTime() + 86400000).toISOString().split("T")[0]})
2. Allocate roughly ${hoursPerCourse} hours per course spread across ${studyDays} days
3. ROTATE courses across days — do not finish one course before starting another
4. Each session = ${hoursPerDay <= 1.5 ? "the full " + hoursPerDay + "h" : "1-2 hours"} (realistic blocks)
5. Include SPECIFIC chapter/section names and page ranges where inferable from content
6. Last 7 days = Revision sessions (one per course + 2 general reviews)
7. Skip weekends ONLY if examWeeks > 3 (student needs all days otherwise)
8. Maximum 30 entries total

TOPIC FORMAT: Be specific. Instead of "Study Chapter 1", say "Introduction to Data Structures — Arrays & Linked Lists"
PAGES FORMAT: Estimate realistic page ranges like "Pages 1–18" or "Chapter 2, Sections 2.1–2.4"

Return ONLY this JSON array:
[{
  "date": "YYYY-MM-DD",
  "course": "course name",
  "topic": "specific chapter/section name",
  "pages": "Pages X–Y or Section X.X",
  "duration": "${hoursPerDay}h",
  "type": "study",
  "done": false
}]

For revision days use "type": "revision" and topic like "COSC101 — Full Revision & Past Questions"`;

    const raw = await groq(prompt, system, 4000);
    const plan = parseJSON(raw);

    if (!plan || !plan.length) {
      return res.status(500).json({ error: "Could not generate timetable — try again" });
    }

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
    if (!answers || !answers.length)
      return res.status(400).json({ error: "answers is required" });

    const prompt = `Grade the following student theory answers strictly and fairly.

${answers
  .map(
    (a, i) => `
QUESTION ${i + 1} (${a.marks || 5} marks):
${a.q}

MODEL ANSWER:
${a.modelAnswer}

STUDENT'S ANSWER:
${a.studentAnswer || "(No answer provided)"}
`
  )
  .join("\n---\n")}

GRADING CRITERIA:
- Award marks for correct concepts, accurate explanations, relevant examples
- Deduct marks for missing key points, inaccuracies, vague answers
- A blank or irrelevant answer = 0
- Be honest — do not inflate scores

Return ONLY a JSON array with one object per question in the same order:
[{
  "score": 3,
  "feedback": "Concise, specific feedback: what was good, what was missing, how to improve"
}]`;

    const raw = await claude(
      prompt,
      "You are a strict but fair academic marker. Return only valid JSON arrays."
    );
    const grades = parseJSON(raw);

    if (!grades || !grades.length) {
      return res.status(500).json({ error: "Could not grade answers — try again" });
    }

    res.json({ grades });
  } catch (err) {
    console.error("Grade error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/youtube ─────────────────────────────────────────────────────────
// Now fetches REAL transcript from YouTube instead of guessing.
// Body: { url, topic? }
app.post("/api/youtube", aiLimiter, async (req, res) => {
  try {
    const { url, topic = "" } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    // Extract video ID
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || "";
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL — could not extract video ID" });
    }

    // Fetch real transcript
    let transcriptText = "";
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = transcript.map((t) => t.text).join(" ");
    } catch (transcriptErr) {
      // Transcript unavailable (disabled captions, private video, etc.)
      console.warn("Transcript fetch failed:", transcriptErr.message);
      // Fall back to topic-based generation with clear disclaimer
      transcriptText = null;
    }

    const system = `You are a study assistant. Generate high-quality educational flashcards. Return ONLY valid JSON arrays.`;

    let prompt;
    if (transcriptText) {
      prompt = `Generate 8 comprehensive flashcards from the following YouTube video transcript.

VIDEO TRANSCRIPT:
${truncate(transcriptText, 6000)}

${topic ? `Topic hint: ${topic}` : ""}

Create:
- 3 definition/concept cards
- 3 explanation/how-it-works cards  
- 2 application/example cards

Each answer must be detailed (3-5 sentences). Base answers ONLY on the transcript content.

Return ONLY this JSON array:
[{"q": "question", "a": "detailed answer", "course": "From YouTube"}]`;
    } else {
      // Fallback: topic-based (honest about it)
      if (!topic) {
        return res.status(422).json({
          error: "This video has no captions/transcript available. Please provide a topic hint so we can still generate relevant flashcards.",
          requiresTopic: true,
        });
      }
      prompt = `Generate 8 comprehensive flashcards on the topic: "${topic}".

Note: The YouTube video transcript was unavailable, so these cards are based on general knowledge of the topic.

Create:
- 3 definition/concept cards
- 3 explanation/how-it-works cards  
- 2 application/example cards

Each answer must be detailed (3-5 sentences).

Return ONLY this JSON array:
[{"q": "question", "a": "detailed answer", "course": "From YouTube (topic-based)"}]`;
    }

    const raw = await groq(prompt, system, 3000);
    const cards = parseJSON(raw);

    if (!cards || !cards.length) {
      return res.status(500).json({ error: "Could not generate cards — try again" });
    }

    res.json({
      cards,
      count: cards.length,
      source: transcriptText ? "transcript" : "topic-based",
    });
  } catch (err) {
    console.error("YouTube error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/progress/save ───────────────────────────────────────────────────
// Save or update a study plan session as done/undone.
// Body: { userId, planId, sessionId, done }
app.post("/api/progress/save", async (req, res) => {
  try {
    const { userId, planId, sessionId, done } = req.body;
    if (!userId || !planId || !sessionId) {
      return res.status(400).json({ error: "userId, planId, and sessionId are required" });
    }

    await db.query(
      `INSERT INTO progress (user_id, plan_id, session_id, done, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, plan_id, session_id)
       DO UPDATE SET done = $4, updated_at = NOW()`,
      [userId, planId, sessionId, done ?? true]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Progress save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/progress/:userId/:planId ────────────────────────────────────────
// Get all progress for a user's study plan.
app.get("/api/progress/:userId/:planId", async (req, res) => {
  try {
    const { userId, planId } = req.params;
    const result = await db.query(
      `SELECT session_id, done, updated_at FROM progress
       WHERE user_id = $1 AND plan_id = $2`,
      [userId, planId]
    );
    res.json({ progress: result.rows });
  } catch (err) {
    console.error("Progress fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sessions/save ───────────────────────────────────────────────────
// Persist a generated flashcard/quiz/plan session for a user.
// Body: { userId, type, courseName, data }
app.post("/api/sessions/save", async (req, res) => {
  try {
    const { userId, type, courseName, data } = req.body;
    if (!userId || !type || !data) {
      return res.status(400).json({ error: "userId, type, and data are required" });
    }

    const result = await db.query(
      `INSERT INTO sessions (user_id, type, course_name, data, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [userId, type, courseName || null, JSON.stringify(data)]
    );

    res.json({ success: true, sessionId: result.rows[0].id });
  } catch (err) {
    console.error("Session save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sessions/:userId ─────────────────────────────────────────────────
// Get all saved sessions for a user.
app.get("/api/sessions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query; // optional filter: ?type=flashcards

    const query = type
      ? `SELECT id, type, course_name, created_at FROM sessions WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC`
      : `SELECT id, type, course_name, created_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`;

    const params = type ? [userId, type] : [userId];
    const result = await db.query(query, params);
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error("Sessions fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sessions/:userId/:sessionId ─────────────────────────────────────
// Get full data for a specific session.
app.get("/api/sessions/:userId/:sessionId", async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const result = await db.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ session: result.rows[0] });
  } catch (err) {
    console.error("Session detail error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/sessions/:userId/:sessionId ───────────────────────────────────
app.delete("/api/sessions/:userId/:sessionId", async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    await db.query(
      `DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Session delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats/:userId ────────────────────────────────────────────────────
// Get study stats for a user: total sessions, flashcards generated, quizzes taken, etc.
app.get("/api/stats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [sessionsResult, progressResult] = await Promise.all([
      db.query(
        `SELECT type, COUNT(*) as count FROM sessions WHERE user_id = $1 GROUP BY type`,
        [userId]
      ),
      db.query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN done = true THEN 1 ELSE 0 END) as completed
         FROM progress WHERE user_id = $1`,
        [userId]
      ),
    ]);

    const sessionCounts = {};
    for (const row of sessionsResult.rows) {
      sessionCounts[row.type] = parseInt(row.count);
    }

    const progressRow = progressResult.rows[0];

    res.json({
      sessions: sessionCounts,
      progress: {
        total: parseInt(progressRow.total) || 0,
        completed: parseInt(progressRow.completed) || 0,
        completionRate:
          progressRow.total > 0
            ? Math.round((progressRow.completed / progressRow.total) * 100)
            : 0,
      },
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StudyForge API v2.0 running on port ${PORT}`);
  console.log(`Groq key: ${process.env.GROQ_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`Claude key: ${process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`API key auth: ${process.env.API_KEY ? "✓ enabled" : "⚠ disabled (set API_KEY to enable)"}`);
  console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "* (all — set ALLOWED_ORIGINS in production)"}`);
});
