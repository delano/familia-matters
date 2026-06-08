/* backend.js — the single shared backend instance factory.
 *
 * Plain JS. Defines window.createFamiliaBackend() which returns an object with
 * an async request(envelope) method. State is kept implicitly in the Claude
 * conversation transcript: the system prompt + SEED are sent once (prefixed to
 * the first request), then every action is a user turn and every response an
 * assistant turn. Because the whole transcript replays on each call, the model
 * sees the mutations it made earlier — that is the "one shared StateModel,
 * seeded once, mutated by actions" guarantee.
 *
 * Requires: window.FAMILIA_SYSTEM_PROMPT (seed.js) and window.claude.complete.
 */
(function () {
  function extractJSON(text) {
    if (text == null) return null;
    var s = String(text).trim();
    // Strip ```json … ``` or ``` … ``` fences if present.
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    // Fast path.
    try { return JSON.parse(s); } catch (e) {}
    // Find the first balanced { } or [ ] block.
    var start = -1, open = '', close = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '{' || s[i] === '[') { start = i; open = s[i]; close = s[i] === '{' ? '}' : ']'; break; }
    }
    if (start === -1) return null;
    var depth = 0, inStr = false, esc = false;
    for (var j = start; j < s.length; j++) {
      var c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { var slice = s.slice(start, j + 1); try { return JSON.parse(slice); } catch (e2) { return null; } } }
    }
    return null;
  }

  window.createFamiliaBackend = function createFamiliaBackend() {
    var messages = [];
    var seeded = false;

    async function request(envelope) {
      if (!window.claude || typeof window.claude.complete !== 'function') {
        throw new Error('claude_unavailable');
      }
      var payload = JSON.stringify(envelope);
      var content = payload;
      if (!seeded) {
        content = window.FAMILIA_SYSTEM_PROMPT +
          '\n\nRespond to THIS request and every following request with ONLY the ' +
          'JSON response (no prose, no markdown fences). First request:\n' + payload;
        seeded = true;
      }
      messages.push({ role: 'user', content: content });
      var raw;
      try {
        raw = await window.claude.complete({ messages: messages });
      } catch (err) {
        // Roll back the unanswered user turn so the transcript stays consistent.
        messages.pop();
        seeded = messages.length > 0;
        throw err;
      }
      messages.push({ role: 'assistant', content: String(raw) });
      var parsed = extractJSON(raw);
      if (parsed == null) {
        var e = new Error('bad_json');
        e.raw = raw;
        throw e;
      }
      return parsed;
    }

    return { request: request, _messages: messages, _extractJSON: extractJSON };
  };

  window._familiaExtractJSON = function (t) { return window.createFamiliaBackend()._extractJSON(t); };
})();
