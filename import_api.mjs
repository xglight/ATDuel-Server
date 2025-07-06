import Router from '@koa/router';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { readdirSync } from 'fs';

async function scan(router, import_apiDir) {
    // 获取当前文件目录
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const fullApiPath = resolve(currentDir, import_apiDir);

    console.log(`import_api: 扫描文件夹 ${fullApiPath}...`);
    let files;

    try {
        files = readdirSync(fullApiPath).filter(f => f.endsWith('.mjs'));
    } catch (err) {
        console.error(`import_api: 读取 API 目录失败: ${err.message}`);
        return;
    }

    for (let file of files) {
        try {
            // 计算文件路径
            const filePath = pathToFileURL(resolve(fullApiPath, file)).href;
            console.log(`import_api: 导入 ${filePath}...`);

            // 动态导入 API
            let { default: mapping } = await import(filePath);

            if (!mapping) {
                console.warn(`import_api: 警告 - ${file} 未导出默认对象`);
                continue;
            }

            // 注册路由
            for (let url in mapping) {
                if (url.startsWith('GET ')) {
                    let p = url.substring(4);
                    router.get(p, mapping[url]);
                    console.log(`import_api: 匹配到: GET ${p}`);
                } else if (url.startsWith('POST ')) {
                    let p = url.substring(5);
                    router.post(p, mapping[url]);
                    console.log(`import_api: 匹配到: POST ${p}`);
                } else {
                    console.warn(`import_api: 匹配失败: ${url}`);
                }
            }
        } catch (err) {
            console.error(`import_api: 导入 ${file} 失败: ${err.message}`);
        }
    }
}

// 默认扫描 `import_api` 目录
export default async function (app, import_apiDir = 'api') {
    const router = new Router();
    await scan(router, import_apiDir);

    // 将app实例传递给路由
    router.app = app;

    return router.routes();
}
