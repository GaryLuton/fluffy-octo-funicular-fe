const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');

const router = express.Router();

const VALID_GAME_IDS = new Set([
  'dti', 'ratethis', 'stylechallenge',
  'thisorthat', 'wouldyourather',
  'aestheticquiz', 'trivia',
]);

function checkAchievements(userId, gameId) {
  const newly = [];
  const tryUnlock = (code) => {
    const r = stmts.unlockAchievement.run(userId, code);
    if (r.changes > 0) newly.push(code);
  };
  tryUnlock('first_score');
  const overall = stmts.getUserBestOverall.get(userId);
  const top = (overall && overall.best) || 0;
  if (top >= 100) tryUnlock('score_100');
  if (top >= 500) tryUnlock('score_500');
  const distinct = stmts.countDistinctGamesPlayed.get(userId);
  if (distinct && distinct.n >= VALID_GAME_IDS.size) tryUnlock('played_all_games');
  const topRow = stmts.getTopScores.all(gameId, 1)[0];
  if (topRow && topRow.user_id === userId) tryUnlock('top_of_leaderboard');
  return newly;
}

router.post('/:id/score', auth, (req, res) => {
  const gameId = req.params.id;
  if (!VALID_GAME_IDS.has(gameId)) return res.status(400).json({ error: 'Unknown game' });
  const score = Number(req.body && req.body.score);
  if (!Number.isInteger(score) || score < 0 || score > 100000) {
    return res.status(400).json({ error: 'Invalid score' });
  }
  stmts.insertGameScore.run(req.user.id, gameId, score);
  const best = stmts.getUserBestScore.get(req.user.id, gameId);
  const unlocked = checkAchievements(req.user.id, gameId);
  res.json({ ok: true, best: (best && best.best) || score, unlocked });
});

router.get('/my-stats', auth, (req, res) => {
  const perGame = stmts.getUserBestPerGame.all(req.user.id);
  let totalPoints = 0;
  let totalRounds = 0;
  let topGame = null;
  perGame.forEach((row) => {
    totalPoints += row.best;
    totalRounds += row.plays;
    if (!topGame || row.best > topGame.score) {
      topGame = { game_id: row.game_id, score: row.best };
    }
  });
  const ach = stmts.countUserAchievements.get(req.user.id);
  res.json({
    total_points: totalPoints,
    games_played: perGame.length,
    total_rounds: totalRounds,
    top_game: topGame,
    achievements_unlocked: (ach && ach.n) || 0,
  });
});

router.get('/total-points-leaderboard', auth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
  const leaderboard = stmts.getTotalPointsLeaderboard.all(limit);
  res.json({ leaderboard });
});

router.get('/total-points-friends-leaderboard', auth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
  const leaderboard = stmts.getFriendsTotalPointsLeaderboard.all(req.user.id, limit);
  res.json({ leaderboard });
});

router.get('/:id/leaderboard', auth, (req, res) => {
  const gameId = req.params.id;
  if (!VALID_GAME_IDS.has(gameId)) return res.status(400).json({ error: 'Unknown game' });
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
  const leaderboard = stmts.getTopScores.all(gameId, limit);
  res.json({ leaderboard });
});

router.get('/:id/friends-leaderboard', auth, (req, res) => {
  const gameId = req.params.id;
  if (!VALID_GAME_IDS.has(gameId)) return res.status(400).json({ error: 'Unknown game' });
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
  const leaderboard = stmts.getFriendsTopScores.all(gameId, req.user.id, limit);
  res.json({ leaderboard });
});

router.get('/:id/my-scores', auth, (req, res) => {
  const gameId = req.params.id;
  if (!VALID_GAME_IDS.has(gameId)) return res.status(400).json({ error: 'Unknown game' });
  const scores = stmts.getUserScores.all(req.user.id, gameId);
  const best = stmts.getUserBestScore.get(req.user.id, gameId);
  res.json({ scores, best: (best && best.best) || 0 });
});

module.exports = router;
