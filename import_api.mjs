import Router from '@koa/router';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { readdirSync } from 'fs';
import logger from './logger.mjs';

async function scan(router, import_apiDir) {
    // 获取当前文件目录
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const fullApiPath = resolve(currentDir, import_apiDir);

    logger.info(`import_api: Scanning folder ${fullApiPath}`);
    let files;

    try {
        files = readdirSync(fullApiPath).filter(f => f.endsWith('.mjs'));
    } catch (err) {
        logger.error(`import_api: Failed to read API directory: ${err.message}`);
        return;
    }

    for (let file of files) {
        try {
            // 计算文件路径
            const filePath = pathToFileURL(resolve(fullApiPath, file)).href;

            // 动态导入 API
            let { default: mapping } = await import(filePath);

            if (!mapping) {
                logger.warn(`import_api: ${file} does not export a default object`);
                continue;
            }

            // 注册路由
            for (let url in mapping) {
                if (url.startsWith('GET ')) {
                    let p = url.substring(4);
                    router.get(p, mapping[url]);
                    logger.debug(`import_api: Matched: GET ${p}`);
                } else if (url.startsWith('POST ')) {
                    let p = url.substring(5);
                    router.post(p, mapping[url]);
                    logger.debug(`import_api: Matched: POST ${p}`);
                } else {
                    logger.warn(`import_api: Match failed: ${url}`);
                }
            }
        } catch (err) {
            logger.error(`import_api: Failed to import ${file}: ${err.message}`);
        }
    }
}

// 默认扫描 `import_api` 目录
export default async function (app, import_apiDir = 'api', prefix = '') {
    const router = new Router({ prefix });
    await scan(router, import_apiDir);

    // 将app实例传递给路由
    router.app = app;
    logger.info(`import_api: Route registration completed`);
    return router.routes();
}
