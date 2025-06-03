### 基于微信小程序的二手交易平台

#### 技术栈
##### 前端
JS + Sass（小程序模板）
##### 后端
nodejs（后期接入 Python）

#### 数据配置
- 未使用微信云服务，数据本地存储为 JSON
- 后期迁移到数据库
    - mysql 存储列表信息
    - mongodb 存储聊天信息、图片信息
    - 接入 redis 缓存

#### 环境配置

项目使用`.env.local`文件管理服务器配置，包括IP地址、端口以及微信小程序配置等信息。

##### 设置步骤

1. 在项目根目录创建或编辑`.env.local`文件
2. 配置模板在`.env.example`中

##### 配置说明

- `SERVER_IP`: 服务器IP地址，默认为127.0.0.1
- `SERVER_PORT`: 服务器端口，默认为3000
- `NODE_ENV`: 环境设置，可选值为development或production
- `WECHAT_APP_ID`: 微信小程序的AppID
- `WECHAT_APP_SECRET`: 微信小程序的AppSecret
- `DEPLOY_ENV`: 部署环境，影响服务器IP选择，可选值为development或production

**注意**：
1. 小程序端无法直接读取.env文件，需要在`miniprogram/utils/config.js`中手动同步环境配置
2. 发布生产环境前，请确保将`miniprogram/utils/config.js`中的`IS_DEV`设置为false或根据`DEPLOY_ENV`判断