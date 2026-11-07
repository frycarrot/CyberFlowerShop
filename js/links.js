(function (root) {
  'use strict';
  var CF = typeof module !== 'undefined' && module.exports ? require('./order.js') : root.CF;
  // Return plain text with encoded URLs; render via textContent or a trusted Markdown renderer.
  function replaceMarkers(text, base) {
    text = String(text || '');
    var url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('花店网址必须使用 https 或 http');
    var markers = CF.findMarkers(text);
    for (var i = markers.length - 1; i >= 0; i--) {
      var m = markers[i];
      text = text.slice(0, m.index) + CF.buildLink(base, m.text) + text.slice(m.index + m.text.length);
    }
    return text;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { replaceMarkers: replaceMarkers };
  root.CFLinks = { replaceMarkers: replaceMarkers };
})(typeof window !== 'undefined' ? window : globalThis);
