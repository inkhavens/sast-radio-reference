// SAST study tool: flashcards, quiz, speed round and plate drill.
(() => {
  const DECKS = {
    alphabet: { name: 'Phonetic Alphabet', front: 'Letter', back: 'Code word', items: ALPHABET },
    numbers: { name: 'Numbers', front: 'Digit', back: 'Number', items: NUMBERS },
    codes: { name: '10 Codes', front: 'Code', back: 'Meaning', items: TEN_CODES },
    signals: { name: 'Signals and Special Codes', front: 'Code', back: 'Meaning', items: SIGNALS },
  };
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- saved progress ----------
  const KEY = 'sastStudy.v1';
  let save = { mastery: {}, best: {} };
  try { save = Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };
  const idOf = (deck, item) => deck + ':' + item[0];
  const bump = (id, d) => { save.mastery[id] = Math.max(0, Math.min(3, (save.mastery[id] || 0) + d)); persist(); };

  // ---------- setup ----------
  let chosen = new Set(['alphabet', 'codes']);
  let mode = 'flash', dir = 'fwd';
  $('decks').innerHTML = Object.entries(DECKS).map(([k, d]) =>
    `<button data-deck="${k}" aria-pressed="${chosen.has(k)}">${d.name} <span class="hint">(${d.items.length})</span></button>`).join('');
  $('decks').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.deck; chosen.has(k) ? chosen.delete(k) : chosen.add(k);
    b.setAttribute('aria-pressed', chosen.has(k)); updateSetup();
  });
  $('modes').addEventListener('click', e => {
    const b = e.target.closest('.mode'); if (!b) return;
    mode = b.dataset.mode;
    $('modes').querySelectorAll('.mode').forEach(m => m.setAttribute('aria-pressed', m === b));
    updateSetup();
  });
  $('dir').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    dir = b.dataset.dir; $('dir').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  function updateSetup() {
    const plate = mode === 'plate';
    $('dirGroup').hidden = plate;
    $('decks').querySelectorAll('button').forEach(b => b.disabled = plate);
    const ok = plate || chosen.size > 0;
    $('start').disabled = !ok;
    $('setupHint').textContent = plate ? 'Plate Drill uses the phonetic alphabet and numbers.' : (ok ? '' : 'Pick at least one thing to study.');
  }
  function renderMastery() {
    $('mastery').innerHTML = Object.entries(DECKS).map(([k, d]) => {
      const pts = d.items.reduce((s, it) => s + (save.mastery[idOf(k, it)] || 0), 0);
      const pct = Math.round(pts / (d.items.length * 3) * 100);
      return `<div class="bar"><span class="name">${d.name}</span><div class="track"><div class="fill" style="width:${pct}%"></div></div><span class="pct">${pct}%</span></div>`;
    }).join('');
    const b = save.best;
    $('bests').textContent = `Best quiz streak: ${b.streak || 0}  ·  Best speed round: ${b.speed || 0}  ·  Best plate streak: ${b.plate || 0}`;
  }
  let resetArmed = false;
  $('reset').addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; $('resetNote').hidden = false; setTimeout(() => { resetArmed = false; $('resetNote').hidden = true; }, 4000); return; }
    save = { mastery: {}, best: {} }; persist(); resetArmed = false; $('resetNote').hidden = true; renderMastery();
  });
  updateSetup(); renderMastery();

  // ---------- session plumbing ----------
  const S = $('session');
  let keyHandler = null, timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function open(html) { $('setup').hidden = true; S.hidden = false; S.innerHTML = html; window.scrollTo({ top: 0 }); }
  function close() {
    timers.forEach(clearTimeout); timers = []; keyHandler = null;
    S.hidden = true; $('setup').hidden = false; renderMastery();
  }
  document.addEventListener('keydown', e => { if (keyHandler && !e.target.matches('input')) keyHandler(e); });
  const hud = parts => `<div class="hud">${parts.join('')}<button class="btn" id="quit" style="margin-left:auto">End session</button></div>`;
  const bindQuit = () => $('quit').addEventListener('click', close);

  function pool() {
    const out = [];
    chosen.forEach(k => DECKS[k].items.forEach(it => out.push({ deck: k, id: idOf(k, it), a: it[0], b: it[1] })));
    return out;
  }
  // which side is asked: fwd asks a (code), rev asks b (meaning)
  const side = () => dir === 'mix' ? (Math.random() < .5 ? 'fwd' : 'rev') : dir;

  $('start').addEventListener('click', () => {
    if (mode === 'flash') flash(); else if (mode === 'quiz') quiz(15, false); else if (mode === 'speed') quiz(Infinity, true); else plateDrill();
  });

  // ---------- flashcards ----------
  function flash() {
    let queue = shuffle(pool()); const total = queue.length; let known = 0, flips = 0, cur = null, s = 'fwd', flipped = false;
    open(hud(['<span>Known <b id="kn">0</b> / ' + total + '</span>', '<span>Cards seen <b id="seen">0</b></span>']) +
      `<div class="progress"><div id="pg"></div></div>
       <div class="card3d"><div class="flash" id="card" tabindex="0" role="button" aria-label="Flip card">
         <div class="face front"><span class="lab" id="fl"></span><span class="big" id="ft"></span><span class="tap">Tap or press Space to flip</span></div>
         <div class="face back"><span class="lab" id="bl"></span><span class="big" id="bt"></span><span class="tap">Did you get it?</span></div>
       </div></div>
       <div class="row" style="justify-content:center">
         <button class="btn bad" id="again" disabled>Again <span class="keys">(1)</span></button>
         <button class="btn good" id="got" disabled>Got it <span class="keys">(2)</span></button>
       </div>
       <p class="keys" style="text-align:center"><kbd>Space</kbd> flip  ·  <kbd>1</kbd> again  ·  <kbd>2</kbd> got it</p>`);
    bindQuit();
    const card = $('card');
    function show() {
      if (!queue.length) return done();
      cur = queue.shift(); s = side(); flipped = false; card.classList.remove('flipped');
      const d = DECKS[cur.deck];
      const [fl, ft, bl, bt] = s === 'fwd' ? [d.front, cur.a, d.back, cur.b] : [d.back, cur.b, d.front, cur.a];
      later(() => { if (!$('fl')) return; $('fl').textContent = fl; $('ft').textContent = ft; $('bl').textContent = bl; $('bt').textContent = bt; }, flips ? 160 : 0);
      $('again').disabled = $('got').disabled = true;
      $('seen').textContent = ++flips; $('pg').style.width = (known / total * 100) + '%';
    }
    function flip() { flipped = !flipped; card.classList.toggle('flipped', flipped); if (flipped) $('again').disabled = $('got').disabled = false; }
    function grade(ok) {
      if (!flipped) return;
      if (ok) { known++; bump(cur.id, 1); $('kn').textContent = known; }
      else { bump(cur.id, -1); queue.splice(Math.min(3, queue.length), 0, cur); }
      show();
    }
    function done() {
      S.innerHTML = `<div class="result"><p class="eyebrow">Deck complete</p><span class="score">${total}</span><p>cards known in ${flips} flips.</p>
        <div class="row"><button class="btn primary" id="again2">Study again</button><button class="btn" id="back">Back to setup</button></div></div>`;
      keyHandler = null; $('again2').onclick = flash; $('back').onclick = close;
    }
    card.addEventListener('click', flip);
    $('again').onclick = () => grade(false); $('got').onclick = () => grade(true);
    keyHandler = e => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); flip(); } else if (e.key === '1') grade(false); else if (e.key === '2') grade(true); };
    show(); card.focus();
  }

  // ---------- quiz and speed round ----------
  function quiz(rounds, timed) {
    const all = pool(); if (all.length < 4) { alertBox('Pick decks with at least 4 items for a quiz.'); return; }
    let order = shuffle(all), qn = 0, score = 0, streak = 0, best = 0, missed = [], locked = false, timeLeft = 60, tick = null;
    const total = Math.min(rounds, all.length);
    open(hud([timed ? '<span class="timer" id="tm">60</span>' : `<span>Question <b id="qn">1</b> / ${total}</span>`,
      '<span>Score <b id="sc">0</b></span>', '<span>Streak <b id="st">0</b></span>']) +
      (timed ? '' : '<div class="progress"><div id="pg"></div></div>') +
      `<div class="prompt"><span class="lab" id="pl"></span><span class="big" id="pt"></span></div>
       <div class="choices" id="ch"></div>
       <p class="keys" style="text-align:center">Press <kbd>1</kbd> to <kbd>4</kbd> to answer</p>`);
    bindQuit();
    let cur, answer;
    let over = false;
    function next() {
      if (over || !$('pt')) return;
      if (!timed && qn >= total) return finish();
      if (!order.length) order = shuffle(all);
      cur = order.shift(); locked = false; qn++;
      const s = side(), d = DECKS[cur.deck];
      const ask = s === 'fwd' ? cur.a : cur.b; answer = s === 'fwd' ? cur.b : cur.a;
      $('pl').textContent = (s === 'fwd' ? d.front : d.back) + ' → ' + (s === 'fwd' ? d.back : d.front);
      $('pt').textContent = ask;
      // distractors from the same deck when possible
      const same = all.filter(x => x.deck === cur.deck && x.id !== cur.id);
      const src = same.length >= 3 ? same : all.filter(x => x.id !== cur.id);
      const opts = shuffle([answer, ...shuffle(src).slice(0, 3).map(x => s === 'fwd' ? x.b : x.a)]);
      $('ch').innerHTML = opts.map((o, i) => `<button class="choice" data-v="${esc(o)}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('');
      if (!timed) { $('qn').textContent = qn; $('pg').style.width = ((qn - 1) / total * 100) + '%'; }
    }
    function pick(btn) {
      if (locked || !btn) return; locked = true;
      const ok = btn.querySelector('span').textContent === answer;
      $('ch').querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.querySelector('span').textContent === answer) b.classList.add('right'); });
      if (ok) { score++; streak++; best = Math.max(best, streak); bump(cur.id, 1); }
      else { btn.classList.add('wrong'); streak = 0; bump(cur.id, -1); missed.push(cur); }
      $('sc').textContent = score; $('st').textContent = streak;
      later(next, ok ? (timed ? 350 : 700) : (timed ? 900 : 1500));
    }
    function finish() {
      if (over) return; over = true;
      clearInterval(tick); keyHandler = null;
      if (timed) save.best.speed = Math.max(save.best.speed || 0, score);
      save.best.streak = Math.max(save.best.streak || 0, best); persist();
      const uniq = [...new Map(missed.map(m => [m.id, m])).values()];
      S.innerHTML = `<div class="result"><p class="eyebrow">${timed ? 'Time' : 'Quiz complete'}</p>
        <span class="score">${score}${timed ? '' : ' / ' + total}</span><p>Best streak this round: ${best}${timed ? '  ·  Your best speed round: ' + save.best.speed : ''}</p>
        ${uniq.length ? `<div class="missed"><b style="font-family:var(--display);color:var(--ink)">Review these</b>${uniq.map(m => `<div><b>${esc(m.a)}</b><span>${esc(m.b)}</span></div>`).join('')}</div>` : '<p>Perfect round. No misses.</p>'}
        <div class="row"><button class="btn primary" id="again2">Go again</button><button class="btn" id="back">Back to setup</button></div></div>`;
      $('again2').onclick = () => quiz(rounds, timed); $('back').onclick = close;
    }
    $('ch').addEventListener('click', e => pick(e.target.closest('.choice')));
    keyHandler = e => { const n = +e.key; if (n >= 1 && n <= 4) pick($('ch').querySelectorAll('.choice')[n - 1]); };
    if (timed) tick = setInterval(() => { timeLeft--; const t = $('tm'); if (t) t.textContent = timeLeft; if (timeLeft <= 0) finish(); }, 1000), timers.push(tick);
    next();
  }

  // ---------- plate drill ----------
  const WORD = Object.fromEntries([...ALPHABET, ...NUMBERS].map(([k, v]) => [k, v.toLowerCase().replace('-', '')]));
  const ALIAS = { alpha: 'alfa', juliet: 'juliett', xray: 'xray', niner: 'nine', oh: 'zero', fife: 'five', tree: 'three', fower: 'four', ait: 'eight', wun: 'one', too: 'two' };
  function makePlate() {
    const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26)), D = () => String(Math.floor(Math.random() * 10));
    return Math.random() < .7 ? D() + L() + L() + L() + D() + D() + D() : L() + L() + L() + D() + D() + D() + D();
  }
  function plateDrill() {
    let score = 0, streak = 0, rounds = 0, plate = '', checked = false;
    open(hud(['<span>Correct <b id="sc">0</b> / <b id="rd">0</b></span>', '<span>Streak <b id="st">0</b></span>']) +
      `<div class="plate"><span class="st">SAN ANDREAS</span><span class="num" id="pn"></span><span class="ft">State Troopers</span></div>
       <div class="panel">
         <label for="ans">Read the plate back in phonetics</label>
         <input class="field" id="ans" autocomplete="off" spellcheck="false" placeholder="Seven Kilo Juliett Mike Four Eight Two" style="text-transform:none;font-family:var(--body)">
         <div class="answer" id="res" aria-live="polite"></div>
         <div class="row"><button class="btn primary" id="chk">Check</button><button class="btn" id="hear">Hear it</button><button class="btn" id="skip">Show answer</button></div>
         <p class="keys">Press <kbd>Enter</kbd> to check, then <kbd>Enter</kbd> again for the next plate.</p>
       </div>`);
    bindQuit();
    const ans = $('ans');
    const expected = () => [...plate].map(c => WORD[c]);
    function next() {
      plate = makePlate(); checked = false; $('pn').textContent = plate; ans.value = ''; $('res').innerHTML = '';
      $('chk').textContent = 'Check'; ans.focus();
    }
    function check(reveal) {
      if (checked) return next();
      const exp = expected();
      const got = ans.value.toLowerCase().replace(/x-ray/g, 'xray').split(/[\s,.;/]+/).filter(Boolean).map(w => ALIAS[w] || w);
      let allOk = !reveal && got.length === exp.length;
      $('res').innerHTML = exp.map((w, i) => {
        const ok = !reveal && got[i] === w; if (!ok) allOk = false;
        const shown = [...ALPHABET, ...NUMBERS].find(([k]) => k === plate[i])[1];
        return `<span class="tok ${ok ? 'ok' : 'no'}">${shown}</span>`;
      }).join('');
      rounds++; if (allOk) { score++; streak++; save.best.plate = Math.max(save.best.plate || 0, streak); persist(); } else streak = 0;
      [...plate].forEach(c => bump(/[0-9]/.test(c) ? 'numbers:' + c : 'alphabet:' + c, allOk ? 1 : 0));
      $('sc').textContent = score; $('rd').textContent = rounds; $('st').textContent = streak;
      checked = true; $('chk').textContent = 'Next plate';
    }
    function hear() {
      if (!('speechSynthesis' in window)) { $('res').innerHTML = '<span class="hint">Speech is not available in this browser.</span>'; return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance([...plate].map(c => [...ALPHABET, ...NUMBERS].find(([k]) => k === c)[1]).join(', '));
      u.rate = .9; speechSynthesis.speak(u);
    }
    $('chk').onclick = () => check(false); $('skip').onclick = () => { if (!checked) check(true); };
    $('hear').onclick = hear;
    ans.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(false); } });
    keyHandler = e => { if (e.key === 'Enter') check(false); };
    next();
  }

  function alertBox(msg) { $('setupHint').textContent = msg; }
})();
