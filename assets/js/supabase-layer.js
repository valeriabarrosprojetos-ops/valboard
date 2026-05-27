const SUPA_URL = 'https://ygtjuywxdxfluqwhczxe.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlndGp1eXd4ZHhmbHVxd2hjenhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDA2MDcsImV4cCI6MjA5NDkxNjYwN30.Sm16ntSzA3KOzrSK5nkcXIO0NlhNTey0XFq58twMHGk';

let supaClient = null;
const syncAck = {};
let syncPollTimer = null;

function setSyncErrorStatus() {
  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) syncStatus.textContent = '⚠️ Erro de sync';
}

function showSyncRefreshingStatus() {
  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) {
    syncStatus.textContent = '🔄 Atualizando...';
    setTimeout(() => {
      syncStatus.textContent = '';
    }, 2000);
  }
}

function renderCurrentView() {
  if (currentPage === 'home') renderHome();
  else if (currentPage === 'financeiro') renderFinanceiro();
  else renderBoard(currentPage);
}

function initSupabase() {
  try {
    supaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    return true;
  } catch (e) {
    console.warn('Supabase init error:', e);
    return false;
  }
}

async function syncToSupa(quadro) {
  if (!supaClient) return;
  const cards = getCards(quadro);
  try {
    const { data, error } = await supaClient.from('vb_sync').upsert(
      {
        id: quadro,
        quadro,
        dados: cards,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    ).select('updated_at').single();

    if (error) throw error;
    syncAck[quadro] = data?.updated_at || new Date().toISOString();
  } catch (e) {
    console.warn('syncToSupa error:', e);
    setSyncErrorStatus();
  }
}

async function syncLancsToSupa() {
  if (!supaClient) return;
  try {
    const { data, error } = await supaClient.from('vb_sync').upsert(
      {
        id: 'financeiro',
        quadro: 'financeiro',
        dados: lancamentos,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    ).select('updated_at').single();
    if (error) throw error;
    syncAck.financeiro = data?.updated_at || new Date().toISOString();
  } catch (e) {
    console.warn('syncLancsToSupa error:', e);
    setSyncErrorStatus();
  }
}

async function syncInfosToSupa() {
  if (!supaClient) return;
  try {
    const { data, error } = await supaClient.from('vb_sync').upsert(
      {
        id: 'infos',
        quadro: 'infos',
        dados: getInfos(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    ).select('updated_at').single();
    if (error) throw error;
    syncAck.infos = data?.updated_at || new Date().toISOString();
  } catch (e) {
    console.warn('syncInfosToSupa error:', e);
    setSyncErrorStatus();
  }
}

async function syncAllFromSupa() {
  if (!supaClient) return false;
  try {
    const { data, error } = await supaClient.from('vb_sync').select('*');
    if (error || !data || !data.length) return false;

    let updated = false;
    for (const row of data) {
      if (!row.quadro || !row.dados) continue;
      const quadro = row.quadro;
      if (quadro === 'financeiro') {
        const localRawFin = syncAck.financeiro || '0';
        const supaRawFin = row.updated_at || '0';
        const localMsFin = localRawFin === '0' ? 0 : new Date(localRawFin).getTime();
        const supaMsFin = supaRawFin === '0' ? 0 : new Date(supaRawFin).getTime();
        if (supaMsFin > localMsFin) {
          lancamentos = Array.isArray(row.dados) ? row.dados : [];
          syncAck.financeiro = supaRawFin;
          updated = true;
        }
        continue;
      }
      if (quadro === 'infos') {
        const localRawInfos = syncAck.infos || '0';
        const supaRawInfos = row.updated_at || '0';
        const localMsInfos = localRawInfos === '0' ? 0 : new Date(localRawInfos).getTime();
        const supaMsInfos = supaRawInfos === '0' ? 0 : new Date(supaRawInfos).getTime();
        if (supaMsInfos > localMsInfos) {
          importInfos(Array.isArray(row.dados) ? row.dados : []);
          syncAck.infos = supaRawInfos;
          updated = true;
        }
        continue;
      }
      const localRaw = syncAck[quadro] || '0';
      const supaRaw = row.updated_at || '0';
      const localMs = localRaw === '0' ? 0 : new Date(localRaw).getTime();
      const supaMs = supaRaw === '0' ? 0 : new Date(supaRaw).getTime();
      if (supaMs > localMs) {
        cardStore[quadro] = Array.isArray(row.dados) ? row.dados : [];
        syncAck[quadro] = supaRaw;
        updated = true;
      }
    }
    return updated;
  } catch (e) {
    console.warn('syncAllFromSupa error:', e);
    return false;
  }
}

function startSyncPolling() {
  if (syncPollTimer) clearInterval(syncPollTimer);
  syncPollTimer = setInterval(async () => {
    const updated = await syncAllFromSupa();
    if (updated) renderCurrentView();
  }, 5000);
}

function initRealtimeSync() {
  if (!supaClient) return;
  supaClient
    .channel('vb_sync_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vb_sync' }, (payload) => {
      const row = payload.new;
      if (!row || !row.quadro || !row.dados) return;
      const quadro = row.quadro;

      if (quadro === 'financeiro') {
        lancamentos = Array.isArray(row.dados) ? row.dados : [];
        syncAck.financeiro = row.updated_at || new Date().toISOString();
        showSyncRefreshingStatus();
        if (currentPage === 'financeiro') renderFinanceiro();
        else if (currentPage === 'home') renderHome();
        showToast('✅ Financeiro atualizado!');
        return;
      }

      if (quadro === 'infos') {
        importInfos(Array.isArray(row.dados) ? row.dados : []);
        syncAck.infos = row.updated_at || new Date().toISOString();
        showSyncRefreshingStatus();
        if (currentPage === 'home') renderHome();
        showToast('✅ Informações atualizadas!');
        return;
      }

      cardStore[quadro] = Array.isArray(row.dados) ? row.dados : [];
      syncAck[quadro] = row.updated_at || new Date().toISOString();
      showSyncRefreshingStatus();

      if (currentPage === quadro) renderBoard(quadro);
      else if (currentPage === 'home') renderHome();
      showToast('✅ Atualizado em tempo real!');
    })
    .subscribe((status) => {
      console.log('Realtime status:', status);
      const syncStatus = document.getElementById('syncStatus');
      if (!syncStatus) return;
      if (status === 'SUBSCRIBED') {
        syncStatus.textContent = '🟢 Tempo real';
        setTimeout(() => { syncStatus.textContent = ''; }, 3000);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        syncStatus.textContent = '🟡 Sync por polling';
      }
    });
}
