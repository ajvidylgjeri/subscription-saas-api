CREATE DATABASE IF NOT EXISTS saas_db;
USE saas_db;

CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  price DECIMAL(8,2) NOT NULL,
  level TINYINT NOT NULL,              -- 0 = free, 1 = basic, 2 = premium (used for access control)
  features JSON NOT NULL
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,      -- bcrypt hash
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  current_plan_id INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_plan_id) REFERENCES plans(id)
);

CREATE TABLE subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  status ENUM('active','cancelled','expired') NOT NULL DEFAULT 'active',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  INDEX idx_user_status (user_id, status)
);

-- Plan id 1 MUST be the free plan (new users default to it).
INSERT INTO plans (id, name, price, level, features) VALUES
 (1, 'free',    0.00,  0, JSON_OBJECT('storage_gb', 1,   'access_level', 'limited', 'support', 'community')),
 (2, 'basic',   9.99,  1, JSON_OBJECT('storage_gb', 50,  'access_level', 'standard', 'support', 'email')),
 (3, 'premium', 19.99, 2, JSON_OBJECT('storage_gb', 500, 'access_level', 'full', 'support', 'priority'));
