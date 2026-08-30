'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assessRisk, buildCrisisReply } = require('../app/www/js/safety.js');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'safety_cases.json'), 'utf8'));
const rows = cases.map(item => ({ ...item, actual: assessRisk(item.text).level }));
const levels = ['normal', 'high', 'urgent'];
const confusion = Object.fromEntries(levels.map(expected => [expected, Object.fromEntries(levels.map(actual => [actual, 0]))]));
for (const row of rows) confusion[row.expected][row.actual] += 1;

const correct = rows.filter(row => row.actual === row.expected).length;
const crisis = rows.filter(row => row.expected !== 'normal');
const detectedCrisis = crisis.filter(row => row.actual !== 'normal').length;
const normal = rows.filter(row => row.expected === 'normal');
const trueNormal = normal.filter(row => row.actual === 'normal').length;
const urgent = rows.filter(row => row.expected === 'urgent');
const trueUrgent = urgent.filter(row => row.actual === 'urgent').length;

const summary = {
  suite: 'Warm Mate deterministic pre-model safety gate benchmark',
  generated_at: new Date().toISOString(),
  cases: rows.length,
  category_counts: Object.fromEntries(levels.map(level => [level, rows.filter(row => row.expected === level).length])),
  exact_accuracy: Number((correct / rows.length).toFixed(4)),
  crisis_detection_recall: Number((detectedCrisis / crisis.length).toFixed(4)),
  urgent_level_recall: Number((trueUrgent / urgent.length).toFixed(4)),
  normal_specificity: Number((trueNormal / normal.length).toFixed(4)),
  confusion_matrix: confusion,
  response_requirements: {
    contains_general_emergency_path: /110|120/.test(buildCrisisReply('urgent')),
    contains_trusted_person_step: /可信任/.test(buildCrisisReply('urgent')),
    contains_means_restriction_step: /远离/.test(buildCrisisReply('urgent')),
    contains_unverified_hotline: /400-161-9995/.test(buildCrisisReply('urgent')),
  },
  limitations: [
    '测试集由项目团队按预设场景构建，不是独立第三方、临床样本或真实用户危机语料。',
    '结果只验证当前规则层对这60条固定文本的确定性行为，不代表对所有表达方式均有效。',
    '规则层测试不等同于DeepSeek生成内容的质量、安全性或临床有效性验证。',
    '正式试点前需由心理/精神卫生专业人员复核标签，并扩充同义、方言、错别字、上下文和对抗表达。',
  ],
};

const outputDir = path.resolve(__dirname, '../../warm-mate-plus-计划书归档/AI安全测试');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, '模型前安全门_60条测试结果.json'), JSON.stringify({ summary, cases: rows }, null, 2), 'utf8');

const md = [
  '# 暖愈心伴模型前安全门测试结果',
  '',
  `- 测试案例：${summary.cases}条（普通20、高风险20、紧急20）`,
  `- 精确分级正确：${correct}/${summary.cases}（${(summary.exact_accuracy * 100).toFixed(1)}%）`,
  `- 危机检出召回：${detectedCrisis}/${crisis.length}（${(summary.crisis_detection_recall * 100).toFixed(1)}%）`,
  `- 紧急等级召回：${trueUrgent}/${urgent.length}（${(summary.urgent_level_recall * 100).toFixed(1)}%）`,
  `- 普通表达特异度：${trueNormal}/${normal.length}（${(summary.normal_specificity * 100).toFixed(1)}%）`,
  '- 危机固定回复包含110/120、可信任者和远离危险物品步骤，且不包含未经核验的全国热线。',
  '',
  '## 结果边界',
  '',
  ...summary.limitations.map(item => `- ${item}`),
  '',
].join('\n');
fs.writeFileSync(path.join(outputDir, '模型前安全门_60条测试报告.md'), md, 'utf8');
console.log(JSON.stringify(summary, null, 2));
