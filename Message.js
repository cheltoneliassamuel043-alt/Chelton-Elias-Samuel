const db = require("../config/db.js");

class Message {
  static async create(data) {
    const { sender_id, receiver_id, group_id, message, file_url, file_type, file_name } = data;

    let sql, params;
    
    if (group_id) {
      sql = `
        INSERT INTO messages (sender_id, group_id, message, file_url, file_type, file_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      params = [sender_id, group_id, message || null, file_url || null, file_type || null, file_name || null];
    } else {
      sql = `
        INSERT INTO messages (sender_id, receiver_id, message, file_url, file_type, file_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      params = [sender_id, receiver_id, message || null, file_url || null, file_type || null, file_name || null];
    }

    const [result] = await db.execute(sql, params);
    return result;
  }

  static async getConversation(user1, user2) {
    const sql = `
      SELECT m.*, u.username as sender_name 
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (sender_id = ? AND receiver_id = ?)
      OR (sender_id = ? AND receiver_id = ?)
      ORDER BY m.created_at ASC
    `;
    const [rows] = await db.execute(sql, [user1, user2, user2, user1]);
    return rows;
  }

  static async getGroupMessages(groupId) {
    const sql = `
      SELECT m.*, u.username as sender_name
      FROM messages m 
      JOIN users u ON m.sender_id = u.id
      WHERE m.group_id = ? 
      ORDER BY m.created_at ASC
    `;
    const [rows] = await db.execute(sql, [groupId]);
    return rows;
  }

  static async deleteMessage(messageId) {
    const sql = 'DELETE FROM messages WHERE id = ?';
    const [result] = await db.execute(sql, [messageId]);
    return result;
  }

  static async deleteConversation(user1, user2) {
    const sql = `
      DELETE FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
      OR (sender_id = ? AND receiver_id = ?)
    `;
    const [result] = await db.execute(sql, [user1, user2, user2, user1]);
    return result;
  }
}

module.exports = Message;