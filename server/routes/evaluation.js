const express = require('express');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

/**
 * 提交评价（简化版本）
 * POST /api/evaluation/submit
 */
router.post('/submit', verifyToken, async (req, res) => {
    try {
        res.json({
            success: true,
            message: '评价提交成功（功能开发中）'
        });
    } catch (error) {
        console.error('提交评价错误:', error);
        res.status(500).json({
            success: false,
            message: '提交评价失败'
        });
    }
});

/**
 * 获取用户评价列表（简化版本）
 * GET /api/evaluation/user/:id
 */
router.get('/user/:id', async (req, res) => {
    try {
        res.json({
            success: true,
            message: '获取用户评价成功',
            data: {
                records: [],
                averageRating: 5.0,
                totalCount: 0
            }
        });
    } catch (error) {
        console.error('获取用户评价错误:', error);
        res.status(500).json({
            success: false,
            message: '获取用户评价失败'
        });
    }
});

module.exports = router;