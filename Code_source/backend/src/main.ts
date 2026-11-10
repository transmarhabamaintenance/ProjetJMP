import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { AddressInfo } from 'net';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

/** API et frontend sur un seul port : c'est ce que charge l'app desktop. */
function serveFrontend(app: NestExpressApplication, staticDir: string): void {
  const index = join(staticDir, 'index.html');
  if (!existsSync(index)) throw new Error(`JMP_STATIC_DIR introuvable : ${staticDir}`);
  app.useStaticAssets(staticDir, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Les GET sans extension sont des routes React ; les fichiers (.html, .js, .css) sont déjà servis.
    if (req.method !== 'GET' || req.path.startsWith('/api') || /\.[A-Za-z0-9]+$/.test(req.path)) return next();
    res.sendFile(index);
  });
}

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'warn', 'error'] });

  const origins = (process.env.JMP_CORS_ORIGINS ?? 'http://localhost:5173').split(',');
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 3600,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('JMP Planner API')
    .setDescription('Planification des livraisons de carburant à partir du programme Excel Shell')
    .setVersion('0.0.1')
    .addSecurity('bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger-ui.html', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const staticDir = process.env.JMP_STATIC_DIR;
  if (staticDir) serveFrontend(app, staticDir);

  const port = Number(process.env.SERVER_PORT ?? 8080);
  await app.listen(port);
  // SERVER_PORT=0 (app desktop) : le port réel est attribué par l'OS, le parent le lit ici.
  const address = app.getHttpServer().address() as AddressInfo | string;
  const boundPort = typeof address === 'object' && address ? address.port : port;
  new Logger().log(`JMP Planner (Node.js) démarré sur http://localhost:${boundPort}`);
  new Logger().log(`Swagger UI : http://localhost:${boundPort}/swagger-ui.html`);
  console.log(`JMP_PORT=${boundPort}`);
}

if (require.main === module) void bootstrap();
