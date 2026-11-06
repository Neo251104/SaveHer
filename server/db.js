'use strict';
// SQLite via Node's built-in node:sqlite (no native dependencies). Set DB_PATH to persist elsewhere.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
      pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, sos_message TEXT,
      community INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contacts(
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, phone TEXT NOT NULL, relationship TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(
      id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category TEXT NOT NULL, details TEXT, lat REAL NOT NULL, lng REAL NOT NULL, cell TEXT NOT NULL,
      photo TEXT, verified INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS reports_cell_time ON reports(cell, created_at);
    CREATE TABLE IF NOT EXISTS tracks(
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, last_lat REAL, last_lng REAL, last_acc REAL, last_at INTEGER);
    CREATE TABLE IF NOT EXISTS track_points(
      id INTEGER PRIMARY KEY, token TEXT NOT NULL REFERENCES tracks(token) ON DELETE CASCADE,
      lat REAL NOT NULL, lng REAL NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sos_events(
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL, lat REAL, lng REAL, status TEXT NOT NULL DEFAULT 'active',
      notified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts(
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS post_flags(
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(post_id, user_id));
    CREATE TABLE IF NOT EXISTS place_names(cell TEXT PRIMARY KEY, name TEXT, fetched_at INTEGER NOT NULL);
  `);
  return db;
}
module.exports = { open };
