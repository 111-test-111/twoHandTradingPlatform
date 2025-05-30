// 服务器配置
const SERVER_IP = process.env.SERVER_IP || '192.168.10.34';
const SERVER_PORT = process.env.PORT || 3000;

module.exports = {
    // 服务器IP和端口配置
    serverIp: SERVER_IP,
    port: SERVER_PORT,

    // 服务器URL，用于生成图片完整路径
    serverUrl: `http://${SERVER_IP}:${SERVER_PORT}`,

    // 环境配置
    isDevelopment: process.env.NODE_ENV !== 'production',

    // 开发环境配置
    development: {
        // 延迟写入统计数据，避免频繁触发 nodemon 重启
        delayStatWrites: true,
        // 延迟时间（毫秒）
        statWriteDelay: 2000
    },

    // 上传文件配置
    uploads: {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxFiles: 9 // 最多9张图片
    }
}; 