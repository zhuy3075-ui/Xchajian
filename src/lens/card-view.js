import { deltaFrom, engagementOf } from './parse';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '暂无数据';

export function relationLabel(user) {
  return user.followedBy && user.iFollow ? '与你互关' : user.followedBy ? 'TA 关注了你' : user.iFollow ? '你已关注 TA' : '';
}

export function accountCardHtml(user, stat, history, settings) {
  const observedAt = user.observedAt;
  const delta = settings.trackHistory ? deltaFrom(history, user.followers, observedAt) : null;
  const interaction = engagementOf(stat);
  const relation = user.followedBy && user.iFollow ? '你关注了 TA，TA 也关注了你' : relationLabel(user) || '当前数据未显示与你的关注关系';
  const row = (label, value, note = '') => `<div class="xcl-lens-tip-r"><span>${esc(label)}</span><div><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ''}</div></div>`;
  const change = delta ? `比约${delta.days}天前${delta.diff > 0 ? `多 ${count(delta.diff)} 人` : delta.diff < 0 ? `少 ${count(-delta.diff)} 人` : '人数不变'}`
    : settings.trackHistory ? '等待可比较的记录' : '未开启记录';
  const registered = user.createdAt ? new Date(user.createdAt) : null;
  const month = registered && Number.isFinite(registered.getTime()) ? `${registered.getFullYear()}年${registered.getMonth() + 1}月` : '暂无数据';
  const basic = row('粉丝人数', `${count(user.followers)} 人`) + row('TA 关注的人', user.following === null ? '暂无数据' : `${count(user.following)} 人`) +
    row('粉丝变化', change) + row('注册时间', month) +
    row('互动表现', interaction === null ? '暂无法判断' : `每100次浏览约${(interaction * 100).toFixed(1)}次互动`, interaction === null ? '当前采样数据不足' : '仅限当前已加载的帖子');
  return `<div class="xcl-lens-tip-h"><strong>${esc(user.name || user.handle)}</strong><span>@${esc(user.handle)}</span></div>` +
    `<p class="xcl-lens-relation">${esc(relation)}</p><div class="xcl-lens-facts">${basic}</div>`;
}
