const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const { checkInputSafety, checkOutputSafety, checkRateLimit, incrementRateLimit, trimConversationHistory, wrapSystemPrompt } = require('../../safeguards');
const { ANTHROPIC_API_KEY } = require('../config');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    const messages = req.body.messages || [];
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
    if (lastUserMsg) {
      const inputCheck = checkInputSafety(lastUserMsg.content);
      if (!inputCheck.safe) {
        return res.json({
          content: [{ type: 'text', text: inputCheck.reason }],
          role: 'assistant',
          _safety_blocked: true,
        });
      }
    }

    const rateCheck = checkRateLimit(req.user.id);
    if (!rateCheck.allowed) {
      return res.json({
        content: [{ type: 'text', text: rateCheck.message }],
        role: 'assistant',
        _rate_limited: true,
      });
    }

    const trimmedMessages = trimConversationHistory(messages, 10);

    const baseSystem = req.body.system || '';
    const featurePrompt = req.body.featureSystemPrompt || '';
    const combinedSystem = featurePrompt ? (baseSystem + '\n\n' + featurePrompt) : baseSystem;
    const safeSystem = wrapSystemPrompt(combinedSystem);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.body.model || 'claude-sonnet-4-20250514',
        max_tokens: Math.min(req.body.max_tokens || 1024, 4096),
        system: safeSystem,
        messages: trimmedMessages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const replyText = data.content && data.content[0] ? data.content[0].text : '';
    if (replyText) {
      const outputCheck = await checkOutputSafety(replyText, ANTHROPIC_API_KEY);
      if (!outputCheck.safe) {
        data.content[0].text = outputCheck.filtered;
      }
    }

    incrementRateLimit(req.user.id);

    if (rateCheck.message) {
      data._rate_warning = rateCheck.message;
    }

    res.json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    res.status(502).json({ error: 'Something went wrong — please try again in a moment! 😊' });
  }
});

module.exports = router;
