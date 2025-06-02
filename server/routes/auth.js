const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const { generateToken, verifyToken } = require('../middleware/auth');
const locationService = require('../utils/location');

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

        // 获取客户端IP地址
        const clientIP = locationService.getRealIP(req);
        console.log('=== 用户登录IP定位开始 ===');
        console.log('客户端IP:', clientIP);
        console.log('请求头完整信息:', {
            'host': req.headers.host,
            'user-agent': req.headers['user-agent'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'cf-connecting-ip': req.headers['cf-connecting-ip'],
            'true-client-ip': req.headers['true-client-ip'],
            'x-client-ip': req.headers['x-client-ip'],
            'forwarded': req.headers.forwarded,
            'remote-address': req.connection.remoteAddress
        });

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

        // 获取IP位置信息
        console.log('开始调用IP定位服务...');
        let locationInfo = null;
        try {
            locationInfo = await locationService.getLocationByIP(clientIP);
            console.log('IP定位服务调用完成');
            console.log('IP定位结果:', JSON.stringify(locationInfo, null, 2));
        } catch (error) {
            console.error('IP定位服务调用异常:', error);
        }

        if (!locationInfo) {
            console.log('⚠️ IP定位失败，将使用微信地区信息或默认值');
        } else {
            console.log('✅ IP定位成功，位置信息:', {
                country: locationInfo.country,
                province: locationInfo.province,
                city: locationInfo.city,
                source: locationInfo.source
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
                // 优先使用IP定位的地理信息，其次使用微信信息
                city: locationInfo?.city || userInfo?.city,
                province: locationInfo?.province || userInfo?.province,
                country: locationInfo?.country || userInfo?.country
            };

            user = await userModel.createUser(wechatUserInfo);

            console.log('新用户注册完成，地理信息:', {
                userId: user.id,
                ipLocation: locationInfo,
                wechatLocation: {
                    city: userInfo?.city,
                    province: userInfo?.province,
                    country: userInfo?.country
                },
                finalLocation: {
                    city: user.city,
                    province: user.province,
                    country: user.country
                }
            });
        } else {
            // 更新用户信息（但保护用户自定义头像）
            if (userInfo || locationInfo) {
                const updateData = {};

                // 更新微信信息
                if (userInfo) {
                    if (userInfo.nickName) updateData.nickname = userInfo.nickName;

                    // 只有在用户还没有自定义头像时，才使用微信头像
                    const hasCustomAvatar = user.avatar && user.avatar.includes(req.get('host'));
                    if (userInfo.avatarUrl && !hasCustomAvatar) {
                        updateData.avatar = userInfo.avatarUrl;
                    }
                }

                // 更新地理位置信息（每次登录都使用最新的IP定位）
                if (locationInfo) {
                    // 每次登录都更新IP定位的地理信息
                    if (locationInfo.city) {
                        updateData.city = locationInfo.city;
                    }
                    if (locationInfo.province) {
                        updateData.province = locationInfo.province;
                    }
                    if (locationInfo.country) {
                        updateData.country = locationInfo.country;
                    }
                } else if (userInfo) {
                    // 如果IP定位失败，使用微信信息作为备用
                    if (userInfo.city) updateData.city = userInfo.city;
                    if (userInfo.province) updateData.province = userInfo.province;
                    if (userInfo.country) updateData.country = userInfo.country;
                }

                console.log('用户登录 - 信息更新:', {
                    userId: user.id,
                    ipLocation: locationInfo,
                    wechatLocation: userInfo ? {
                        city: userInfo.city,
                        province: userInfo.province,
                        country: userInfo.country
                    } : null,
                    currentLocation: {
                        city: user.city,
                        province: user.province,
                        country: user.country
                    },
                    updateData: updateData
                });

                if (Object.keys(updateData).length > 0) {
                    user = await userModel.update(user.id, updateData);
                }
            }
        }

        // 生成JWT token
        const token = generateToken(user);

        // 返回完整用户信息，确保客户端可以持久化显示各字段
        const { id, nickname, avatar, gender, city, province, country,
            phone, realName, studentId, campus, dormitory, contactInfo,
            creditScore, totalTransactions, successTransactions,
            sellCount, buyCount, favoriteCount, isVerified, userId } = user;
        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                user: {
                    id, nickname, avatar, gender, city, province, country,
                    phone, realName, studentId, campus, dormitory, contactInfo,
                    creditScore, totalTransactions, successTransactions,
                    sellCount, buyCount, favoriteCount, isVerified, userId
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
    // 返回完整用户信息，确保客户端全局数据完整
    const u = req.user;
    const { id, nickname, avatar, gender, city, province, country,
        phone, realName, studentId, campus, dormitory, contactInfo,
        creditScore, totalTransactions, successTransactions,
        sellCount, buyCount, favoriteCount, isVerified, userId } = u;
    res.json({
        success: true,
        message: 'Token有效',
        data: {
            user: {
                id, nickname, avatar, gender, city, province, country,
                phone, realName, studentId, campus, dormitory, contactInfo,
                creditScore, totalTransactions, successTransactions,
                sellCount, buyCount, favoriteCount, isVerified, userId
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
 * 测试IP定位功能
 * GET /api/auth/test-location
 */
router.get('/test-location', async (req, res) => {
    try {
        const testIP = req.query.ip || locationService.getRealIP(req);

        console.log('=== IP定位测试开始 ===');
        console.log('测试IP:', testIP);
        console.log('IP类型:', locationService.getIPType(testIP));
        console.log('请求头完整信息:', {
            'host': req.headers.host,
            'user-agent': req.headers['user-agent'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'cf-connecting-ip': req.headers['cf-connecting-ip'],
            'true-client-ip': req.headers['true-client-ip'],
            'x-client-ip': req.headers['x-client-ip'],
            'forwarded': req.headers.forwarded,
            'remote-address': req.connection.remoteAddress
        });

        const locationInfo = await locationService.getLocationByIP(testIP);

        res.json({
            success: true,
            message: 'IP定位测试完成',
            data: {
                testIP: testIP,
                ipType: locationService.getIPType(testIP),
                location: locationInfo,
                apiKeyConfigured: !!process.env.TENCENT_MAP_KEY,
                apiKeyPrefix: process.env.TENCENT_MAP_KEY ? process.env.TENCENT_MAP_KEY.substring(0, 8) + '...' : '未配置',
                requestHeaders: {
                    'x-forwarded-for': req.headers['x-forwarded-for'],
                    'x-real-ip': req.headers['x-real-ip'],
                    'cf-connecting-ip': req.headers['cf-connecting-ip'],
                    'remote-address': req.connection.remoteAddress &&
                        (req.connection.remoteAddress.indexOf('::ffff:') === 0 ?
                            req.connection.remoteAddress.substring(7) :
                            req.connection.remoteAddress)
                }
            }
        });

    } catch (error) {
        console.error('IP定位测试失败:', error);
        res.status(500).json({
            success: false,
            message: 'IP定位测试失败',
            error: error.message
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

/**
 * 更新用户地理位置
 * POST /api/auth/update-location
 */
router.post('/update-location', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 获取客户端IP地址
        const clientIP = locationService.getRealIP(req);
        console.log('=== 更新位置信息 IP定位开始 ===');
        console.log('客户端IP:', clientIP);
        console.log('请求头完整信息:', {
            'host': req.headers.host,
            'user-agent': req.headers['user-agent'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'cf-connecting-ip': req.headers['cf-connecting-ip'],
            'true-client-ip': req.headers['true-client-ip'],
            'x-client-ip': req.headers['x-client-ip'],
            'forwarded': req.headers.forwarded,
            'remote-address': req.connection.remoteAddress
        });

        // 获取IP位置信息
        console.log('开始调用IP定位服务...');
        let locationInfo = null;
        try {
            locationInfo = await locationService.getLocationByIP(clientIP);
            console.log('IP定位服务调用完成');
            console.log('IP定位结果:', JSON.stringify(locationInfo, null, 2));
        } catch (error) {
            console.error('IP定位服务调用异常:', error);
        }

        if (!locationInfo) {
            console.log('⚠️ IP定位失败，无法更新位置信息');
            return res.status(400).json({
                success: false,
                message: 'IP定位失败，无法更新位置信息'
            });
        }

        console.log('✅ IP定位成功，位置信息:', {
            country: locationInfo.country,
            province: locationInfo.province,
            city: locationInfo.city,
            source: locationInfo.source
        });

        // 更新用户地理位置信息
        const userModel = new User();
        const updateData = {
            city: locationInfo.city,
            province: locationInfo.province,
            country: locationInfo.country
        };

        const user = await userModel.update(userId, updateData);

        console.log('用户位置信息更新成功:', {
            userId: user.id,
            location: {
                city: user.city,
                province: user.province,
                country: user.country
            }
        });

        res.json({
            success: true,
            message: '位置信息更新成功',
            data: {
                user: user
            }
        });

    } catch (error) {
        console.error('更新用户位置信息失败:', error);
        res.status(500).json({
            success: false,
            message: '更新位置信息失败',
            error: error.message
        });
    }
});

module.exports = router; 