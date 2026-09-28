import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { config } from './config';

async function bootstrap() {
  // В режиме «сайт + API» (share, Docker) — без служебного шума Nest, только важное
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.serveWeb ? ['error', 'warn'] : undefined,
  });
  app.setGlobalPrefix('api');
  // доска с перепиской приходит целиком — стандартных 100 КБ мало
  app.useBodyParser('json', { limit: '6mb' });
  // в разработке сайт ходит через прокси Vite (/api); CORS — только для прямых запросов с localhost
  app.enableCors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] });
  // за прокси (Caddy на сервере, туннель) — настоящий адрес клиента из X-Forwarded-For.
  // Доверяем ровно одному звену (TRUST_PROXY, по умолчанию 1): адрес, дописанный прокси,
  // а не тот, что клиент подставил сам, — иначе защиту от перебора пароля легко обойти.
  app.set('trust proxy', config.trustProxy);
  // базовые заголовки безопасности: не угадывать тип файла, не встраивать сайт в чужие страницы
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Собранный сайт с этого же сервера: один адрес и для сайта, и для API (share, Docker)
  const index = join(config.webDist, 'index.html');
  const withWeb = config.serveWeb && existsSync(index);
  if (withWeb) {
    app.useStaticAssets(config.webDist, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(index);
    });
  } else if (config.serveWeb) {
    console.warn(`Сайт не собран (нет ${index}). Выполните: npm run build`);
  }

  await app.listen(config.port);
  const code = app.get(AuthService).code;
  console.log('');
  console.log(
    withWeb
      ? `Канбат: http://localhost:${config.port}`
      : `API: http://localhost:${config.port}/api/health`,
  );
  console.log(
    config.llmProvider === 'yandex'
      ? `ИИ: Yandex AI Studio, каталог ${config.yandexFolderId || 'не задан — YANDEX_FOLDER_ID'} (${config.llmModels.join(', ') || 'модель не задана — LLM_MODEL'})`
      : config.llmProvider === 'openai'
        ? `ИИ: ${config.llmBaseUrl} (${config.llmModel || 'модель не задана — LLM_MODEL'})`
        : `ИИ: Ollama ${config.ollamaUrl} (проверка: http://localhost:${config.port}/api/llm/status)`,
  );
  console.log(
    `Код входа для специалистов: ${code}${config.supportCode ? '' : ' (задать свой — SUPPORT_CODE в apps/api/.env)'}`,
  );
  console.log(
    `Код администратора организации: ${app.get(AuthService).admin}${config.adminCode ? '' : ' (задать свой — ADMIN_CODE в apps/api/.env)'}`,
  );
  console.log('');
}

void bootstrap();
