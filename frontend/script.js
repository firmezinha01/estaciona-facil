// API do backend
const API = "https://estaciona-facil-l8lj.onrender.com";

// Estado da aplicação
const state = {
  tickets: [],
  history: [],
  seq: 1,
  lastReceipt: null,
  currentPayment: null
};

// Utilidades
const fmtBRL = v => (new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })).format(v);
const pad2 = n => String(n).padStart(2, '0');
const dtDisp = d => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
function diffMinutes(a, b) { return Math.max(0, Math.round((b - a) / 60000)); }

// Feedback
const $message = document.getElementById('message');
function showMessage(msg, type = "info") {
  if ($message) {
    $message.textContent = msg;
    $message.className = `muted ${type}`;
  }
}

// Relógio
function tickClock() {
  const now = new Date();
  const $clock = document.getElementById('clock');
  if ($clock) {
    $clock.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  }
  requestAnimationFrame(() => setTimeout(tickClock, 500));
}
tickClock();

// ELEMENTOS DO DOM
const $plate = document.getElementById('plate'),
  $slot = document.getElementById('slot'),
  $note = document.getElementById('note'),
  $startTime = document.getElementById('startTime'),
  $create = document.getElementById('createTicket'),
  $rateHour = document.getElementById('rateHour'),
  $activeList = document.getElementById('activeList'),
  $finishTicket = document.getElementById('finishTicket'),
  $endTime = document.getElementById('endTime'),
  $payMethod = document.getElementById('payMethod'),
  $calcArea = document.getElementById('calcArea'),
  $pixArea = document.getElementById('pixArea'),
  $cardArea = document.getElementById('cardArea'),
  $cashArea = document.getElementById('cashArea'),
  $confirmPayment = document.getElementById('confirmPayment'),
  $printReceipt = document.getElementById('printReceipt'),
  $cancelPayment = document.getElementById('cancelPayment'),
  $historyTableBody = document.querySelector('#historyTable tbody'),
  $cameraInput = document.getElementById('cameraInput');

// =============== OCR AUTOMÁTICO NO FLUXO 1 ===============

let ocrEmAndamento = false;

async function lerPlacaPorOCR() {
  return new Promise((resolve, reject) => {
    if (!$cameraInput) {
      reject(new Error("Câmera não disponível"));
      return;
    }

    const handler = async () => {
      $cameraInput.removeEventListener("change", handler);

      if (!$cameraInput.files || !$cameraInput.files.length) {
        reject(new Error("Nenhuma imagem capturada"));
        return;
      }

      const file = $cameraInput.files[0];
      const img = URL.createObjectURL(file);

      try {
        showMessage("Lendo placa pela câmera...", "info");

        const worker = await Tesseract.createWorker("eng", 1);
        const { data } = await worker.recognize(img);
        await worker.terminate();

        let text = data.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const match = text.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/);

        if (match) {
          const placa = match[0];
          resolve(placa);
        } else {
          reject(new Error("Não foi possível reconhecer a placa."));
        }
      } catch (err) {
        reject(err);
      }
    };

    $cameraInput.addEventListener("change", handler);
    $cameraInput.click();
  });
}

// =============== CRIAÇÃO DE TICKET ===============

async function createTicketComOCRSeNecessario() {
  try {
    let plate = ($plate.value || '').toUpperCase().trim();
    const slot = ($slot.value || '').toUpperCase().trim();

    if (!slot) {
      showMessage('Informe a vaga.', 'error');
      return;
    }

    // Fluxo 1: se placa estiver vazia, dispara OCR
    if (!plate) {
      if (ocrEmAndamento) {
        showMessage('Leitura de placa já em andamento.', 'info');
        return;
      }
      ocrEmAndamento = true;

      try {
        const placaLida = await lerPlacaPorOCR();
        plate = placaLida;
        $plate.value = placaLida;
        showMessage("Placa detectada: " + placaLida, "success");
      } catch (err) {
        showMessage(err.message || 'Falha ao ler placa pela câmera.', 'error');
        ocrEmAndamento = false;
        return;
      }

      ocrEmAndamento = false;
    }

    if (!plate) {
      showMessage('Informe a placa ou tente ler pela câmera novamente.', 'error');
      return;
    }

    const start = $startTime.value ? new Date($startTime.value) : new Date();
    const id = String(state.seq++).padStart(6, '0');

    state.tickets.push({
      id,
      plate,
      slot,
      note: $note.value.trim(),
      start,
      status: 'ativo'
    });

    $plate.value = $slot.value = $note.value = $startTime.value = '';
    renderActive();
    renderFinishSelect();
    showMessage(`Ticket ${id} criado para placa ${plate}.`, 'success');

  } catch (err) {
    ocrEmAndamento = false;
    showMessage('Erro ao criar ticket: ' + (err.message || err), 'error');
  }
}

$create?.addEventListener('click', () => {
  createTicketComOCRSeNecessario();
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') {
    createTicketComOCRSeNecessario();
  }
});

// =============== RENDERIZAÇÃO DE ATIVOS ===============

function renderActive() {
  if (!$activeList) return;
  $activeList.innerHTML = '';

  if (state.tickets.length === 0) {
    $activeList.innerHTML = '<li>Nenhum ticket ativo.</li>';
    return;
  }

  state.tickets.forEach(t => {
    const li = document.createElement('li');
    li.className = 'ticket-line';
    li.innerHTML = `
      <div>
        <span><strong>${t.id}</strong> • Placa: ${t.plate} • Vaga: ${t.slot}</span>
        <span style="margin-left:12px">Entrada: ${dtDisp(t.start)}</span>
        ${t.note ? `<span style="margin-left:12px">Obs: ${t.note}</span>` : ''}
      </div>`;
    $activeList.appendChild(li);
  });
}

// =============== SELECT DE FINALIZAÇÃO ===============

function renderFinishSelect() {
  if (!$finishTicket) return;
  $finishTicket.innerHTML = '<option value="">Selecione...</option>';

  state.tickets.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.id} - ${t.plate} (${t.slot})`;
    $finishTicket.appendChild(opt);
  });
}

// =============== CÁLCULO SIMPLIFICADO ===============

function computeCharge(t, end) {
  const FIXO = parseFloat($rateHour.value || '0');

  return {
    minutes: diffMinutes(t.start, end),
    chargedMinutes: 0,
    subtotal: FIXO,
    discount: 0,
    extra: 0,
    total: FIXO
  };
}

// =============== ATUALIZAÇÃO DO CÁLCULO ===============

function clearPaymentUI() {
  if ($pixArea) $pixArea.innerHTML = '';
  if ($cardArea) $cardArea.innerHTML = '';
  if ($cashArea) $cashArea.innerHTML = '';
  if ($confirmPayment) { $confirmPayment.disabled = true; $confirmPayment.onclick = null; }
  if ($printReceipt) { $printReceipt.disabled = true; }
  state.currentPayment = null;
}

function updateCalc() {
  if ($calcArea) $calcArea.innerHTML = '';
  clearPaymentUI();

  const id = $finishTicket?.value;
  if (!id) return;

  const t = state.tickets.find(x => x.id === id);
  if (!t) return;

  const end = $endTime?.value ? new Date($endTime.value) : new Date();
  const c = computeCharge(t, end);

  if ($calcArea) {
    $calcArea.innerHTML = `
      <div class="price-line"><span><strong>Placa:</strong> ${t.plate}</span>
      <span><strong>Vaga:</strong> ${t.slot}</span></div>

      <div class="price-line"><span>Entrada:</span><span>${dtDisp(t.start)}</span></div>
      <div class="price-line"><span>Saída:</span><span>${dtDisp(end)}</span></div>

      <div class="price-line"><span>Tempo total:</span><span>${c.minutes} min</span></div>

      <div class="price-line total">
        <span>Total a pagar:</span>
        <span><strong>${fmtBRL(c.total)}</strong></span>
      </div>
    `;
  }

  state.currentPayment = {
    id: t.id,
    plate: t.plate,
    slot: t.slot,
    start: dtDisp(t.start),
    end: dtDisp(end),
    durationMin: c.minutes,
    chargedMinutes: 0,
    subtotal: c.total,
    discount: 0,
    extra: 0,
    total: Number(c.total.toFixed(2)),
    method: null,
    ts: new Date(),
    pixPayload: null
  };

  const method = $payMethod?.value || '';
  if (method === 'pix') renderPIX(state.currentPayment);
  else if (method === 'card') renderCardSmart(state.currentPayment);
  else if (method === 'cash') renderCash(state.currentPayment);
}

[$finishTicket, $endTime, $payMethod, $rateHour]
  .forEach(el => el?.addEventListener('change', updateCalc));

// =============== PAGAMENTO PIX ===============

async function renderPIX(current) {
  if ($pixArea) $pixArea.innerHTML = "<p>Gerando QR Code PIX...</p>";
  if ($cardArea) $cardArea.innerHTML = "";
  if ($cashArea) $cashArea.innerHTML = "";

  try {
    const resp = await fetch(`${API}/gerar-pix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: current.id,
        plate: current.plate,
        slot: current.slot,
        total: current.total,
        durationMin: current.durationMin,
        chargedMin: current.chargedMinutes
      })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Erro ao gerar PIX');

    $pixArea.innerHTML = `
      <h3>Pagamento via PIX</h3>
      <img src="${data.qrUrl}" style="width:250px;height:250px"/>
      <p><strong>Copia e cola:</strong></p>
      <textarea readonly style="width:100%;height:80px">${data.qrText}</textarea>
      <small>Payment ID: ${data.paymentId}</small>
      <p>Após aprovação, clique em Confirmar pagamento.</p>
    `;

    $confirmPayment.disabled = false;
    $confirmPayment.onclick = () => finalizeTicketAndHistory('PIX');

    state.currentPayment.method = 'PIX';
    state.currentPayment.paymentId = data.paymentId;
    state.currentPayment.pixPayload = data.pixPayload;

  } catch (err) {
    $pixArea.innerHTML = "<p style='color:red'>Erro ao gerar QR Code PIX.</p>";
    showMessage('Erro ao gerar PIX: ' + err.message, 'error');
  }
}

// =============== PAGAMENTO CARTÃO ===============

function renderCardSmart(current) {
  $cardArea.innerHTML = `
    <h3>Cartão na Smart</h3>
    <p>Cobre ${fmtBRL(current.total)} na maquininha.</p>
    <p>Depois de aprovado, clique em Confirmar pagamento.</p>
  `;

  $pixArea.innerHTML = "";
  $cashArea.innerHTML = "";

  $confirmPayment.disabled = false;
  $confirmPayment.onclick = () => finalizeTicketAndHistory('CARTÃO (SMART)');
  state.currentPayment.method = 'CARTÃO (SMART)';
}

// =============== PAGAMENTO DINHEIRO ===============

function renderCash(current) {
  $cashArea.innerHTML = `
    <h3>Pagamento em dinheiro</h3>
    <p>Receber ${fmtBRL(current.total)} e confirmar abaixo.</p>
  `;

  $pixArea.innerHTML = "";
  $cardArea.innerHTML = "";

  $confirmPayment.disabled = false;
  $confirmPayment.onclick = () => finalizeTicketAndHistory('DINHEIRO');
  state.currentPayment.method = 'DINHEIRO';
}

// =============== FINALIZAÇÃO DO TICKET ===============

function finalizeTicketAndHistory(method) {
  const id = $finishTicket?.value;
  if (!id) return;

  const idx = state.tickets.findIndex(x => x.id === id);
  if (idx < 0) return;

  const t = state.tickets[idx];
  const end = $endTime?.value ? new Date($endTime.value) : new Date();
  const c = computeCharge(t, end);

  state.tickets.splice(idx, 1);
  renderActive();
  renderFinishSelect();

  const entry = {
    id: t.id,
    plate: t.plate,
    slot: t.slot,
    start: t.start,
    end,
    chargedMinutes: 0,
    subtotal: c.total,
    discount: 0,
    extra: 0,
    total: Number(c.total.toFixed(2)),
    method,
    ts: new Date(),
    pixPayload: state.currentPayment?.pixPayload || null
  };

  state.history.unshift(entry);
  renderHistory();

  clearPaymentUI();

  state.lastReceipt = {
    id: entry.id,
    plate: entry.plate,
    slot: entry.slot,
    start: dtDisp(entry.start),
    end: dtDisp(entry.end),
    chargedMinutes: 0,
    subtotal: entry.subtotal,
    discount: 0,
    extra: 0,
    total: entry.total,
    method: entry.method,
    ts: entry.ts,
    pixPayload: entry.pixPayload
  };

  showMessage(`Ticket ${t.id} finalizado com pagamento: ${method}.`, 'success');

  imprimirTicket(state.lastReceipt);
}

// =============== HISTÓRICO ===============

function renderHistory() {
  if (!$historyTableBody) return;

  $historyTableBody.innerHTML = '';

  if (state.history.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" style="text-align:center">Sem movimentos.</td>`;
    $historyTableBody.appendChild(tr);
    return;
  }

  state.history.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.id}</td>
      <td>${h.plate}</td>
      <td>${dtDisp(h.start)}</td>
      <td>${dtDisp(h.end)}</td>
      <td>${fmtBRL(h.total)}</td>
      <td>${h.method}</td>
      <td>Pago</td>
      <td>
        <button class="btn" data-action="print" data-id="${h.id}">Recibo</button>
        <button class="btn danger" data-action="remove" data-id="${h.id}">Remover</button>
      </td>
    `;
    $historyTableBody.appendChild(tr);
  });

  $historyTableBody.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.currentTarget.getAttribute('data-id');
      const action = e.currentTarget.getAttribute('data-action');
      const entry = state.history.find(x => x.id === id);
      if (!entry) return;

      if (action === 'print') {
        state.lastReceipt = {
          id: entry.id,
          plate: entry.plate,
          slot: entry.slot,
          start: dtDisp(entry.start),
          end: dtDisp(entry.end),
          chargedMinutes: 0,
          subtotal: entry.subtotal,
          discount: 0,
          extra: 0,
          total: entry.total,
          method: entry.method,
          ts: entry.ts,
          pixPayload: entry.pixPayload
        };
        imprimirTicket(state.lastReceipt);
      }

      if (action === 'remove') {
        state.history = state.history.filter(x => x.id !== id);
        renderHistory();
        showMessage(`Movimento ${id} removido do histórico.`, 'info');
      }
    });
  });
}

// =============== IMPRESSÃO RAWBT ===============

async function imprimirTicket(ticket) {
  if (!ticket) {
    showMessage("Nenhum recibo disponível para impressão.", "error");
    return;
  }

  try {
    const res = await fetch(`${API}/gerar-ticket-escpos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ticket)
    });

    if (!res.ok) {
      showMessage("Erro ao gerar ESC/POS no servidor.", "error");
      return;
    }

    const escpos = await res.text();
    const base64 = btoa(escpos);

    window.location.href = "rawbt:base64," + base64;
    showMessage(`Ticket ${ticket.id} enviado para impressão.`, "success");

  } catch (err) {
    showMessage("Falha ao imprimir: " + err.message, "error");
  }
}

$printReceipt?.addEventListener('click', () => {
  imprimirTicket(state.lastReceipt);
});

// =============== CANCELAR PAGAMENTO ===============

function cancelPayment() {
  clearPaymentUI();
  showMessage('Operação cancelada.', 'info');
}
$cancelPayment?.addEventListener('click', cancelPayment);

// =============== INICIALIZAÇÃO ===============

function initDefaults() {
  if ($rateHour) $rateHour.value = '';
  if ($payMethod) $payMethod.value = '';
  renderActive();
  renderFinishSelect();
  renderHistory();
  showMessage('Sistema pronto para uso.', 'info');
}

document.addEventListener('DOMContentLoaded', initDefaults);
