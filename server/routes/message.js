const express = require('express');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

/**
 * 发送私信（简化版本）
 * POST /api/message/send
 */
router.post('/send', verifyToken, async (req, res) => {
    try {
        // 简化实现，仅返回成功响应
        res.json({
            success: true,
            message: '消息发送成功（功能开发中）'
        });
    } catch (error) {
        console.error('发送消息错误:', error);
        res.status(500).json({
            success: false,
            message: '发送消息失败'
        });
    }
});

/**
 * 获取消息列表（简化版本）
 * GET /api/message/list
 */
router.get('/list', verifyToken, async (req, res) => {
    try {
        res.json({
            success: true,
            message: '获取消息列表成功',
            data: {
                records: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalRecords: 0
                }
            }
        });
    } catch (error) {
        console.error('获取消息列表错误:', error);
        res.status(500).json({
            success: false,
            message: '获取消息列表失败'
        });
    }
});

module.exports = router; 