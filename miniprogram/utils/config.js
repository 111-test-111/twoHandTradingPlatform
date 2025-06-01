// 配置文件 - 统一管理服务器地址和其他配置
// 服务器IP地址现在由项目根目录的.env.local文件统一管理

// 服务器IP地址配置
// 这些值应该与.env.local中的配置一致
const SERVER_CONFIG = {
    // 生产环境IP
    PRODUCTION: '49.235.51.115',
    // 开发环境IP
    DEVELOPMENT: '192.168.10.34',
    // 服务器端口
    PORT: 3000
};

// 根据环境选择服务器IP
// 理想情况下应该从环境变量中读取，但小程序无法直接访问环境变量
// 因此这里手动设置，在实际部署时需要确保与.env.local一致
const IS_DEV = true; // process.env.DEPLOY_ENV !== 'production'

const config = {
    // 服务器IP配置
    SERVER_IP: IS_DEV ? SERVER_CONFIG.DEVELOPMENT : SERVER_CONFIG.PRODUCTION,
    SERVER_PORT: SERVER_CONFIG.PORT,

    // 根据上述配置自动生成的URL（无需手动修改）
    get SERVER_BASE_URL() {
        return `http://${this.SERVER_IP}:${this.SERVER_PORT}`;
    },

    get API_BASE_URL() {
        return `${this.SERVER_BASE_URL}/api`;
    },

    // 其他配置
    APP_NAME: '校园二手交易平台',
    VERSION: '1.0.0',

    // 开发配置，暂时保持真实环境DEBUG
    DEBUG: true,

    // 请求超时配置
    REQUEST_TIMEOUT: 10000,

    // 文件上传配置
    UPLOAD: {
        MAX_SIZE: 5 * 1024 * 1024, // 5MB
        MAX_FILES: 9,
        ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/jpg', 'image/webp']
    }
};

// 冻结配置对象，防止意外修改
Object.freeze(config);

module.exports = config; 