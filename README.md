# StudyForge Backend

AI backend for StudyForge. Uses **Groq (free)** for most tasks and **Claude Haiku** only for theory grading.

---

## API Endpoints

### `POST /api/extract`
Extract text from uploaded PDF/text files.
- **Request:** `multipart/form-data` with `files[]`
- **Response:** `{ files: [{ name, path, text, size }] }`

### `POST /api/flashcards`
Generate 25 flashcards from course content.
- **Body:** `{ courseName, content, count? }`
- **Response:** `{ cards: [{ q, a, course }], count }`

### `POST /api/quiz`
Generate mixed MCQ + theory quiz.
- **Body:** `{ courseName, content, mcqCount?, theoryCount? }`
- **Response:** `{ questions: [...], count }`

### `POST /api/plan`
Generate day-by-day study timetable.
- **Body:** `{ courses: [{ name, content, fileNames }], examWeeks, hoursPerDay }`
- **Response:** `{ plan: [{ id, date, course, topic, pages, duration, type, done }], count }`

### `POST /api/grade`
AI-grade student theory answers (uses Claude).
- **Body:** `{ answers: [{ q, modelAnswer, marks, studentAnswer }] }`
- **Response:** `{ grades: [{ score, feedback }] }`

### `POST /api/youtube`
Generate flashcards from a YouTube video URL.
- **Body:** `{ url, topic? }`
- **Response:** `{ cards: [{ q, a, course }], count }`

---

## Deploy to Render (Free)

1. Push this folder to a **GitHub repository**
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — click **Deploy**
5. In the Render dashboard → Environment → Add:
   - `GROQ_API_KEY` → your key from [console.groq.com](https://console.groq.com)
   - `ANTHROPIC_API_KEY` → your Claude API key
6. Your backend URL will be: `https://studyforge-backend.onrender.com`

---

## Get Your Free Groq Key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free, no credit card)
3. Click **API Keys** → Create Key
4. Free tier: 14,400 requests/day — more than enough for studying

---

## Connecting to Your React Frontend

Set your backend URL as an environment variable in your React app:

```env
VITE_API_URL=https://your-app-name.onrender.com
```

Then call it like:
```js
const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Example: generate flashcards
const res = await fetch(`${API}/api/flashcards`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ courseName: "COSC101", content: fileText })
});
const { cards } = await res.json();

// Example: upload PDF and extract text
const formData = new FormData();
formData.append("files", pdfFile);
const res = await fetch(`${API}/api/extract`, { method: "POST", body: formData });
const { files } = await res.json();
```

---

## Local Development

```bash
npm install
cp .env.example .env
# Fill in your keys in .env
npm run dev
```
