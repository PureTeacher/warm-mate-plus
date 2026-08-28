'use strict';

/**
 * 匹配一句用户输入的回复：按命中的关键词长度取最长者，等长取最先出现者，无命中回退到默认回复。
 * 纯函数，不含任何 DOM / 网络依赖，便于单测。
 *
 * @param {string} text - 用户输入
 * @param {Array<{kw: string[], reply: string}>} replies - 关键词 -> 回复 的规则表
 * @param {string} fallback - 无命中时的默认回复
 * @returns {string}
 */
function matchReply(text, replies, fallback) {
  const t = String(text).toLowerCase();
  let best = null;
  let bestLen = 0;

  for (const r of replies) {
    for (const kw of r.kw) {
      const k = String(kw).toLowerCase();
      if (k && t.includes(k) && k.length > bestLen) {
        best = r.reply;
        bestLen = k.length;
      }
    }
  }

  return best !== null ? best : fallback;
}

module.exports = { matchReply };
