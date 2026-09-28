const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

// Criar conexão com suporte a Promise
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chat_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testar conexão
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:', err.message);
  } else {
    console.log('Conectado ao MySQL com sucesso!');
    connection.release();
  }
});

// Exportar versão com Promise
const db = pool.promise();

module.exports = db;