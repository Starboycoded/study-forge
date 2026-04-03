-- Users table
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        VARCHAR(255) UNIQUE NOT NULL,
  password     VARCHAR(255) NOT NULL,
  name         VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  course_name  VARCHAR(255),
  data         JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_type ON sessions(user_id, type);

-- Progress table
CREATE TABLE IF NOT EXISTS progress (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id      VARCHAR(255) NOT NULL,
  session_id   VARCHAR(255) NOT NULL,
  done         BOOLEAN DEFAULT FALSE,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user_plan ON progress(user_id, plan_id);
