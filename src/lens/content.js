import * as P from './parse';
import { SETTINGS_KEY, HISTORY_KEY as HIST_KEY, EPOCH_KEY, cleanHistory } from './model';
(() => {
  const users = new Map();      // handle -> user
  const tweetSeen = new Map();  // 去重,避免同一条推文重复累计
  const stats = new Map();      // handle -> { views, interactions }
  let settings = null;          // 读完存储后才渲染
  let settingsVer = 0;
  let hist = {};
  let epoch = 0;
  const samples = new Map();
  let saveTimer = null;
  let msgCount = 0;
  const pending = [];           // 设置读完之前收到的数据包

  // ---------- 设置与历史 ----------
  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;

  function init() {
    if (!storage) { settings = P.mergeSettings(); flush(); return; }
    storage.get([SETTINGS_KEY, HIST_KEY, EPOCH_KEY], (res) => {
      settings = P.mergeSettings(res && res[SETTINGS_KEY]);
      hist = cleanHistory(res?.[HIST_KEY], Date.now());
      epoch = res?.[EPOCH_KEY] || 0;
      syncCapture();
      applyDebug();
      flush();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[HIST_KEY]) hist = cleanHistory(changes[HIST_KEY].newValue, Date.now());
      if (changes[EPOCH_KEY]) {
        epoch = changes[EPOCH_KEY].newValue || 0;
        samples.clear();
        clearTimeout(saveTimer); saveTimer = null;
        hideTip();
      }
      if (!changes[SETTINGS_KEY]) return;
      settings = P.mergeSettings(changes[SETTINGS_KEY].newValue);
      settingsVer++;
      syncCapture();
      hideTip();
      if (!settings.enabled || !settings.trackHistory) {
        samples.clear(); clearTimeout(saveTimer); saveTimer = null;
      }
      if (!settings.enabled) { users.clear(); tweetSeen.clear(); stats.clear(); pending.length = 0; }
      applyDebug();
      scheduleRender();
    });
  }

  function flush() {
    while (pending.length) handleMessage(pending.shift());
    scheduleRender();
  }

  function syncCapture() {
    window.postMessage({ source: 'xchajian-lens-control', enabled: settings.enabled }, location.origin);
  }

  function recordHistory(u) {
    if (!settings.enabled || !settings.trackHistory) return;
    samples.set(u.handle, { handle: u.handle, followers: u.followers });
    if (samples.size > 500) samples.delete(samples.keys().next().value);
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const batch = [...samples.values()]; samples.clear();
      try {
        const result = await chrome.runtime.sendMessage({ type: 'LENS_RECORD', epoch, samples: batch });
        if (!result?.ok) throw new Error(result?.error || '历史保存失败');
      } catch (error) { console.warn('[Xchajian] 粉丝历史未保存', error); }
    }, 1000);
  }

  // ---------- 数据包处理 ----------
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== "xchajian-lens" || typeof e.data.body !== "string" || e.data.body.length > 4 * 1024 * 1024) return;
    msgCount++;
    if (!settings) { if (pending.length < 4) pending.push(e.data.body); return; }
    if (!settings.enabled) return;
    handleMessage(e.data.body);
    scheduleRender();
  });

  function handleMessage(body) {
    if (!settings?.enabled) return;
    let json;
    try { json = JSON.parse(body); } catch (_) { return; }
    const { users: us, tweets } = P.extract(json);
    for (const u of us) {
      users.set(u.handle, u);
      recordHistory(u);
    }
    for (const t of tweets) tweetSeen.set(t.id, t);
    while (users.size > 3000) users.delete(users.keys().next().value);
    while (tweetSeen.size > 5000) tweetSeen.delete(tweetSeen.keys().next().value);
    stats.clear();
    for (const t of tweetSeen.values()) {
      const sum = stats.get(t.author) || { views: 0, interactions: 0 };
      sum.views += t.views; sum.interactions += t.interactions;
      stats.set(t.author, sum);
    }
  }

  // ---------- 渲染 ----------
  function handleOf(container) {
    for (const a of container.querySelectorAll('a[role="link"][href^="/"]')) {
      const m = a.getAttribute("href").match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (m && a.textContent.trim().startsWith("@")) return m[1].toLowerCase();
    }
    return null;
  }

  function buildBadge(handle, compact) {
    const u = users.get(handle);
    if (!u) return null;
    const stat = stats.get(handle);
    const list = P.tags(u, stat, Date.now(), settings);

    const wrap = document.createElement("span");
    wrap.className = "xcl-lens-badge";
    wrap.dataset.lensHandle = handle;
    // 徽标在名字链接里时,鼠标移上来不应触发 X 自己的资料悬浮卡:
    // 不让这些事件冒泡给 X(它靠这几个事件判断悬停),我们自己的详情卡直接监听徽标。
    for (const ev of ["mouseover", "mouseout", "pointerover", "pointerout", "mousemove", "pointermove"]) {
      wrap.addEventListener(ev, (e) => e.stopPropagation());
    }
    wrap.addEventListener("mouseenter", () => showTip(wrap));
    wrap.addEventListener("mouseleave", hideTip);
    if (settings.hoverCard) {
      wrap.tabIndex = 0;
      wrap.setAttribute('aria-label', '@' + handle + '，' + u.followers + ' 粉丝，查看详情');
      wrap.addEventListener('focus', () => showTip(wrap));
      wrap.addEventListener('blur', hideTip);
      wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); hideTip(); } });
    }

    const main = document.createElement("span");
    main.className = "xcl-lens-main" + (settings.tierColors ? " t" + P.tier(u.followers) : "");
    main.textContent = `${P.fmt(u.followers)} 粉丝`;
    wrap.append(main);

    const meaning = P.ratioMeaning(u);
    if (settings.showRatio && meaning) {
      const r = document.createElement("span");
      r.className = "xcl-lens-ratio";
      r.textContent = meaning.label;
      r.title = meaning.description;
      r.setAttribute('aria-label', meaning.description);
      wrap.append(r);
    }

    if (!compact) {
      for (const t of list.slice(0, settings.maxTags)) {
        const el = document.createElement("span");
        el.className = "xcl-lens-tag " + t.cls;
        el.textContent = t.text;
        wrap.append(el);
      }
    }
    return { wrap, list };
  }

  function sigOf(handle, compact) {
    const u = users.get(handle), s = stats.get(handle);
    return JSON.stringify([handle, u, s, settingsVer, compact]);
  }

  // ----- 推文头部:行内 / 单独一行 / 自动 -----
  const placed = new WeakMap();   // User-Name 元素 -> { badge, line, sig }
  const belowOwners = new Map();  // Detached/replaced React name nodes must not leave a sibling badge.

  // 头部整行(名字区 + 其它插件的小标 + 菜单)。结构不符就返回 null,调用方退回行内。
  function headerRow(un) {
    const row = un.parentElement && un.parentElement.parentElement && un.parentElement.parentElement.parentElement;
    const host = row && row.parentElement;
    if (!row || !host) return null;
    const rs = getComputedStyle(row), hs = getComputedStyle(host);
    return rs.display === "flex" && rs.flexDirection === "row" && hs.flexDirection === "column" ? row : null;
  }

  // 名字或 @ID 因为空间不够被省略(...)了吗
  function crowded(un, badge) {
    for (const n of un.querySelectorAll("*")) {
      if (n === badge || badge.contains(n)) continue;
      if (n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  }

  function placeBelow(un, badge) {
    const row = headerRow(un);
    if (!row) return null;
    const line = document.createElement("div");
    line.className = "xcl-lens-line";
    line.append(badge);
    row.after(line);
    belowOwners.set(line, un);
    return line;
  }

  function decorateTweet(un) {
    const handle = handleOf(un);
    const rec = placed.get(un);
    if (!handle || !users.has(handle)) {
      if (rec) { rec.badge.remove(); rec.line?.remove(); placed.delete(un); }
      return;
    }
    const sig = sigOf(handle, false);
    if (rec && rec.badge.isConnected && rec.sig === sig) return;
    if (rec) { rec.badge.remove(); if (rec.line) rec.line.remove(); }

    const built = buildBadge(handle, false);
    if (!built) return;
    let line = null;
    if (settings.layout === "below") {
      line = placeBelow(un, built.wrap);
      if (!line) un.append(built.wrap);
    } else {
      un.append(built.wrap);
      // 自动:放进去之后名字被挤省略了,就挪到下一行(只判断这一次,不来回挪)
      if (settings.layout === "auto" && crowded(un, built.wrap)) line = placeBelow(un, built.wrap);
    }
    placed.set(un, { badge: built.wrap, line, sig });
  }

  // ----- 关注 / 粉丝列表里的用户行 -----
  function decorateCell(cell, anchor) {
    const handle = handleOf(cell);
    if (!handle || !users.has(handle)) {
      cell.querySelectorAll('.xcl-lens-badge').forEach(b => b.remove());
      cell.classList.remove('xcl-lens-dim'); return;
    }
    const compact = !!cell.closest('[data-testid="sidebarColumn"]');
    const sig = sigOf(handle, compact);
    const old = cell.querySelector(".xcl-lens-badge");
    if (old && old.dataset.lensHandle === handle && old.dataset.lensSig === sig) return;
    if (old) old.remove();
    const built = buildBadge(handle, compact);
    if (!built || !anchor) return;
    built.wrap.dataset.lensSig = sig;
    if (anchor) anchor.append(built.wrap);
    cell.classList.toggle("xcl-lens-dim", settings.dimLowQuality && P.shouldDim(built.list));
  }

  function cleanup() {
    belowOwners.clear();
    document.querySelectorAll(".xcl-lens-line").forEach((l) => l.remove());
    document.querySelectorAll(".xcl-lens-badge").forEach((b) => b.remove());
    document.querySelectorAll(".xcl-lens-dim").forEach((c) => c.classList.remove("xcl-lens-dim"));
  }

  function render() {
    if (!settings) return;
    for (const [line, owner] of belowOwners) {
      if (!line.isConnected || !owner.isConnected || headerRow(owner)?.parentElement !== line.parentElement) {
        line.remove(); belowOwners.delete(line);
      }
    }
    if (!settings.enabled) { cleanup(); hideTip(); return; }
    document.querySelectorAll('article[data-testid="tweet"] [data-testid="User-Name"]').forEach(decorateTweet);
    document.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
      const nameBlock = cell.querySelector('[dir="ltr"]')?.closest("div");
      decorateCell(cell, nameBlock);
    });
    updateHud();
  }

  let timer = null;
  function scheduleRender() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; render(); }, 150);
  }

  new MutationObserver(scheduleRender).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true, attributeFilter: ["href"], characterData: true,
  });

  // ---------- 调试条 ----------
  let hud = null;
  function applyDebug() {
    if (settings.enabled && settings.debug && !hud) {
      hud = document.createElement("div");
      hud.id = "xcl-lens-hud";
      document.documentElement.append(hud);
    } else if ((!settings.enabled || !settings.debug) && hud) {
      hud.remove();
      hud = null;
    }
    updateHud();
  }
  function updateHud() {
    if (!hud) return;
    const shown = document.querySelectorAll(".xcl-lens-badge").length;
    const text = `FL 数据包:${msgCount} 用户:${users.size} 已显示:${shown}`;
    if (hud.textContent !== text) hud.textContent = text;
  }

  // ---------- 悬停详情卡 ----------
  let tip = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function accountAge(createdAt, now) {
    const d = new Date(createdAt);
    if (!Number.isFinite(d.getTime())) return "";
    const months = Math.floor((now - d.getTime()) / (30.44 * 86400e3));
    const y = Math.floor(months / 12), m = months % 12;
    const span = y > 0 ? `${y} 年${m ? ` ${m} 个月` : ""}` : `${m} 个月`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")} · ${span}`;
  }

  function tipHtml(handle) {
    const u = users.get(handle);
    if (!u) return "";
    const now = Date.now();
    const stat = stats.get(handle);
    const er = P.engagementOf(stat);
    const rows = [];
    rows.push(["粉丝", u.followers.toLocaleString()]);
    rows.push(["关注", u.following === null ? "—" : u.following.toLocaleString()]);
    rows.push(["粉丝/关注比", P.fmtRatio(P.ratioOf(u))]);
    if (u.tweets !== null && u.tweets !== undefined) rows.push(["推文数", Number(u.tweets).toLocaleString()]);
    if (u.createdAt) rows.push(["注册", accountAge(u.createdAt, now)]);
    rows.push(["当前样本互动率", er === null ? `<span class="dim">样本不足(需浏览量合计 ≥ 2000)</span>` : `${(er * 100).toFixed(2)}%`]);
    if (settings.trackHistory) {
      const d = P.deltaFrom(hist[handle], u.followers, now);
      if (d) {
        const sign = d.diff > 0 ? "+" : d.diff < 0 ? "" : "±";
        const cls = d.diff > 0 ? "up" : d.diff < 0 ? "down" : "";
        const pct = d.base > 0 ? ` (${sign}${((d.diff / d.base) * 100).toFixed(1)}%)` : "";
        rows.push([`近 ${d.days} 天`, `<span class="${cls}">${sign}${d.diff.toLocaleString()}${pct}</span>`]);
      } else {
        rows.push(["变化", `<span class="dim">已开始记录,明天起显示</span>`]);
      }
    }
    const rel = u.followedBy && u.iFollow ? "互相关注" : u.followedBy ? "TA 关注了你" : u.iFollow ? "你关注了 TA" : "";
    if (rel) rows.push(["关系", rel]);
    rows.push(["提示", "规则标签仅供参考"]);
    const meaning = P.ratioMeaning(u);
    return `<div class="xcl-lens-tip-h">@${esc(handle)}</div>` +
      rows.map(([k, v]) => `<div class="xcl-lens-tip-r"><span>${k}</span><b>${v}</b></div>`).join("") +
      (meaning ? `<div class="xcl-lens-tip-meaning"><strong>${esc(meaning.label)}</strong><br>${esc(meaning.description)}<br>这反映关注数量的倾向，不代表影响力、账号质量或回关意愿。</div>` : '');
  }

  function showTip(badge) {
    if (!settings?.enabled || !settings.hoverCard) return;
    const handle = badge.dataset.lensHandle;
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "xcl-lens-tip";
      tip.setAttribute("role", "tooltip");
      document.documentElement.append(tip);
    }
    tip.innerHTML = tipHtml(handle);
    badge.setAttribute("aria-describedby", "xcl-lens-tip");
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255];
    tip.dataset.theme = (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000 < 128 ? "dark" : "light";
    tip.style.display = "block";
    const r = badge.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 6);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() {
    if (tip) tip.style.display = 'none';
    document.querySelectorAll('[aria-describedby="xcl-lens-tip"]').forEach(b => b.removeAttribute('aria-describedby'));
  }

  window.addEventListener("scroll", hideTip, { passive: true });

  window.addEventListener('resize', () => { settingsVer++; hideTip(); scheduleRender(); }, { passive: true });
  init();
})();
