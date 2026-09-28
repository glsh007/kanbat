// Запуск собранного Канбата одним сервером: сайт + API на одном порту (PORT, по умолчанию 3000).
// Так он работает и на вашем компьютере (npm run share), и на сервере / в Docker (npm start).
process.env.SERVE_WEB ??= '1';
await import('../apps/api/dist/main.js');
