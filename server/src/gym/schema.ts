export const gymSchema = `
CREATE TABLE IF NOT EXISTS gym_schedule(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),plan_id TEXT NOT NULL,routine_id TEXT NOT NULL,original_date TEXT NOT NULL,target_date TEXT,kind TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,UNIQUE(user_id,plan_id,routine_id,original_date));
CREATE TABLE IF NOT EXISTS gym_import_batches(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),fingerprint TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,fingerprint));
CREATE TABLE IF NOT EXISTS gym_restore_items(user_id INTEGER NOT NULL REFERENCES users(id),fingerprint TEXT NOT NULL,target_id TEXT,PRIMARY KEY(user_id,fingerprint));
CREATE TABLE IF NOT EXISTS gym_exercises(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gym_favorites(user_id INTEGER NOT NULL REFERENCES users(id),exercise_id TEXT NOT NULL,PRIMARY KEY(user_id,exercise_id));
CREATE TABLE IF NOT EXISTS gym_plans(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gym_workouts(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),sport_session_id TEXT UNIQUE REFERENCES sport_sessions(id),plan_id TEXT,snapshot TEXT NOT NULL,phase TEXT NOT NULL DEFAULT 'ready',cursor INTEGER NOT NULL DEFAULT 0,rest_until TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,import_key TEXT);
CREATE INDEX IF NOT EXISTS gym_workouts_owner ON gym_workouts(user_id,created_at);
CREATE TABLE IF NOT EXISTS gym_sets(id TEXT PRIMARY KEY,workout_id TEXT NOT NULL REFERENCES gym_workouts(id),position INTEGER NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reps INTEGER NOT NULL DEFAULT 0,load_g INTEGER NOT NULL DEFAULT 0,seconds INTEGER NOT NULL DEFAULT 0,input_mode TEXT NOT NULL DEFAULT 'manual',score TEXT NOT NULL DEFAULT '{}',UNIQUE(workout_id,position));
CREATE TABLE IF NOT EXISTS gym_operations(workout_id TEXT NOT NULL REFERENCES gym_workouts(id),operation_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workout_id,operation_id));
CREATE TABLE IF NOT EXISTS gym_measurements(user_id INTEGER NOT NULL REFERENCES users(id),date TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,date));
CREATE TABLE IF NOT EXISTS gym_settings(user_id INTEGER PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS gym_imports(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,fingerprint));
CREATE UNIQUE INDEX IF NOT EXISTS gym_import_records ON gym_workouts(user_id,import_key) WHERE import_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS gym_game_plans(game_id INTEGER PRIMARY KEY REFERENCES games(id),snapshot TEXT NOT NULL);
`;
