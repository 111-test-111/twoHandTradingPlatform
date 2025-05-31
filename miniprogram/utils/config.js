// 配置文件 - 统一管理服务器地址和其他配置
// 只需要在这里修改IP地址，其他地方会自动使用这个配置

const config = {
    // 服务器IP配置 - 请根据实际情况修改此IP地址
    SERVER_IP: '49.235.51.115', // 49.235.51.115 | 192.168.10.34
    SERVER_PORT: 3000,

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

    // 开发配置
    DEBUG: true,

    // 请求超时配置
    REQUEST_TIMEOUT: 10000,

    // 文件上传配置
    UPLOAD: {
        MAX_SIZE: 5 * 1024 * 1024, // 5MB
        MAX_FILES: 9,
        ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif']
    }
};

// 冻结配置对象，防止意外修改
Object.freeze(config);

module.exports = config; 