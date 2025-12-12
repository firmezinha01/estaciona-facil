import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// Necessário para usar __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= ESC/POS HELPERS =================

function escposInit() {
  return "\x1B\x40"; // Initialize
}

function escposAlignCenter() {
  return "\x1B\x61\x01";
}

function escposAlignLeft() {
  return "\x1B\x61\x00";
}

function escposBoldOn() {
  return "\x1B\x45\x01";
}

function escposBoldOff() {
  return "\x1B\x45\x00";
}

function escposDoubleSizeOn() {
  return "\x1D\x21\x11"; // width x2, height x2
}

function escposDoubleSizeOff() {
  return "\x1D\x21\x00";
}

function escposNewLines(n = 1) {
  return "\n".repeat(n);
}

function escposCut() {
  return "\x1D\x56\x41\x10"; // Partial cut
}

// QR Code ESC/POS (versão simples)
function escposQrCode(data) {
  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;

  const bytes = [];

  // Select model: 2
  bytes.push(0x1D,0x28,0x6B,0x04,0x00,0x31,0x41,0x32,0x00);
  // Size
  bytes.push(0x1D,0x28,0x6B,0x03,0x00,0x31,0x43,0x04);
  // Error level M
  bytes.push(0x1D,0x28,0x6B,0x03,0x00,0x31,0x45,0x31);
  // Store data
  bytes.push(0x1D,0x28,0x6B,pL,pH,0x31,0x50,0x30);
  for (let i = 0; i < data.length; i++) {
    bytes.push(data.charCodeAt(i));
  }
  // Print
  bytes.push(0x1D,0x28,0x6B,0x03,0x00,0x31,0x51,0x30);

  return Buffer.from(bytes).toString("binary");
}

// ================= GERADOR ESC/POS DO TICKET =================
function gerarEscPosTicket(ticket) {
  let escpos = "";
  escpos += escposInit();

  // Reduz espaçamento vertical geral
  escpos += "\x1B\x33\x08"; // espaçamento compacto

  // Cabeçalho
  escpos += escposAlignCenter();
  escpos += escposBoldOn();
  escpos += "=====================\n";
  escpos += "   ESTACIONA FACIL\n";
  escpos += "=====================\n";
  escpos += escposBoldOff();

  // Título
  escpos += escposAlignCenter();
  escpos += escposBoldOn();
  escpos += "COMPROVANTE DE ESTACIONAMENTO\n";
  escpos += escposBoldOff();
  escpos += "--------------------------------------\n";

  // Dados principais
  escpos += escposAlignCenter();
  escpos += `Ticket: ${ticket.id}\n`;
  escpos += `Placa: ${ticket.plate}\n`;
  escpos += `Vaga: ${ticket.slot}\n`;
  escpos += `Entrada: ${ticket.start}\n`;
  escpos += `Saida:   ${ticket.end}\n`;
  escpos += "--------------------------------------\n";

  // Total e pagamento
  escpos += escposBoldOn();
  escpos += `TOTAL: R$ ${ticket.total.toFixed(2)}\n`;
  escpos += escposBoldOff();
  escpos += `Pagamento: ${ticket.method}\n`;
  escpos += "--------------------------------------\n";

  // PIX QR Code
  if (ticket.method === "PIX" && ticket.pixPayload) {
    escpos += escposAlignCenter();
    escpos += "PAGAMENTO VIA PIX\n";
    escpos += "Escaneie o QR Code abaixo:\n";
    escpos += escposQrCode(ticket.pixPayload);
  }

  // Rodapé
  escpos += escposAlignCenter();
  escpos += "Obrigado pela preferencia!\n";
  escpos += "Guarde este comprovante.\n";

  // Espaço final reduzido
  escpos += "\n\n";

  escpos += escposCut();
  return escpos;
}

// ================= ENDPOINT ESC/POS =================

app.post("/gerar-ticket-escpos", (req, res) => {
  try {
    const ticket = req.body;
    const escpos = gerarEscPosTicket(ticket);
    res.setHeader("Content-Type", "text/plain; charset=binary");
    res.send(escpos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Erro ao gerar ESC/POS" });
  }
});

// ================= PIX =================

app.post("/gerar-pix", (req, res) => {
  const paymentId = "PIX-" + Date.now();
  const valor = req.body.total || "0.00";

  const chave = "chavepix123";
  const payload = `${chave}|valor=${valor}|pid=${paymentId}`;

  res.json({
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}`,
    qrText: payload,
    paymentId,
    pixPayload: payload
  });
});

// ================= PORTA RENDER =================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
