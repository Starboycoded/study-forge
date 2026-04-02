-- StudyForge Database Schema
-- Run this once to set up your database tables.
-- Compatible with PostgreSQL 13+

-- ── Sessions Table ────────────────────────────────────────────────────────────
-- Stores generated flashcard sets, quizzes, and study plans for each user.
CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  user_id      VARCHAR(255) NOT NULL,         -- Your auth system's user ID
  type         VARCHAR(50)  NOT NULL,          -- 'flashcards' | 'quiz' | 'plan'
  course_name  VARCHAR(255),                   -- Optional course name
  data         JSONB        NOT NULL,          -- Full generated content
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Index for fast user session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_type ON sessions(user_id, type);

-- ── Progress Table ────────────────────────────────────────────────────────────
-- Tracks which study plan sessions a user has marked as done.
CREATE TABLE IF NOT EXISTS progress (
  id           SERIAL PRIMARY KEY,
  user_id      VARCHAR(255) NOT NULL,
  plan_id      VARCHAR(255) NOT NULL,          -- References a session id (study plan)
  session_id   VARCHAR(255) NOT NULL,          -- The individual day/session ID (e.g. "p0", "p1")
  done         BOOLEAN      DEFAULT FALSE,
  updated_at   TIMESTAMPTZ  DEFAULT NOW(),

  -- Prevent duplicate entries per user+plan+session
  UNIQUE (user_id, plan_id, session_id)
);

-- Index for fast progress lookups
CREATE INDEX IF NOT EXISTS idx_progress_user_plan ON progress(user_id, plan_id);
