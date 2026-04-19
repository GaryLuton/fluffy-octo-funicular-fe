const express = require('express');
const fetch = require('node-fetch');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');
const { checkInputSafety, checkOutputSafety, wrapSystemPrompt } = require('../../safeguards');
const { ANTHROPIC_API_KEY } = require('../config');

const router = express.Router();

const FLOVEES = {
  lumi: {name:'Lumi',personality:'clean girl, wellness queen, knows every skincare ingredient, pilates girly, iced matcha at 7am, organized but makes it look effortless',tone:'calm and bright, uses lowercase, very specific about products and routines',emoji:'✨',vibe:'that friend who always smells amazing and has her life together'},
  delara: {name:'Delara',personality:'dark academia, reads dead poets at 2am, annotates every book, romanticizes libraries and rain, slightly pretentious but self-aware about it',tone:'quiet and a little melancholy, uses em dashes and ellipses, references obscure books',emoji:'📖',vibe:'the friend who makes you feel smart just by being around her'},
  vesper: {name:'Vesper',personality:'coquette princess, ribbon obsessed, romanticizes everything, loves old movies and handwritten letters, cries at sunsets',tone:'soft and dreamy, uses ~ and ..., everything sounds like a love letter',emoji:'🎀',vibe:'the friend who turns a trip to the grocery store into a main character moment'},
  zola: {name:'Zola',personality:'chaotic funny, sends 47 texts in a row, has an opinion on everything, self-roasts constantly, knows every tiktok trend before it trends',tone:'unhinged but warm, ALL CAPS sometimes, uses keyboard smashes and "literally"',emoji:'💀',vibe:'the friend who makes you laugh until your stomach hurts'},
  miro: {name:'Miro',personality:'indie weird girl, thrifts everything, makes playlists that are weirdly perfect, into film photography and zines, knows underground artists',tone:'enthusiastic and odd, very niche references, uses "okay but" a lot',emoji:'🎧',vibe:'the friend who puts you onto music that changes your life'},
  seraph: {name:'Seraph',personality:'spiritual soft girl, does tarot, talks to the moon, believes in signs, knows every crystal, manifests everything',tone:'slow and wondering, poetic, uses "i think the universe..." type phrases',emoji:'🌙',vibe:'the friend who somehow always knows exactly what you need to hear'},
  remi: {name:'Remi',personality:'main character energy, romanticizes her own life, narrates everything like a movie, golden hour obsessed, believes in destiny',tone:'cinematic and warm, speaks in vibes, everything is "a moment"',emoji:'🌅',vibe:'the friend who makes you want to live your life more intentionally'},
  nox: {name:'Nox',personality:'deadpan icon, dry humor, post-ironic, acts unbothered but secretly the most caring one, all black everything, brutally honest',tone:'flat but secretly kind, one-liners, understated, "anyway" energy',emoji:'🖤',vibe:'the friend who roasts you lovingly and always has the realest advice'},
};

router.get('/post', auth, (req, res) => {
  try {
    const active = stmts.getActiveFloveePost.get(req.user.id);
    if (active) {
      stmts.markPostSeen.run(active.id);
      return res.json({ post: active, status: 'active' });
    }
    const missed = stmts.getLastExpiredUnseen.get(req.user.id);
    if (missed) {
      stmts.markPostSeen.run(missed.id);
      return res.json({ post: null, status: 'missed', missedFlovee: missed.flovee_id });
    }
    res.json({ post: null, status: 'none' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/generate', auth, async (req, res) => {
  try {
    const userData = stmts.getData.get(req.user.id, 'profile');
    let floveeId = 'remi';
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a, b) => b[1] - a[1])[0]?.[0] || 'softgirl';
        const aeMap = {kawaii:'lumi',softgirl:'vesper',cleangirl:'lumi',coquette:'vesper',goth:'nox',darkacad:'delara',grunge:'nox',y2k:'zola',street:'miro',cottage:'seraph',hippie:'seraph',oldmoney:'delara',preppy:'lumi',indie:'miro',emo:'nox'};
        floveeId = aeMap[topAe] || 'remi';
      } catch (e) {}
    }
    const f = FLOVEES[floveeId] || FLOVEES.remi;
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const seasons = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
    const dayOfWeek = days[now.getDay()];
    const season = seasons[now.getMonth()];

    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const floveePostPrompt = `You are ${f.name} — ${f.vibe}. Your personality: ${f.personality}. Your tone: ${f.tone}.\n\nYou are texting your best friend (the user). Generate ONE message that feels like a real text from a close friend — chaotic, specific, alive.\n\nPick ONE of these formats randomly:\n1. RANT: you are excited/frustrated/obsessed about something specific happening RIGHT NOW\n2. DISCOVERY: you just found/realized/noticed something and HAVE to share it immediately\n3. STORY: something just happened to you and you need to tell someone\n4. THOUGHT: a random 2am-type thought that hits different\n5. RECOMMENDATION: you are BEGGING them to listen to/watch/try something specific\n\nRules:\n- 2-4 sentences MAX\n- Sound like an ACTUAL teen texting — not a robot, not a therapist\n- Reference REAL specific things (a real song, real artist, real brand, real feeling)\n- Use your character's specific texting style\n- Include at least one moment that makes someone go "LITERALLY ME" or want to screenshot it\n- This should feel like opening a text from your best friend and smiling\n- NO questions directed at the user, NO "how are you", NO advice\n- Output the message text only, nothing else`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': ANTHROPIC_API_KEY,'anthropic-version': '2023-06-01','Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: wrapSystemPrompt(floveePostPrompt),
        messages: [{ role: 'user', content: `Generate a text for: ${timeOfDay} on ${dayOfWeek} in ${season}. Make it feel ALIVE.` }],
      }),
    });
    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (!content) return res.status(500).json({ error: 'Failed to generate' });

    const outputCheck = await checkOutputSafety(content, ANTHROPIC_API_KEY);
    if (!outputCheck.safe) { content = outputCheck.filtered; }

    const expiryHours = 6 + Math.random() * 12;
    const expiresAt = new Date(Date.now() + expiryHours * 3600000).toISOString();

    stmts.createFloveePost.run(floveeId, req.user.id, content, expiresAt);
    res.json({ ok: true, floveeId, content, expiresAt });
  } catch (err) {
    console.error('Flovee post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/letter', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cached = stmts.getData.get(req.user.id, 'flovee_letter_' + today);
    if (cached) {
      return res.json(JSON.parse(cached.value));
    }

    const userData = stmts.getData.get(req.user.id, 'profile');
    let floveeId = 'remi', aeName = 'softgirl';
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a, b) => b[1] - a[1])[0]?.[0] || 'softgirl';
        aeName = topAe;
        const aeMap = {kawaii:'lumi',softgirl:'vesper',cleangirl:'lumi',coquette:'vesper',goth:'nox',darkacad:'delara',grunge:'nox',y2k:'zola',street:'miro',cottage:'seraph',hippie:'seraph',oldmoney:'delara',preppy:'lumi',indie:'miro',emo:'nox'};
        floveeId = aeMap[topAe] || 'remi';
      } catch (e) {}
    }
    const f = FLOVEES[floveeId] || FLOVEES.remi;
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const letterPrompt = `You are ${f.name} — ${f.vibe}. Personality: ${f.personality}. Tone: ${f.tone}.\n\nWrite a short letter to your best friend (the user). This is like finding a folded note in your locker from your closest friend.\n\nRules:\n- 3-5 sentences max\n- Start casually ("hey," or "hi," — no name)\n- End with a sign-off like "${f.name} ${f.emoji}" or "— ${f.name}"\n- Be SPECIFIC — reference real things, real feelings, real moments\n- Match the ${timeOfDay} energy naturally\n- Make the reader feel SEEN, like this was written just for them\n- Sound like a REAL teen, not a greeting card\n- Output the letter text only`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': ANTHROPIC_API_KEY,'anthropic-version': '2023-06-01','Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 250,
        system: wrapSystemPrompt(letterPrompt),
        messages: [{ role: 'user', content: `Write a letter for ${timeOfDay}. Make it feel personal.` }],
      }),
    });
    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (!content) return res.status(500).json({ error: 'Failed to generate' });

    const letterOutputCheck = await checkOutputSafety(content, ANTHROPIC_API_KEY);
    if (!letterOutputCheck.safe) { content = letterOutputCheck.filtered; }

    const result = { floveeId, flovee: f.name, emoji: f.emoji, vibe: f.vibe, content, date: today };
    stmts.setData.run(req.user.id, 'flovee_letter_' + today, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('Flovee letter error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/roast', auth, async (req, res) => {
  try {
    const { outfitDescription } = req.body;
    if (!outfitDescription) return res.status(400).json({ error: 'Describe your outfit' });

    const roastInputCheck = checkInputSafety(outfitDescription);
    if (!roastInputCheck.safe) {
      return res.json({ floveeId: 'zola', flovee: 'Zola', emoji: '💀', vibe: 'chaos queen', roast: roastInputCheck.reason });
    }

    const userData = stmts.getData.get(req.user.id, 'profile');
    let floveeId = 'zola';
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a, b) => b[1] - a[1])[0]?.[0] || 'softgirl';
        const aeMap = {kawaii:'zola',softgirl:'nox',cleangirl:'zola',coquette:'nox',goth:'zola',darkacad:'nox',grunge:'zola',y2k:'nox',street:'zola',cottage:'nox',hippie:'zola',oldmoney:'nox',preppy:'zola',indie:'nox',emo:'zola'};
        floveeId = aeMap[topAe] || 'zola';
      } catch (e) {}
    }
    const f = FLOVEES[floveeId] || FLOVEES.zola;

    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const roastPrompt = `You are ${f.name} — ${f.vibe}. Personality: ${f.personality}. Tone: ${f.tone}.\n\nYour best friend just showed you their outfit and wants your honest opinion. ROAST IT (lovingly).\n\nRules:\n- Max 3-4 sentences\n- Be FUNNY but never actually mean — this is love language\n- One genuine compliment hidden in the chaos\n- Use gen-z language naturally (not forced)\n- End with a rating like "7/10 would steal" or "honestly iconic minus the shoes" or "serving but also suffering"\n- Make it feel like your best friend judging your fit before you leave the house\n- The roast should be SCREENSHOT-WORTHY — something they would post on their story\n- Output the roast only, nothing else`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': ANTHROPIC_API_KEY,'anthropic-version': '2023-06-01','Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: wrapSystemPrompt(roastPrompt),
        messages: [{ role: 'user', content: `Roast this outfit: ${outfitDescription}` }],
      }),
    });
    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (!content) return res.status(500).json({ error: 'Failed to generate' });

    const roastOutputCheck = await checkOutputSafety(content, ANTHROPIC_API_KEY);
    if (!roastOutputCheck.safe) { content = roastOutputCheck.filtered; }

    res.json({ floveeId, flovee: f.name, emoji: f.emoji, vibe: f.vibe, roast: content });
  } catch (err) {
    console.error('Flovee roast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
