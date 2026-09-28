const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
require("dotenv").config();

const authRoutes = require("./routes/auth.js");
const messageRoutes = require("./routes/messages.js");
const db = require("./config/db.js");
const { generateCode, sendVerificationCode } = require("./services/emailService.js");

const app = express();

// Criar pasta uploads se não existir
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Pasta uploads criada:", uploadDir);
}

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

// Rotas principais
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

/* =========================
   ROTAS DE USUÁRIOS
========================= */

app.get("/api/users", async (req, res) => {
  try {
    const [users] = await db.execute(
      "SELECT id, username, email, photo FROM users WHERE username != 'teste_direto'"
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const [users] = await db.execute(
      "SELECT id, username, email, photo FROM users WHERE id = ?",
      [req.params.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/users/photo", upload.single('photo'), async (req, res) => {
  try {
    let photoUrl = null;
    const { user_id } = req.body;
    if (req.file) {
      photoUrl = `http://localhost:3000/uploads/${req.file.filename}`;
      await db.execute("UPDATE users SET photo = ? WHERE id = ?", [photoUrl, user_id]);
    }
    res.json({ message: "Foto atualizada com sucesso", photo: photoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/users/photo", async (req, res) => {
  try {
    const { user_id } = req.body;
    await db.execute("UPDATE users SET photo = NULL WHERE id = ?", [user_id]);
    res.json({ message: "Foto removida com sucesso" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   ROTAS DE VERIFICAÇÃO POR EMAIL
========================= */

app.post("/api/auth/send-verification", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email é obrigatório" });
    }
    
    const [existingUsers] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "Email já cadastrado no sistema" });
    }
    
    const code = generateCode();
    
    await db.execute(
      "INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, 'verification', DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
      [email, code]
    );
    
    await sendVerificationCode(email, code, 'verification');
    
    res.json({ message: "Código de verificação enviado para seu email" });
  } catch (error) {
    console.error("Erro ao enviar código:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ message: "Email e código são obrigatórios" });
    }
    
    const [codes] = await db.execute(
      "SELECT * FROM verification_codes WHERE email = ? AND code = ? AND type = 'verification' AND used = FALSE AND expires_at > NOW()",
      [email, code]
    );
    
    if (codes.length === 0) {
      return res.status(400).json({ message: "Código inválido ou expirado" });
    }
    
    await db.execute("UPDATE verification_codes SET used = TRUE WHERE id = ?", [codes[0].id]);
    
    res.json({ message: "Código verificado com sucesso" });
  } catch (error) {
    console.error("Erro ao verificar código:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/send-reset-code", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email é obrigatório" });
    }
    
    const [existingUsers] = await db.execute(
      "SELECT id, username FROM users WHERE email = ?",
      [email]
    );
    
    if (existingUsers.length === 0) {
      return res.status(404).json({ message: "Email não encontrado no sistema" });
    }
    
    const code = generateCode();
    
    await db.execute(
      "INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, 'reset', DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
      [email, code]
    );
    
    await sendVerificationCode(email, code, 'reset');
    
    res.json({ 
      message: "Código de recuperação enviado para seu email",
      user: { id: existingUsers[0].id, email: email, username: existingUsers[0].username }
    });
  } catch (error) {
    console.error("Erro ao enviar código de recuperação:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/verify-reset-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ message: "Email e código são obrigatórios" });
    }
    
    const [codes] = await db.execute(
      "SELECT * FROM verification_codes WHERE email = ? AND code = ? AND type = 'reset' AND used = FALSE AND expires_at > NOW()",
      [email, code]
    );
    
    if (codes.length === 0) {
      return res.status(400).json({ message: "Código inválido ou expirado" });
    }
    
    await db.execute("UPDATE verification_codes SET used = TRUE WHERE id = ?", [codes[0].id]);
    
    res.json({ message: "Código verificado com sucesso" });
  } catch (error) {
    console.error("Erro ao verificar código:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/reset-password-with-code", async (req, res) => {
  try {
    const { email, newPassword, code } = req.body;
    
    if (!email || !newPassword || !code) {
      return res.status(400).json({ message: "Todos os campos são obrigatórios" });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "A senha deve ter pelo menos 6 caracteres" });
    }
    
    const [codes] = await db.execute(
      "SELECT * FROM verification_codes WHERE email = ? AND code = ? AND type = 'reset' AND used = TRUE",
      [email, code]
    );
    
    if (codes.length === 0) {
      return res.status(400).json({ message: "Código não verificado. Solicite um novo código." });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const [result] = await db.execute(
      "UPDATE users SET password = ? WHERE email = ?",
      [hashedPassword, email]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    
    res.json({ message: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   APAGAR CONTA
========================= */

app.delete("/api/auth/delete-account", async (req, res) => {
  try {
    const { userId, password } = req.body;
    
    if (!userId || !password) {
      return res.status(400).json({ message: "ID do usuário e senha são obrigatórios" });
    }
    
    // Buscar usuário
    const [users] = await db.execute("SELECT * FROM users WHERE id = ?", [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    
    const user = users[0];
    
    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ message: "Senha incorreta" });
    }
    
    // Apagar todas as mensagens do usuário (como remetente ou destinatário)
    await db.execute("DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?", [userId, userId]);
    
    // Apagar membros de grupos
    await db.execute("DELETE FROM group_members WHERE user_id = ?", [userId]);
    
    // Apagar grupos criados pelo usuário
    await db.execute("DELETE FROM groups_chat WHERE created_by = ?", [userId]);
    
    // Apagar códigos de verificação
    await db.execute("DELETE FROM verification_codes WHERE email = ?", [user.email]);
    
    // Apagar foto do usuário se existir
    if (user.photo) {
      const photoPath = path.join(__dirname, "uploads", path.basename(user.photo));
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }
    
    // Apagar o usuário
    await db.execute("DELETE FROM users WHERE id = ?", [userId]);
    
    console.log(`🗑️ Usuário ${user.username} (${user.email}) apagou a conta`);
    
    res.json({ message: "Conta apagada com sucesso" });
  } catch (error) {
    console.error("Erro ao apagar conta:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   ROTAS DE MENSAGENS PRIVADAS
========================= */

app.get("/api/messages/:user1/:user2", async (req, res) => {
  try {
    const [messages] = await db.execute(`
      SELECT m.*, u1.username as sender_name 
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY m.created_at ASC
    `, [req.params.user1, req.params.user2, req.params.user2, req.params.user1]);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const { sender_id, receiver_id, message, file_url, file_type } = req.body;
    console.log(`📨 Mensagem: ${sender_id} -> ${receiver_id}: ${message}`);
    
    const [result] = await db.execute(`
      INSERT INTO messages (sender_id, receiver_id, message, file_url, file_type)
      VALUES (?, ?, ?, ?, ?)
    `, [sender_id, receiver_id, message, file_url || null, file_type || null]);
    
    const [newMessage] = await db.execute(`
      SELECT m.*, u.username as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `, [result.insertId]);
    
    const room1 = `user_${sender_id}_${receiver_id}`;
    const room2 = `user_${receiver_id}_${sender_id}`;
    
    console.log(`📡 Tentando emitir para salas: ${room1} e ${room2}`);
    
    if (global.io) {
      global.io.to(room1).emit("nova_mensagem", newMessage[0]);
      global.io.to(room2).emit("nova_mensagem", newMessage[0]);
      console.log(`✅ Mensagem emitida via Socket.io!`);
    } else {
      console.log(`❌ Socket.io não está disponível!`);
    }
    
    res.json(newMessage[0]);
  } catch (error) {
    console.error("Erro:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   ROTAS DE GRUPOS
========================= */

app.get("/api/users/:userId/groups", async (req, res) => {
  try {
    const [groups] = await db.execute(`
      SELECT g.*, 
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as total_members
      FROM groups_chat g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `, [req.params.userId]);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/groups", async (req, res) => {
  try {
    const { name, photo, members, created_by } = req.body;
    const [result] = await db.execute(
      "INSERT INTO groups_chat (name, photo, created_by) VALUES (?, ?, ?)",
      [name, photo || null, created_by]
    );
    const groupId = result.insertId;
    
    for (const memberId of members) {
      await db.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", [groupId, memberId]);
    }
    
    const [groupMembers] = await db.execute(`
      SELECT u.id, u.username, u.email, u.photo 
      FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ?
    `, [groupId]);
    
    res.json({ id: groupId, name, members: groupMembers, total_members: groupMembers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/groups/:groupId", async (req, res) => {
  try {
    const [members] = await db.execute(`
      SELECT u.id, u.username, u.email, u.photo 
      FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ?
    `, [req.params.groupId]);
    res.json({ members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/groups/:groupId/members", async (req, res) => {
  try {
    const { user_id } = req.body;
    await db.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", [req.params.groupId, user_id]);
    res.json({ message: "Membro adicionado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/groups/:groupId/members/:userId", async (req, res) => {
  try {
    await db.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", [req.params.groupId, req.params.userId]);
    res.json({ message: "Membro removido" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/groups/:groupId/leave", async (req, res) => {
  try {
    const { user_id } = req.body;
    await db.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", [req.params.groupId, user_id]);
    res.json({ message: "Saiu do grupo" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/groups/:groupId", async (req, res) => {
  try {
    await db.execute("DELETE FROM group_members WHERE group_id = ?", [req.params.groupId]);
    await db.execute("DELETE FROM messages WHERE group_id = ?", [req.params.groupId]);
    await db.execute("DELETE FROM groups_chat WHERE id = ?", [req.params.groupId]);
    res.json({ message: "Grupo deletado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/groups/:groupId/photo", async (req, res) => {
  try {
    const { photo } = req.body;
    await db.execute("UPDATE groups_chat SET photo = ? WHERE id = ?", [photo || null, req.params.groupId]);
    res.json({ message: "Foto atualizada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/groups/:groupId/messages", async (req, res) => {
  try {
    const { sender_id, message, file_url, file_type } = req.body;
    const [result] = await db.execute(`
      INSERT INTO messages (sender_id, group_id, message, file_url, file_type)
      VALUES (?, ?, ?, ?, ?)
    `, [sender_id, req.params.groupId, message, file_url || null, file_type || null]);
    
    const [newMessage] = await db.execute(`
      SELECT m.*, u.username as sender_name
      FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
    `, [result.insertId]);
    
    if (global.io) {
      global.io.to(`group_${req.params.groupId}`).emit("nova_mensagem_grupo", newMessage[0]);
      console.log(`👥 Mensagem emitida para grupo: ${req.params.groupId}`);
    }
    
    res.json(newMessage[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/groups/:groupId/messages", async (req, res) => {
  try {
    const [messages] = await db.execute(`
      SELECT m.*, u.username as sender_name
      FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.group_id = ? ORDER BY m.created_at ASC
    `, [req.params.groupId]);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/messages/:messageId", async (req, res) => {
  try {
    await db.execute("DELETE FROM messages WHERE id = ?", [req.params.messageId]);
    res.json({ message: "Mensagem deletada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/messages/conversation/:user1/:user2", async (req, res) => {
  try {
    await db.execute(`
      DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `, [req.params.user1, req.params.user2, req.params.user2, req.params.user1]);
    res.json({ message: "Conversa deletada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   ROTA DE UPLOAD
========================= */

app.post("/api/upload", upload.single('file'), async (req, res) => {
  try {
    const { sender_id, receiver_id, group_id } = req.body;
    const fileUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    const fileType = req.file.mimetype;
    const fileName = req.file.originalname;
    const messageText = `📎 ${fileName}`;
    
    let result;
    if (group_id && group_id !== 'undefined' && group_id !== 'null') {
      result = await db.execute(`
        INSERT INTO messages (sender_id, group_id, message, file_url, file_type, file_name) 
        VALUES (?, ?, ?, ?, ?, ?)
      `, [sender_id, group_id, messageText, fileUrl, fileType, fileName]);
      
      const [newMessage] = await db.execute(`
        SELECT m.*, u.username as sender_name FROM messages m
        JOIN users u ON m.sender_id = u.id WHERE m.id = ?
      `, [result[0].insertId]);
      
      if (global.io) {
        global.io.to(`group_${group_id}`).emit("nova_mensagem_grupo", newMessage[0]);
      }
    } else {
      result = await db.execute(`
        INSERT INTO messages (sender_id, receiver_id, message, file_url, file_type, file_name) 
        VALUES (?, ?, ?, ?, ?, ?)
      `, [sender_id, receiver_id, messageText, fileUrl, fileType, fileName]);
      
      const [newMessage] = await db.execute(`
        SELECT m.*, u.username as sender_name FROM messages m
        JOIN users u ON m.sender_id = u.id WHERE m.id = ?
      `, [result[0].insertId]);
      
      const room1 = `user_${sender_id}_${receiver_id}`;
      const room2 = `user_${receiver_id}_${sender_id}`;
      
      if (global.io) {
        global.io.to(room1).emit("nova_mensagem", newMessage[0]);
        global.io.to(room2).emit("nova_mensagem", newMessage[0]);
      }
    }
    
    res.json({ success: true, fileUrl });
  } catch (error) {
    console.error("Erro no upload:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   SOCKET.IO - COM LOGS DETALHADOS
========================= */

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

global.io = io;

io.on("connection", (socket) => {
  console.log("🟢 Usuário conectado:", socket.id);

  socket.on("joinRoom", (room) => {
    socket.join(room);
    console.log(`📌 Usuário ${socket.id} entrou na sala: ${room}`);
    console.log(`📌 Salas atuais do usuário:`, Array.from(socket.rooms));
  });

  socket.on("joinGroup", (groupId) => {
    const room = `group_${groupId}`;
    socket.join(room);
    console.log(`👥 Usuário ${socket.id} entrou no grupo: ${room}`);
    console.log(`👥 Salas atuais do usuário:`, Array.from(socket.rooms));
  });

  socket.on("leaveRoom", (room) => {
    socket.leave(room);
    console.log(`📌 Usuário ${socket.id} saiu da sala: ${room}`);
  });

  // Receber mensagem do cliente e reenviar
  socket.on("nova_mensagem", (message) => {
    console.log("📨 Mensagem recebida do cliente:", message);
    const room1 = `user_${message.sender_id}_${message.receiver_id}`;
    const room2 = `user_${message.receiver_id}_${message.sender_id}`;
    socket.to(room1).emit("nova_mensagem", message);
    socket.to(room2).emit("nova_mensagem", message);
    console.log(`📡 Reenviando para salas: ${room1} e ${room2}`);
  });

  socket.on("nova_mensagem_grupo", (message) => {
    console.log("👥 Mensagem de grupo recebida do cliente:", message);
    socket.to(`group_${message.group_id}`).emit("nova_mensagem_grupo", message);
    console.log(`👥 Reenviando para grupo: group_${message.group_id}`);
  });

  socket.on("delete_message", (data) => {
    console.log("🗑️ Mensagem apagada:", data);
    socket.to(`user_${data.sender_id}_${data.receiver_id}`).emit("delete_message", data);
    socket.to(`user_${data.receiver_id}_${data.sender_id}`).emit("delete_message", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Usuário desconectado:", socket.id);
  });
});

/* =========================
   INICIAR SERVIDOR
========================= */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API disponível em http://localhost:${PORT}/api`);
  console.log(`📁 Uploads disponíveis em http://localhost:${PORT}/uploads`);
  console.log(`💬 Socket.io ativo\n`);
});