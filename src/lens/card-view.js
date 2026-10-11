import { deltaFrom, engagementOf, fmtRatio, ratioOf, ratioMeaning, tags } from './parse';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '暂无数据';
const pad = value => String(value).padStart(2, '0');
function recordTime(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

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
  const meaning = ratioMeaning(user);
  const comparison = delta
    ? `${recordTime(delta.ts)}：${count(delta.base)} 人；本次读取 ${recordTime(observedAt)}：${count(user.followers)} 人。时间按本地时区显示，这是两次记录差，并非今日新增。`
    : settings.trackHistory ? '需要至少两次记录，且比较基准距本次读取至少20小时；有多条记录时优先选取接近7天前的一条。' : '可在粉丝透镜设置中开启“记录浏览过账号的粉丝数”；仅在浏览时采样。';
  const otherTags = tags(user, stat, observedAt, settings).filter(tag => tag.key !== 'relation').map(tag => tag.text);
  return `<div class="xcl-lens-tip-h"><strong>${esc(user.name || user.handle)}</strong><span>@${esc(user.handle)}</span></div>` +
    `<p class="xcl-lens-relation">${esc(relation)}</p><div class="xcl-lens-facts">${basic}</div>` +
    `<details class="xcl-lens-more"><summary>查看更多数据与计算说明</summary><div class="xcl-lens-explanations">` +
    `<p><strong>粉丝与关注</strong>${esc(meaning ? meaning.description : '关注人数为0或数据缺失，暂不计算比例。')}<br>粉丝 ÷ 关注 = ${esc(fmtRatio(ratioOf(user)))}。人数相近不代表互关。</p>` +
    `<p><strong>累计发布</strong>${esc(count(user.tweets))}${user.tweets === null ? '' : ' 条'}；累计数量不能说明最近是否活跃。</p>` +
    `<p><strong>变化依据</strong>${esc(comparison)}</p>` +
    `<p><strong>互动计算依据</strong>当前已加载 ${count(stat?.posts || 0)} 条帖子，共 ${count(stat?.views || 0)} 次浏览、${count(stat?.interactions || 0)} 次互动。互动包括赞、转发、回复与引用；次数不是人数。浏览量合计至少2000才计算，互动率 = 互动次数 ÷ 浏览量${interaction === null ? '。' : ` = ${(interaction * 100).toFixed(2)}%。`}</p>` +
    (otherTags.length ? `<p><strong>其他标记</strong>${esc(otherTags.join('、'))}。这些标记来自数量、账号年龄或当前样本，不能据此判断账号质量。</p>` : '') +
    '</div></details>';
}
