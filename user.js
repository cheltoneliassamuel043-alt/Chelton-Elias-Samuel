const db = require('../config/db.js');

class User {
  static async create({ username, email, password, photo = null }) {
    const query = 'INSERT INTO users (username, email, password, photo) VALUES (?, ?, ?, ?)';
    const [result] = await db.execute(query, [username, email, password, photo]);
    return { id: result.insertId, username, email, photo };
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = ?';
    const [rows] = await db.execute(query, [email]);
    return rows[0] || null;
  }

  static async findById(id) {
    const query = 'SELECT id, username, email, photo FROM users WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  static async getAll() {
    const query = 'SELECT id, username, email, photo FROM users';
    const [rows] = await db.execute(query);
    return rows;
  }

  static async updatePhoto(id, photo) {
    const query = 'UPDATE users SET photo = ? WHERE id = ?';
    const [result] = await db.execute(query, [photo, id]);
    return result;
  }

  static async updatePassword(email, hashedPassword) {
    const query = 'UPDATE users SET password = ? WHERE email = ?';
    const [result] = await db.execute(query, [hashedPassword, email]);
    return result;
  }
}

module.exports = User;