const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

/**
 * 创建订单
 * POST /api/order/create
 */
router.post('/create', verifyToken, async (req, res) => {
    try {
        const {
            productId,
            tradeMethod,
            tradeLocation,
            contactInfo,
            message,
            buyerName,
            buyerPhone,
            buyerCampus,
            buyerAddress,
            paymentMethod,
            payAmount,
            buyerMessage
        } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: '商品ID不能为空'
            });
        }

        const productModel = new Product();
        const product = await productModel.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: '商品不存在'
            });
        }

        if (product.status !== 'available') {
            return res.status(400).json({
                success: false,
                message: '商品已下架或已售出'
            });
        }

        if (product.sellerId === req.user.id) {
            return res.status(400).json({
                success: false,
                message: '不能购买自己的商品'
            });
        }

        // 检查是否已有待处理订单
        const orderModel = new Order();
        const hasActiveOrder = await orderModel.hasActivOrder(productId);

        if (hasActiveOrder) {
            return res.status(400).json({
                success: false,
                message: '该商品已有待处理的订单'
            });
        }

        // 先更新商品状态为预订，确保原子性操作
        const updateResult = await productModel.updateStatus(productId, 'reserved');
        if (!updateResult) {
            return res.status(500).json({
                success: false,
                message: '更新商品状态失败'
            });
        }

        const orderData = {
            productId: product.id,
            sellerId: product.sellerId,
            buyerId: req.user.id,
            productTitle: product.title,
            productPrice: product.price,
            productImages: product.images,
            tradeMethod: tradeMethod || '面交',
            tradeLocation,
            contactInfo,
            message,
            buyerName,
            buyerPhone,
            buyerCampus,
            buyerAddress,
            paymentMethod,
            payAmount,
            buyerMessage
        };

        const order = await orderModel.createOrder(orderData);

        res.json({
            success: true,
            message: '订单创建成功',
            data: order
        });

    } catch (error) {
        console.error('创建订单错误:', error);
        res.status(500).json({
            success: false,
            message: '创建订单失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取我的订单列表（买家视角）
 * GET /api/order/my/buyer
 */
router.get('/my/buyer', verifyToken, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const orderModel = new Order();

        // 获取所有买家订单并根据状态过滤
        let orders = await orderModel.findByBuyerId(req.user.id);
        if (status) {
            const statusList = status.split(',');
            orders = orders.filter(order => statusList.includes(order.status));
        }

        // 分页
        const total = orders.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const records = orders.slice(startIndex, startIndex + parseInt(limit));

        // 获取卖家信息
        const userModel = new User();
        for (let order of records) {
            const seller = await userModel.findById(order.sellerId);
            if (seller) {
                order.seller = userModel.getPublicInfo(seller);
            }
        }

        res.json({
            success: true,
            message: '获取买家订单成功',
            data: {
                records,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalRecords: total
                }
            }
        });

    } catch (error) {
        console.error('获取买家订单错误:', error);
        res.status(500).json({
            success: false,
            message: '获取买家订单失败'
        });
    }
});

/**
 * 获取我的订单列表（卖家视角）
 * GET /api/order/my/seller
 */
router.get('/my/seller', verifyToken, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const orderModel = new Order();

        // 获取所有卖家订单并根据状态过滤
        let orders = await orderModel.findBySellerId(req.user.id);
        if (status) {
            const statusList = status.split(',');
            orders = orders.filter(order => statusList.includes(order.status));
        }

        // 分页
        const total = orders.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const records = orders.slice(startIndex, startIndex + parseInt(limit));

        // 获取买家信息
        const userModel = new User();
        for (let order of records) {
            const buyer = await userModel.findById(order.buyerId);
            if (buyer) {
                order.buyer = userModel.getPublicInfo(buyer);
            }
        }

        res.json({
            success: true,
            message: '获取卖家订单成功',
            data: {
                records,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalRecords: total
                }
            }
        });

    } catch (error) {
        console.error('获取卖家订单错误:', error);
        res.status(500).json({
            success: false,
            message: '获取卖家订单失败'
        });
    }
});

/**
 * 获取订单详情
 * GET /api/order/:id
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const orderModel = new Order();
        const userModel = new User();

        const order = await orderModel.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: '订单不存在'
            });
        }

        // 验证权限
        if (order.buyerId !== req.user.id && order.sellerId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: '无权限查看该订单'
            });
        }

        // 获取买家和卖家信息
        const buyer = await userModel.findById(order.buyerId);
        const seller = await userModel.findById(order.sellerId);

        if (buyer) order.buyer = userModel.getPublicInfo(buyer);
        if (seller) order.seller = userModel.getPublicInfo(seller);

        res.json({
            success: true,
            message: '获取订单详情成功',
            data: order
        });

    } catch (error) {
        console.error('获取订单详情错误:', error);
        res.status(500).json({
            success: false,
            message: '获取订单详情失败'
        });
    }
});

/**
 * 更新订单状态
 * PUT /api/order/:id/status
 */
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['accepted', 'rejected', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的订单状态'
            });
        }

        const orderModel = new Order();
        const order = await orderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: '订单不存在'
            });
        }

        // 权限验证
        let hasPermission = false;
        if (status === 'accepted' || status === 'rejected') {
            // 只有卖家可以接受或拒绝订单
            hasPermission = order.sellerId === req.user.id;
        } else if (status === 'completed') {
            // 买家和卖家都可以确认完成
            hasPermission = order.buyerId === req.user.id || order.sellerId === req.user.id;
        } else if (status === 'cancelled') {
            // 买家可以取消订单
            hasPermission = order.buyerId === req.user.id;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: '无权限执行此操作'
            });
        }

        // 状态流转验证
        if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'rejected') {
            return res.status(400).json({
                success: false,
                message: '订单已完成、已取消或已拒绝，无法修改状态'
            });
        }

        // 更新订单状态
        const updatedOrder = await orderModel.updateOrderStatus(id, status, req.user.id);

        // 更新商品状态
        const productModel = new Product();
        try {
            if (status === 'completed') {
                await productModel.updateStatus(order.productId, 'sold');

                // 更新用户信用分和交易计数
                const userModel = new User();
                await userModel.updateCreditScore(order.buyerId, 2, 'success');
                await userModel.updateCreditScore(order.sellerId, 2, 'success');
                await userModel.incrementCounter(order.buyerId, 'buy');
            } else if (status === 'rejected' || status === 'cancelled') {
                // 订单被拒绝或取消时，将商品状态恢复为可用
                await productModel.updateStatus(order.productId, 'available');
            }
        } catch (error) {
            console.error('更新商品状态失败:', error);
            // 继续执行，不影响订单状态更新
        }

        res.json({
            success: true,
            message: `订单${status === 'accepted' ? '已接受' :
                status === 'rejected' ? '已拒绝' :
                    status === 'completed' ? '已完成' : '已取消'}`,
            data: updatedOrder
        });

    } catch (error) {
        console.error('更新订单状态错误:', error);
        res.status(500).json({
            success: false,
            message: '更新订单状态失败'
        });
    }
});

/**
 * 获取订单统计
 * GET /api/order/stats
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const { type = 'buyer' } = req.query;
        const orderModel = new Order();

        const stats = await orderModel.getOrderStatistics(req.user.id, type);

        res.json({
            success: true,
            message: '获取订单统计成功',
            data: stats
        });

    } catch (error) {
        console.error('获取订单统计错误:', error);
        res.status(500).json({
            success: false,
            message: '获取订单统计失败'
        });
    }
});

/**
 * 删除订单
 * DELETE /api/order/:id
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const orderModel = new Order();
        const order = await orderModel.findById(id);
        if (!order) {
            return res.status(404).json({ success: false, message: '订单不存在' });
        }

        // 仅允许已取消或已拒绝的订单删除
        if (!['cancelled', 'rejected'].includes(order.status)) {
            return res.status(400).json({ success: false, message: '只有已取消或已拒绝的订单才能删除' });
        }

        // 权限验证：买家或卖家，确定用户类型
        let userType = '';
        if (order.buyerId === req.user.id) {
            userType = 'buyer';
        } else if (order.sellerId === req.user.id) {
            userType = 'seller';
        } else {
            return res.status(403).json({ success: false, message: '无权限删除此订单' });
        }

        // 执行软删除
        await orderModel.softDelete(id, req.user.id, userType);

        res.json({ success: true, message: '订单已删除' });
    } catch (error) {
        console.error('删除订单错误:', error);
        res.status(500).json({ success: false, message: '删除订单失败' });
    }
});

module.exports = router; 