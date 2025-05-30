const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT密钥 - 生产环境应该使用环境变量
const JWT_SECRET = process.env.JWT_SECRET || 'campus-second-hand-platform-secret-key-2024';

// 生成JWT token
const generateToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            openid: user.openid,
            nickname: user.nickname
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// 验证JWT token
const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '未提供认证令牌'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userModel = new User();
        const user = await userModel.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户不存在'
            });
        }

        if (user.status === 'banned') {
            return res.status(403).json({
                success: false,
                message: '账户已被禁用'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: '无效的认证令牌'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: '认证令牌已过期'
            });
        }

        console.error('Token verification error:', error);
        return res.status(500).json({
            success: false,
            message: '认证验证失败'
        });
    }
};

// 可选认证中间件（不强制要求登录）
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userModel = new User();
        const user = await userModel.findById(decoded.userId);

        if (user && user.status !== 'banned') {
            req.user = user;
        } else {
            req.user = null;
        }

        next();
    } catch (error) {
        // 忽略错误，继续处理请求
        req.user = null;
        next();
    }
};

// 管理员权限验证
const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: '需要管理员权限'
        });
    }
    next();
};

module.exports = {
    generateToken,
    verifyToken,
    optionalAuth,
    requireAdmin,
    JWT_SECRET
}; 