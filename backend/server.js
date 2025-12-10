import express from "express";
import fs from "fs";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

// Necessário para usar __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função para gerar PDF no formato da POS58
function gerarPDF(ticket, filename) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({
      size: [160, 200], // largura 58mm
      margins: { top: 10, left: 10, right: 10, bottom: 10 }
    });

    const stream = fs.createWriteStream(filename);
    doc.pipe(stream);

    const formatarDataHora = (valor) => {
      const [data, hora] = valor.split(" ");
      return { data, hora };
    };

    const entrada = formatarDataHora(ticket.start);
    const saida = formatarDataHora(ticket.end);

    doc.fontSize(14).text("= EstacionaFácil =", { align: "center" });
    doc.fontSize(12).text(`Ticket: ${ticket.id}`);
    doc.text(`Placa: ${ticket.plate}`);
    doc.text(`Vaga: ${ticket.slot}`);
    doc.text(`Entrada: ${entrada.data}`);
    doc.text(`Horário Entrada: ${entrada.hora}`);
    doc.text(`Saída: ${saida.data}`);
    doc.text(`Horário Saída: ${saida.hora}`);
    doc.text(`Total: R$ ${ticket.total}`);
    doc.text(`Pagamento: ${ticket.method}`);
    doc.moveDown(0.5);
    doc.fontSize(10).text("Obrigado pela preferência!", { align: "center" });

    doc.end();
    stream.on("finish", () => resolve(filename));
  });
}

// ✅ Endpoint para gerar PDF e enviar ao celular
app.post("/gerar-ticket", async (req, res) => {
  try {
    const ticket = req.body;

    const filename = path.join(__dirname, `ticket-${Date.now()}.pdf`);
    await gerarPDF(ticket, filename);

    res.download(filename, "ticket.pdf", () => {
      fs.unlinkSync(filename);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Falha ao gerar ticket." });
  }
});

// ✅ PIX
app.post("/gerar-pix", (req, res) => {
  const paymentId = "PIX-" + Date.now();
  const valor = req.body.total || "0.00";
  const chave = "chavepix123";
  const payload = `${chave}|valor=${valor}`;

  res.json({
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}`,
    qrText: payload,
    paymentId
  });
});

// ✅ Porta dinâmica para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
