// 加载环境变量
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');
const messageRoutes = require('./routes/message');
const evaluationRoutes = require('./routes/evaluation');

const app = express();
const PORT = config.port;

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
fs.ensureDirSync(dataDir);
fs.ensureDirSync(path.join(dataDir, 'users'));
fs.ensureDirSync(path.join(dataDir, 'products'));
fs.ensureDirSync(path.join(dataDir, 'orders'));
fs.ensureDirSync(path.join(dataDir, 'messages'));
fs.ensureDirSync(path.join(dataDir, 'messages', 'images'));
fs.ensureDirSync(path.join(dataDir, 'messages', 'voices'));
fs.ensureDirSync(path.join(dataDir, 'evaluations'));
fs.ensureDirSync(path.join(dataDir, 'uploads'));
fs.ensureDirSync(path.join(dataDir, 'uploads', 'avatars'));
fs.ensureDirSync(path.join(dataDir, 'uploads', 'products'));

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'data/uploads')));
app.use('/avatars', express.static(path.join(__dirname, 'data/avatars')));
app.use('/products', express.static(path.join(__dirname, 'data/products')));
app.use('/messages/images', express.static(path.join(__dirname, 'data/messages/images')));
app.use('/messages/voices', express.static(path.join(__dirname, 'data/messages/voices')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/product', productRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/evaluation', evaluationRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: '校园二手交易平台服务正常运行' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: '服务器内部错误',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '接口不存在'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`校园二手交易平台服务器运行在端口 ${PORT}`);
    console.log(`本地访问: http://localhost:${PORT}`);
    console.log(`局域网访问: http://0.0.0.0:${PORT}`);
});

module.exports = app; 