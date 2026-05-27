function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, dy] = d.split('-');
  return `${dy}/${m}/${y}`;
}

function fmtDateShort(d) {
  if (!d) return '';
  const [y, m, dy] = d.split('-');
  return `${dy}/${m}`;
}

function fmtMoney(v) {
  return 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
