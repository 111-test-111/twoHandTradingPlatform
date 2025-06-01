const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// 微信小程序配置 - 使用环境变量
const WECHAT_CONFIG = {
    appId: process.env.WECHAT_APP_ID,
    appSecret: process.env.WECHAT_APP_SECRET
};

// 检查微信配置是否存在
if (!WECHAT_CONFIG.appId || !WECHAT_CONFIG.appSecret) {
    console.error('警告: 未设置微信小程序 APP_ID 或 APP_SECRET，请在.env.local文件中配置');
}

/**
 * 微信登录
 * POST /api/auth/wechat-login
 */
router.post('/wechat-login', async (req, res) => {
    try {
        const { code, userInfo } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: '缺少微信授权码'
            });
        }

        // 调用微信API获取openid和session_key
        const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
            params: {
                appid: WECHAT_CONFIG.appId,
                secret: WECHAT_CONFIG.appSecret,
                js_code: code,
                grant_type: 'authorization_code'
            }
        });

        if (wxResponse.data.errcode) {
            return res.status(400).json({
                success: false,
                message: '微信登录失败：' + (wxResponse.data.errmsg || '未知错误')
            });
        }

        const { openid, session_key } = wxResponse.data;

        if (!openid) {
            return res.status(400).json({
                success: false,
                message: '获取微信用户信息失败'
            });
        }

        const userModel = new User();
        let user = await userModel.findByOpenid(openid);

        if (!user) {
            // 新用户注册
            const wechatUserInfo = {
                openid,
                nickName: userInfo?.nickName,
                avatarUrl: userInfo?.avatarUrl,
                gender: userInfo?.gender,
                city: userInfo?.city,
                province: userInfo?.province,
                country: userInfo?.country
            };

            user = await userModel.createUser(wechatUserInfo);
        } else {
            // 更新用户信息（但保护用户自定义头像）
            if (userInfo) {
                const updateData = {};
                if (userInfo.nickName) updateData.nickname = userInfo.nickName;

                // 只有在用户还没有自定义头像时，才使用微信头像
                // 自定义头像的特征：包含本地服务器地址
                const hasCustomAvatar = user.avatar && user.avatar.includes(req.get('host'));
                if (userInfo.avatarUrl && !hasCustomAvatar) {
                    updateData.avatar = userInfo.avatarUrl;
                }

                if (userInfo.city) updateData.city = userInfo.city;
                if (userInfo.province) updateData.province = userInfo.province;
                if (userInfo.country) updateData.country = userInfo.country;

                console.log('微信登录 - 用户信息更新:', {
                    userId: user.id,
                    currentAvatar: user.avatar,
                    hasCustomAvatar: hasCustomAvatar,
                    willUpdateAvatar: !!updateData.avatar,
                    updateData: updateData
                });

                if (Object.keys(updateData).length > 0) {
                    user = await userModel.update(user.id, updateData);
                }
            }
        }

        // 生成JWT token
        const token = generateToken(user);

        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                user: {
                    id: user.id,
                    nickname: user.nickname,
                    avatar: user.avatar,
                    campus: user.campus,
                    creditScore: user.creditScore,
                    isVerified: user.isVerified
                }
            }
        });

    } catch (error) {
        console.error('微信登录错误:', error);
        res.status(500).json({
            success: false,
            message: '登录失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 验证token有效性
 * GET /api/auth/verify
 */
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        message: 'Token有效',
        data: {
            user: {
                id: req.user.id,
                nickname: req.user.nickname,
                avatar: req.user.avatar,
                campus: req.user.campus,
                creditScore: req.user.creditScore,
                isVerified: req.user.isVerified
            }
        }
    });
});

/**
 * 刷新token
 * POST /api/auth/refresh
 */
router.post('/refresh', verifyToken, (req, res) => {
    try {
        const newToken = generateToken(req.user);

        res.json({
            success: true,
            message: 'Token刷新成功',
            data: {
                token: newToken
            }
        });
    } catch (error) {
        console.error('Token刷新错误:', error);
        res.status(500).json({
            success: false,
            message: 'Token刷新失败'
        });
    }
});

/**
 * 退出登录（前端删除token即可，这里仅做记录）
 * POST /api/auth/logout
 */
router.post('/logout', verifyToken, (req, res) => {
    // 在实际应用中，可以在这里记录退出日志
    res.json({
        success: true,
        message: '退出登录成功'
    });
});

module.exports = router; 