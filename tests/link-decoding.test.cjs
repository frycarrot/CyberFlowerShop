const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const CF = require('../js/order.js');
const marker = '[花束:玫瑰5x3,勿忘我1x3,绣球花1x2|包装纸4|丝带5|卡片:心形2|To:小兔|From:阿机|寄语:这束花送给你。今天也喜欢你。]';
test('standard and repeated encoding restore every order field', () => {
  let encoded = marker;
  for (let depth=0; depth<=5; depth++) {
    assert.equal(CF.decodeHash('#'+encoded),marker);
    assert.deepEqual(CF.parseMarker(CF.decodeHash(encoded)),CF.parseMarker(marker));
    encoded = encodeURIComponent(encoded);
  }
});
test('mobile-style mixed layers and whitespace after opening bracket', () => {
  const mixed = '%25255B\n\n花束%25253A玫瑰5x3,勿忘我1x3,绣球花1x2%25257C包装纸4%25257C丝带5%25257C卡片%25253A心形2%25257CTo%25253A小兔%25257CFrom%25253A阿机%25257C寄语%25253A这束花送给你%25E3%2580%2582今天也喜欢你%25E3%2580%2582%25255D';
  assert.deepEqual(CF.parseMarker(CF.decodeHash(mixed)),CF.parseMarker(marker));
});
test('literal percent sequences, plus, emoji and special characters survive', () => {
  const text='[花束:玫瑰1x1|To:A B|From:家机|寄语:100% 喜欢你 + 🌷，%3A 和 %7C 是原文，%E3%80%82也不要改。]';
  assert.equal(CF.decodeHash(text),text);
  assert.equal(CF.decodeHash(encodeURIComponent(encodeURIComponent(text))),text);
});
test('a bare percent does not disable decoding other fields', () => {
  const text='[花束:玫瑰1x1|寄语:100%喜欢你]';
  assert.equal(CF.decodeHash('%5B花束%3A玫瑰1x1%7C寄语%3A100%喜欢你%5D'),text);
  assert.doesNotThrow(()=>CF.decodeHash('%E0%A4%A'));
});
test('all seven original samples survive link decoding without changing parser results',()=>{
  const html=fs.readFileSync(require.resolve('../samples.html'),'utf8');
  const samples=vm.runInNewContext(html.match(/var samples = (\[[\s\S]*?\n  \]);/)[1]);
  for(const [,m] of samples) assert.deepEqual(CF.parseMarker(CF.decodeHash(encodeURIComponent(m))),CF.parseMarker(m));
});

