const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// 配置头像上传
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../data/uploads/avatars');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const userId = req.user ? req.user.id : 'unknown';
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const filename = `avatar_${userId}_${timestamp}_${randomStr}${ext}`;
        cb(null, filename);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB限制
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件 (jpeg, jpg, png, gif)'));
        }
    }
});

const router = express.Router();

/**
 * 获取当前用户信息
 * GET /api/user/profile
 */
router.get('/profile', verifyToken, async (req, res) => {
    try {
        res.json({
            success: true,
            message: '获取用户信息成功',
            data: req.user
        });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({
            success: false,
            message: '获取用户信息失败'
        });
    }
});

/**
 * 更新用户资料
 * PUT /api/user/profile
 */
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const {
            nickname,
            avatar,
            campus,
            dormitory,
            contactInfo,
            realName,
            studentId
        } = req.body;

        const updateData = {};
        if (nickname) updateData.nickname = nickname;
        if (avatar) updateData.avatar = avatar;
        if (campus) updateData.campus = campus;
        if (dormitory) updateData.dormitory = dormitory;
        if (contactInfo) updateData.contactInfo = contactInfo;
        if (realName) updateData.realName = realName;
        if (studentId) updateData.studentId = studentId;

        const userModel = new User();
        const updatedUser = await userModel.updateProfile(req.user.id, updateData);

        res.json({
            success: true,
            message: '更新用户资料成功',
            data: updatedUser
        });

    } catch (error) {
        console.error('更新用户资料错误:', error);
        res.status(500).json({
            success: false,
            message: '更新用户资料失败'
        });
    }
});

/**
 * 获取用户公开信息
 * GET /api/user/:id/public
 */
router.get('/:id/public', async (req, res) => {
    try {
        const { id } = req.params;
        const userModel = new User();

        const user = await userModel.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        res.json({
            success: true,
            message: '获取用户公开信息成功',
            data: userModel.getPublicInfo(user)
        });

    } catch (error) {
        console.error('获取用户公开信息错误:', error);
        res.status(500).json({
            success: false,
            message: '获取用户公开信息失败'
        });
    }
});

/**
 * 搜索用户
 * GET /api/user/search
 */
router.get('/search', async (req, res) => {
    try {
        const { keyword, page = 1, limit = 10 } = req.query;

        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: '请提供搜索关键词'
            });
        }

        const userModel = new User();
        const result = await userModel.searchUsers(keyword, parseInt(page), parseInt(limit));

        res.json({
            success: true,
            message: '搜索用户成功',
            data: result
        });

    } catch (error) {
        console.error('搜索用户错误:', error);
        res.status(500).json({
            success: false,
            message: '搜索用户失败'
        });
    }
});

/**
 * 获取用户统计信息
 * GET /api/user/stats
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const Product = require('../models/Product');
        const productModel = new Product();

        // 获取用户的商品统计
        const myProducts = await productModel.findBySellerId(req.user.id);
        const availableProducts = myProducts.filter(p => p.status === 'available');
        const soldProducts = myProducts.filter(p => p.status === 'sold');

        const stats = {
            user: {
                creditScore: req.user.creditScore,
                totalTransactions: req.user.totalTransactions,
                successTransactions: req.user.successTransactions,
                sellCount: req.user.sellCount,
                buyCount: req.user.buyCount,
                favoriteCount: req.user.favoriteCount,
                isVerified: req.user.isVerified
            },
            products: {
                total: myProducts.length,
                available: availableProducts.length,
                sold: soldProducts.length,
                totalViews: myProducts.reduce((sum, p) => sum + (p.viewCount || 0), 0),
                totalFavorites: myProducts.reduce((sum, p) => sum + (p.favoriteCount || 0), 0)
            }
        };

        res.json({
            success: true,
            message: '获取用户统计信息成功',
            data: stats
        });

    } catch (error) {
        console.error('获取用户统计信息错误:', error);
        res.status(500).json({
            success: false,
            message: '获取用户统计信息失败'
        });
    }
});

/**
 * 上传用户头像
 * POST /api/user/upload-avatar
 */
router.post('/upload-avatar', verifyToken, avatarUpload.single('avatar'), async (req, res) => {
    try {
        console.log('=== 头像上传请求开始 ===');
        console.log('用户信息:', {
            userId: req.user?.id,
            nickname: req.user?.nickname,
            currentAvatar: req.user?.avatar
        });
        console.log('上传文件信息:', req.file ? {
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path
        } : null);

        if (!req.file) {
            console.log('错误: 没有上传文件');
            return res.status(400).json({
                success: false,
                message: '请选择要上传的头像文件'
            });
        }

        // 生成网络可访问的头像URL
        const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;
        console.log('生成的头像URL:', avatarUrl);

        // 更新用户头像信息
        const userModel = new User();
        console.log('准备更新用户头像，用户ID:', req.user.id);
        console.log('准备更新的数据:', { avatar: avatarUrl });

        try {
            const updatedUser = await userModel.updateProfile(req.user.id, { avatar: avatarUrl });
            console.log('用户头像更新成功:', {
                userId: updatedUser?.id,
                newAvatar: updatedUser?.avatar,
                updateTime: updatedUser?.updatedAt
            });

            res.json({
                success: true,
                message: '头像上传成功',
                data: {
                    url: avatarUrl,
                    user: updatedUser
                }
            });

        } catch (updateError) {
            console.error('更新用户数据失败:', updateError);
            // 即使数据库更新失败，文件已经上传成功，仍然返回成功
            // 但是在响应中提示数据更新失败
            res.json({
                success: true,
                message: '头像上传成功，但用户数据更新失败',
                data: {
                    url: avatarUrl,
                    updateError: updateError.message
                }
            });
        }

        console.log('=== 头像上传请求结束 ===');

    } catch (error) {
        console.error('头像上传错误:', error);
        res.status(500).json({
            success: false,
            message: '头像上传失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router; 