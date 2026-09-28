CREATE DATABASE chat_app;

USE chat_app;

CREATE TABLE users (

  id INT AUTO_INCREMENT PRIMARY KEY,

  username VARCHAR(100) NOT NULL,

  email VARCHAR(150) UNIQUE NOT NULL,

  password VARCHAR(255) NOT NULL,

  photo TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE messages (

  id INT AUTO_INCREMENT PRIMARY KEY,

  sender_id INT NOT NULL,

  receiver_id INT,

  group_id INT,

  message TEXT,

  file_url TEXT,

  file_type VARCHAR(50),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sender_id)
  REFERENCES users(id)

);

CREATE TABLE groups_chat (

  id INT AUTO_INCREMENT PRIMARY KEY,

  name VARCHAR(100),

  photo TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE group_members (

  id INT AUTO_INCREMENT PRIMARY KEY,

  group_id INT,

  user_id INT,

  FOREIGN KEY (group_id)
  REFERENCES groups_chat(id),

  FOREIGN KEY (user_id)
  REFERENCES users(id)

);