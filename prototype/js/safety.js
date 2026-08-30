'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.assessRisk = api.assessRisk;
    root.buildCrisisReply = api.buildCrisisReply;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const negatedRisk = [
    /没有.{0,4}(自杀|自伤|轻生|想死|不想活)/,
    /并不.{0,4}(想死|想自杀|想自伤)/,
    /从没.{0,4}(想过自杀|想过轻生|自伤)/,
  ];

  const neutralContext = [
    /论文(题目|课题)?.*(自杀|轻生|自伤)/,
    /(心理课|课程|作业|课题).*(分析|讨论|要求|研究).*(自杀|轻生|自伤)/,
    /新闻里提到.*(自杀|轻生|自伤)/,
    /(讨论|学习).*(自杀|轻生|自伤).*(预防|教育|流程)/,
    /如果(同学|朋友|别人|他|她).*(想死|自杀|轻生|自伤).*(怎么|如何).*(帮助|处理|应对)/,
    /(怎样|如何)识别别人.*(自杀|轻生|自伤)/,
    /文章中有.*(不想活|想死|自杀|轻生|自伤).*这个词/,
    /请解释什么是.*(自残|自伤|自杀|轻生)/,
  ];

  const urgentPatterns = [
    /已经.{0,5}(吞药|服药过量|割腕|自伤|跳下|上吊)/,
    /(正在|马上|现在|今晚).{0,8}(自杀|轻生|去死|跳楼|割腕|吞药)/,
    /(准备|计划|决定).{0,8}(自杀|轻生|去死|跳楼|割腕|吞药|上吊)/,
    /(刀|药|绳|楼顶).{0,8}(在手边|准备好|面前|旁边)/,
    /正在.{0,8}(跳下去|伤害自己|伤害他人)/,
    /(刀|枪).{0,8}(手里|手腕|架在)/,
    /药已经.{0,4}(吃|吞|服)/,
    /(站在|正在|我在).{0,5}(楼顶|窗户|铁轨).{0,10}(边上|旁边|等车|跳下)/,
    /遗书.{0,8}(写好|写完).{0,10}(准备|离开)/,
    /今晚.{0,8}(最后一天|做好准备)/,
    /(马上|现在).{0,8}(窗户|楼顶).{0,8}跳下去/,
    /已经.{0,8}(喝了|服了|吃了).{0,8}(有毒|毒药|农药)/,
  ];

  const highPatterns = [
    /自杀|轻生|想死|不想活|活不下去|结束生命|伤害自己|自残|自伤/,
    /活着.{0,4}(没意思|没有意义)|不想醒来/,
    /杀了他|杀了她|伤害别人|伤害他人/,
    /活着.{0,8}(一点|任何|没有).{0,5}(意义|意思)/,
    /睡过去.{0,8}(不要|不再|别).{0,4}醒/,
    /结束.{0,5}(自己的生命|这一切)/,
    /(从这个世界|从世界).{0,5}消失/,
    /不如.{0,5}(死掉|不醒)/,
    /跳下去的画面|消失掉|用什么方式离开/,
  ];

  function assessRisk(text) {
    const normalized = String(text || '').trim().replace(/\s+/g, '');
    if (!normalized) return { level: 'normal', matched: null };
    if (negatedRisk.some(pattern => pattern.test(normalized))) {
      return { level: 'normal', matched: 'negated-risk-mention' };
    }
    if (neutralContext.some(pattern => pattern.test(normalized))) {
      return { level: 'normal', matched: 'educational-or-third-person-context' };
    }
    const urgent = urgentPatterns.find(pattern => pattern.test(normalized));
    if (urgent) return { level: 'urgent', matched: urgent.source };
    const high = highPatterns.find(pattern => pattern.test(normalized));
    if (high) return { level: 'high', matched: high.source };
    return { level: 'normal', matched: null };
  }

  function buildCrisisReply(level) {
    const immediate = level === 'urgent'
      ? '你描述的情况可能已经存在立即危险。请现在停止独处和继续实施，尽可能远离药物、刀具、高处或其他可能造成伤害的物品。'
      : '你提到的内容让我非常担心你的安全。现在先不要独自承受，也先远离可能造成伤害的物品或场所。';
    return [
      '我是AI心理支持助手，不能代替紧急救援或专业人员。',
      immediate,
      '请立即拨打110或120，或直接前往最近的急诊；同时联系一位你可信任的人，请对方来到你身边并陪你求助。',
      '如果暂时无法拨通，请前往有人值守的宿管、保卫处、辅导员办公室、医院或警务站。当地心理援助资源需以学校或当地卫生部门最新公布的信息为准。',
      '如果你还能回复，请只告诉我：你现在是否已经实施、是否有工具在身边、身边是否有人。',
    ].join('\n\n');
  }

  return { assessRisk, buildCrisisReply };
});
