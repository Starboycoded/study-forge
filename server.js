require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" })); // lock this down to your Netlify URL in production
app.use(express.json({ limit: "50mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── AI Clients ────────────────────────────────────────────────────────────────

// Groq — free, Llama 3.3 70B — used for flashcards, quiz, timetable, youtube
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

// Claude Haiku — only used for theory grading (needs real judgment)
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
  // Strip markdown fences
  const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // Try direct parse
  try { return JSON.parse(clean); } catch {}
  // Try extracting array
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) try { return JSON.parse(arrMatch[0]); } catch {}
  // Try extracting object
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch {}
  return null;
}

function truncate(text, chars = 5000) {
  return text.length > chars ? text.slice(0, chars) + "\n...[content continues]" : text;
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "StudyForge API running", version: "1.0" }));

// ── POST /api/extract — Extract text from uploaded PDF/text files ─────────────
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
        } catch {
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
      });
    }
    res.json({ files: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/flashcards — Generate 25 flashcards from course content ─────────
//    Body: { courseName, content, count? }
app.post("/api/flashcards", async (req, res) => {
  try {
    const { courseName = "Course", content, count = 25 } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const system = `You are an expert study assistant. You generate high-quality, 
exam-focused flashcards. Always return ONLY valid JSON arrays — no markdown, no explanation, 
no extra text. If you cannot complete all cards due to length, still close the JSON array properly.`;

    const prompt = `Generate exactly ${count} flashcards from the following study material for the course "${courseName}".

STUDY MATERIAL:
${truncate(content, 6000)}

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
    const cards = parseJSON(raw);

    if (!cards || !cards.length) {
      console.error("Failed to parse flashcards. Raw:", raw.slice(0, 500));
      return res.status(500).json({ error: "Could not generate flashcards — try again", raw: raw.slice(0, 300) });
    }

    res.json({ cards, count: cards.length });
  } catch (err) {
    console.error("Flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quiz — Generate mixed MCQ + theory quiz ─────────────────────────
//    Body: { courseName, content, mcqCount?, theoryCount? }
app.post("/api/quiz", async (req, res) => {
  try {
    const { courseName = "Course", content, mcqCount = 5, theoryCount = 4 } = req.body;
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
      console.error("Failed to parse quiz. Raw:", raw.slice(0, 500));
      return res.status(500).json({ error: "Could not generate quiz — try again", raw: raw.slice(0, 300) });
    }

    // Validate structure
    const valid = questions.filter(q =>
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

// ── POST /api/plan — Generate day-by-day study timetable ──────────────────────
//    Body: { courses: [{name, content, fileNames}], examWeeks, hoursPerDay }
app.post("/api/plan", async (req, res) => {
  try {
    const { courses, examWeeks = 4, hoursPerDay = 2 } = req.body;
    if (!courses || !courses.length) return res.status(400).json({ error: "courses is required" });

    const today = new Date();
    const examDate = new Date(today);
    examDate.setDate(today.getDate() + examWeeks * 7);

    // Leave last week for revision
    const studyDays = examWeeks * 7 - 7;
    const totalStudyHours = studyDays * hoursPerDay;
    const hoursPerCourse = Math.floor(totalStudyHours / courses.length);

    const courseInfo = courses.map(c => {
      const preview = c.content ? truncate(c.content, 1500) : `Files: ${(c.fileNames || []).join(", ")}`;
      return `Course: ${c.name}\nContent preview:\n${preview}`;
    }).join("\n\n---\n\n");

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
      console.error("Failed to parse plan. Raw:", raw.slice(0, 500));
      return res.status(500).json({ error: "Could not generate timetable — try again" });
    }

    // Add IDs and sort by date
    const withIds = plan
      .filter(p => p.date && p.course && p.topic)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p, i) => ({ ...p, id: "p" + i, done: false }));

    res.json({ plan: withIds, count: withIds.length });
  } catch (err) {
    console.error("Plan error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/grade — AI grade theory answers (Claude only) ───────────────────
//    Body: { answers: [{q, modelAnswer, marks, studentAnswer}] }
app.post("/api/grade", async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers || !answers.length) return res.status(400).json({ error: "answers is required" });

    const prompt = `Grade the following student theory answers strictly and fairly.

${answers.map((a, i) => `
QUESTION ${i + 1} (${a.marks || 5} marks):
${a.q}

MODEL ANSWER:
${a.modelAnswer}

STUDENT'S ANSWER:
${a.studentAnswer || "(No answer provided)"}
`).join("\n---\n")}

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

    const raw = await claude(prompt, "You are a strict but fair academic marker. Return only valid JSON arrays.");
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

// ── POST /api/youtube — Generate flashcards from YouTube video topic ───────────
//    Body: { url, topic? }
app.post("/api/youtube", async (req, res) => {
  try {
    const { url, topic = "" } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    // Extract video ID for context
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || "";

    const system = `You are a study assistant. Generate high-quality educational flashcards 
based on the topic of a YouTube video. Return ONLY valid JSON arrays.`;

    const prompt = `Generate 8 comprehensive flashcards based on this YouTube educational video.

Video URL: ${url}
${topic ? `Topic hint: ${topic}` : ""}
Video ID: ${videoId}

Based on what this video is likely about (use your knowledge of the topic area), create:
- 3 definition/concept cards
- 3 explanation/how-it-works cards  
- 2 application/example cards

Each answer must be detailed (3-5 sentences). Cover the core educational content of this topic.

Return ONLY this JSON array:
[{"q": "question", "a": "detailed answer", "course": "From YouTube"}]`;

    const raw = await groq(prompt, system, 3000);
    const cards = parseJSON(raw);

    if (!cards || !cards.length) {
      return res.status(500).json({ error: "Could not generate cards from video — try again" });
    }

    res.json({ cards, count: cards.length });
  } catch (err) {
    console.error("YouTube error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StudyForge API running on port ${PORT}`);
  console.log(`Groq key: ${process.env.GROQ_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`Claude key: ${process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ MISSING"}`);
});
