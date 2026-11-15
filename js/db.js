/* ==========================================================================
   Almacenamiento persistente: IndexedDB (con respaldo en localStorage si el
   navegador no permite IndexedDB, por ejemplo en algunos modos privados).
   Todo el estado se guarda como un solo documento: es pequeño y la escritura
   es atómica, así nunca queda a medias.
   ========================================================================== */
const DB = (function () {
  'use strict';
  const NAME = 'mi-fondo-bhd', STORE = 'kv', KEY = 'state', LS_KEY = 'mi-fondo-bhd:state';
  let mode = 'indexeddb', dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Sin IndexedDB'));
      let req;
      try { req = indexedDB.open(NAME, 1); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
    });
    return dbp;
  }

  async function idbGet() {
    const db = await open();
    return new Promise((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(state) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('Transacción cancelada'));
    });
  }

  async function load() {
    try {
      const s = await idbGet();
      mode = 'indexeddb';
      return s;
    } catch (e) {
      mode = 'localstorage';
      try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e2) { mode = 'memory'; return null; }
    }
  }
  async function save(state) {
    // Copia limpia (sin proxies ni referencias) para guardar
    const snap = JSON.parse(JSON.stringify(state));
    if (mode === 'indexeddb') {
      try { await idbPut(snap); return; } catch (e) { mode = 'localstorage'; }
    }
    if (mode === 'localstorage') {
      try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); return; } catch (e) { mode = 'memory'; }
    }
    throw new Error('No se pudo guardar en este navegador');
  }
  async function clear() {
    try { const db = await open(); await new Promise((res, rej) => { const r = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY); r.onsuccess = res; r.onerror = rej; }); } catch (e) { /* nada */ }
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* nada */ }
  }
  async function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* nada */ }
    return false;
  }
  return { load, save, clear, requestPersistence, get mode() { return mode; } };
})();
