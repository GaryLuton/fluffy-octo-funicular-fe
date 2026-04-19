const app = require('./app');
const { initDb } = require('../db');
const { PORT } = require('./config');

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stuflover backend running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
