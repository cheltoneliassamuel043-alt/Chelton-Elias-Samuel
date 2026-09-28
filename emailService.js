// services/emailService.js
const nodemailer = require('nodemailer');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationCode(email, code, type = 'verification') {
  // Configuração para envio real de email com Gmail
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'chattime842@gmail.com',
      pass: 'tvffuejyqpmkswpk'
    }
  });
  
  const subject = type === 'verification' ? 'Código de Verificação - ChatTime' : 'Recuperação de Senha - ChatTime';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 40px; margin: 0;">
      <div style="max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 20px; padding: 30px; text-align: center;">
        <h1 style="color: #3b82f6; margin-bottom: 20px;">💬 ChatTime</h1>
        <h2 style="color: white; margin-bottom: 30px;">${type === 'verification' ? 'Verifique seu email' : 'Recuperação de Senha'}</h2>
        <p style="color: #94a3b8; margin-bottom: 20px;">Use o código abaixo para ${type === 'verification' ? 'confirmar seu cadastro' : 'redefinir sua senha'}:</p>
        <div style="background: #0f172a; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <span style="font-size: 36px; font-weight: bold; color: #3b82f6; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 12px;">Este código expira em 10 minutos.</p>
        <hr style="border-color: #334155; margin: 20px 0;">
        <p style="color: #475569; font-size: 11px;">ChatTime - Sua plataforma de comunicação</p>
      </div>
    </body>
    </html>
  `;
  
  try {
    const info = await transporter.sendMail({
      from: '"ChatTime" <chattime842@gmail.com>',
      to: email,
      subject: subject,
      html: html
    });
    console.log(`✅ Email enviado com sucesso para ${email}`);
    console.log(`📧 Código: ${code}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error.message);
    console.log(`\n📧 CÓDIGO PARA ${email}: ${code}\n`);
    return false;
  }
}

module.exports = { generateCode, sendVerificationCode };