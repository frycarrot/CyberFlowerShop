# 花束码转链接

菜单直接复制 MENU.txt；内容由 CF.menuPrompt() 生成。

浏览器先加载 js/order.js，再加载 js/links.js。Node 用法：

```js
const { replaceMarkers } = require('./js/links.js');
const result = replaceMarkers(chatText, 'https://frycarrot.github.io/CyberFlowerShop/');
```

传入最终部署网址。函数使用 CF.findMarkers() 与 CF.buildLink()，从后向前替换，保留聊天原文和多个标记的位置。输出是纯文本，不是 HTML；展示时请使用 textContent 或可信 Markdown 渲染器。

仅支持正则的平台：不要用非贪婪的 `\[花束:.*?\]`。平台还必须支持对整段匹配结果执行 encodeURIComponent，纯固定替换模板无法保证生成符合约定的链接。不能执行编码时，请复制花束码到花店的“贴花束码”。

寄语放最后、标记单行、寄语不用 `[ ] |` 的菜单规则仍然保留。

