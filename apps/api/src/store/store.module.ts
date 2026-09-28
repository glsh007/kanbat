import { Global, Module } from '@nestjs/common';
import { config } from '../config';
import { FileStorage } from './file-storage';
import { STORAGE, type Storage } from './types';

/**
 * Выбор хранилища по STORAGE. Сейчас — только file; PostgresStorage добавится с тем же
 * интерфейсом, когда Канбат переедет на сервер в интернете.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      useFactory: async (): Promise<Storage> => {
        const storage = new FileStorage(config.dataDir);
        await storage.init();
        return storage;
      },
    },
  ],
  exports: [STORAGE],
})
export class StoreModule {}
