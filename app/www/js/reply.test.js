'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { matchReply } = require('./reply.js');

// Spec 数据（独立真值，不引用实现/不照抄 data.js）
const replies = [
  { kw: ['压力', '累'], reply: 'A-压力' },
  { kw: ['焦虑', '担心'], reply: 'B-焦虑' },
  { kw: ['失眠', '睡不着'], reply: 'C-失眠' },
  { kw: ['hi', 'hello'], reply: 'D-问候' },
];
const fallback = 'F-默认';

test('命中关键词时返回对应回复', () => {
  assert.equal(matchReply('我最近压力好大', replies, fallback), 'A-压力');
});

test('长关键词优先于短关键词', () => {
  // '累'(len1) 命中的是 A，但 '睡不着'(len3) 命中的是 C，应取 C
  assert.equal(matchReply('累得睡不着', replies, fallback), 'C-失眠');
});

test('等长关键词取数组中最先出现者', () => {
  // '焦虑' 与 '失眠' 都是 len2，先出现的 B-焦虑 应胜出
  assert.equal(matchReply('一边焦虑一边失眠', replies, fallback), 'B-焦虑');
});

test('大小写不敏感', () => {
  assert.equal(matchReply('HI there', replies, fallback), 'D-问候');
});

test('无命中返回默认回复', () => {
  assert.equal(matchReply('今天天气不错', replies, fallback), 'F-默认');
});
