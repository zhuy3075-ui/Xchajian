// Adapted from x-follower-lens 0.2.3, MIT; see LICENSE and NOTICE.md.
import { DEFAULTS, mergeSettings, validHandle, validCount } from './model';
export { DEFAULTS, mergeSettings };
const count = v => { const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v; return validCount(n) ? n : null; };
const num = v => count(v) ?? 0;
  function readUser(u) {
    const legacy = u.legacy || {};
    const core = u.core || {};
    const handle = core.screen_name || legacy.screen_name;
    if (!validHandle(handle)) return null;
    const rc = u.relationship_counts || {};
    const followers = rc.followers ?? legacy.followers_count ?? u.followers_count;
    const following = rc.following ?? legacy.friends_count ?? u.friends_count;
    if (count(followers) === null) return null;
    const rp = u.relationship_perspectives || {};
    const tc = u.tweet_counts || {};
    const created = core.created_at ?? legacy.created_at;
    return {
      handle: String(handle).toLowerCase(),
      name: core.name || legacy.name || "",
      followers: num(followers),
      following: count(following),
      tweets: count(tc.tweets ?? legacy.statuses_count),
      createdAt: typeof created === 'string' && Number.isFinite(Date.parse(created)) ? new Date(created).toISOString() : null,
      followedBy: (rp.followed_by ?? legacy.followed_by) === true,   // 对方关注了我
      iFollow: (rp.following ?? legacy.following) === true,        // 我关注了对方
    };
  }

  function readTweet(t, author) {
    const legacy = t.legacy || {};
    if (typeof t.rest_id !== 'string' || !/^\d{1,64}$/.test(t.rest_id) || legacy.favorite_count === undefined) return null;
    const views = t.views && t.views.count !== undefined ? num(t.views.count) : 0;
    return {
      id: String(t.rest_id).slice(0, 64),
      author,
      views,
      interactions:
        num(legacy.favorite_count) + num(legacy.retweet_count) +
        num(legacy.reply_count) + num(legacy.quote_count),
    };
  }

  // 返回 { users: [...], tweets: [...] }
  function extract(json) {
    const users = [];
    const tweets = [];
    const seen = new WeakSet();

    const stack = [json];
    let visited = 0;
    while (stack.length && visited++ < 50000) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (node.__typename === 'User') {
        const u = readUser(node);
        if (u) users.push(u);
      } else if (node.__typename === 'Tweet' && node.core?.user_results) {
        const author = readUser(node.core.user_results.result || {});
        if (author) { const t = readTweet(node, author.handle); if (t) tweets.push(t); }
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object' && stack.length < 50000) stack.push(value);
      }
    }

    return { users, tweets };
  }

  const ratioOf = (u) => (u.following > 0 ? u.followers / u.following : null);

  function ratioMeaning(u) {
    if (!validCount(u.followers) || !validCount(u.following) || u.following === 0) return null;
    const ratio = ratioOf(u);
    const counts = `${u.followers.toLocaleString()} 人关注此账号；此账号关注 ${u.following.toLocaleString()} 人。`;
    if (ratio > 1.25) {
      return { label: `被关注更多 · ${fmtRatio(ratio)}倍`, description: `${counts}关注此账号的人更多，粉丝人数约为关注人数的 ${fmtRatio(ratio)} 倍。` };
    }
    if (ratio < 0.8) {
      const multiple = u.followers > 0 ? fmtRatio(u.following / u.followers) : null;
      return { label: `关注别人更多${multiple ? ` · ${multiple}倍` : ''}`, description: `${counts}${multiple ? `此账号关注的人更多，关注人数约为粉丝人数的 ${multiple} 倍。` : '当前粉丝数为 0，无法计算倍数。'}` };
    }
    return { label: '粉丝与关注相近', description: `${counts}两边人数接近；人数接近不代表这些人互相关注。` };
  }

  function engagementOf(stat) {
    if (!stat || stat.views < 2000) return null;
    return stat.interactions / stat.views;
  }

  // 质量标签。阈值是经验值,放在这里方便调。按展示优先级排序。
  function tags(user, stat, now, cfg) {
    const on = (cfg && cfg.tags) || DEFAULTS.tags;
    const out = [];
    const { followers, following } = user;
    const ratio = ratioOf(user);

    if (on.relation) {
      if (user.followedBy && user.iFollow) out.push({ key: "relation", text: "互关", cls: "rel" });
      else if (user.followedBy) out.push({ key: "relation", text: "关注了你", cls: "rel" });
    }
    if (on.bigV && followers >= 10000 && (ratio !== null && ratio >= 10)) out.push({ key: "bigV", text: "高粉丝比", cls: "hi" });
    if (on.farm && following >= 1000 && ratio > 0.8 && ratio < 1.25 && followers < 5000)
      out.push({ key: "farm", text: "粉关接近", cls: "warn" });

    const days = user.createdAt ? (now - new Date(user.createdAt).getTime()) / 86400000 : null;
    if (on.newAcct && days !== null && days >= 0 && days < 90) out.push({ key: "newAcct", text: "新号", cls: "warn" });

    const er = engagementOf(stat);
    if (er !== null) {
      if (on.engaged && er >= 0.03) out.push({ key: "engaged", text: "样本高互动", cls: "hi" });
      else if (on.lowActive && er < 0.001 && followers >= 5000)
        out.push({ key: "lowActive", text: "样本低互动", cls: "warn" });
    }
    // 老号信息量最低,排最后(徽标最多展示前 3 个)
    if (on.oldAcct && days !== null && days > 365 * 8) out.push({ key: "oldAcct", text: "老号", cls: "" });
    return out;
  }

  // 粉丝量分级 0..4,用于徽标配色
  function tier(followers) {
    if (followers >= 1e6) return 4;
    if (followers >= 1e5) return 3;
    if (followers >= 1e4) return 2;
    if (followers >= 1e3) return 1;
    return 0;
  }

  // 1 万以内显示精确值,以上用"万"、"亿"
  function fmt(n) {
    if (n < 10000) return String(n);
    if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 2 : 1).replace(/\.?0+$/, "") + "万";
    return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  }

  function fmtRatio(r) {
    if (r === null) return "—";
    return r >= 100 ? String(Math.round(r)) : r >= 10 ? r.toFixed(0) : r.toFixed(1);
  }

  // 淡化条件:疑似互粉号或低活跃号(且对应标签开关打开)
  function shouldDim(tagList) {
    return tagList.some((t) => t.key === "farm" || t.key === "lowActive");
  }

  // 历史变化:在 history(数组 [[ts, followers], ...])里找约 7 天前的基准点
  function deltaFrom(history, current, now) {
    if (!history || history.length < 2) return null;
    const MIN_AGE = 20 * 3600e3;
    const WEEK = 7 * 86400e3;
    let best = null;
    for (const [ts, f] of history) {
      const age = now - ts;
      if (age < MIN_AGE) continue;
      if (!best || Math.abs(age - WEEK) < Math.abs(now - best.ts - WEEK)) best = { ts, f };
    }
    if (!best) return null;
    return { days: Math.max(1, Math.round((now - best.ts) / 86400e3)), diff: current - best.f, base: best.f, ts: best.ts };
  }


export { extract, tags, tier, fmt, fmtRatio, ratioOf, ratioMeaning, engagementOf, shouldDim, deltaFrom };
