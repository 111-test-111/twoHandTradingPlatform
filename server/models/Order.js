const BaseModel = require('./BaseModel');
const path = require('path');

class Order extends BaseModel {
    constructor() {
        super(path.join(__dirname, '../data/orders'));
    }

    // 创建订单
    async createOrder(orderData) {
        const order = {
            productId: orderData.productId,
            sellerId: orderData.sellerId,
            buyerId: orderData.buyerId,
            productTitle: orderData.productTitle,
            productPrice: orderData.productPrice,
            productImages: orderData.productImages,
            tradeMethod: orderData.tradeMethod || '面交',
            tradeLocation: orderData.tradeLocation || '',
            contactInfo: orderData.contactInfo || '',
            message: orderData.message || '', // 买家留言
            status: 'pending', // pending, accepted, rejected, completed, cancelled
            paymentStatus: 'unpaid', // unpaid, paid, refunded
            // 时间记录
            acceptedAt: null,
            completedAt: null,
            cancelledAt: null
        };

        return await this.create(order);
    }

    // 根据买家ID查找订单
    async findByBuyerId(buyerId, status = null) {
        const condition = { buyerId };
        if (status) {
            condition.status = status;
        }
        return await this.findWhere(condition);
    }

    // 根据卖家ID查找订单
    async findBySellerId(sellerId, status = null) {
        const condition = { sellerId };
        if (status) {
            condition.status = status;
        }
        return await this.findWhere(condition);
    }

    // 根据商品ID查找订单
    async findByProductId(productId) {
        return await this.findWhere({ productId });
    }

    // 更新订单状态
    async updateOrderStatus(orderId, status, userId) {
        const order = await this.findById(orderId);
        if (!order) {
            throw new Error('订单不存在');
        }

        const updateData = { status };
        const now = new Date().toISOString();

        switch (status) {
            case 'accepted':
                updateData.acceptedAt = now;
                break;
            case 'completed':
                updateData.completedAt = now;
                break;
            case 'cancelled':
            case 'rejected':
                updateData.cancelledAt = now;
                break;
        }

        return await this.update(orderId, updateData);
    }

    // 更新支付状态
    async updatePaymentStatus(orderId, paymentStatus) {
        return await this.update(orderId, { paymentStatus });
    }

    // 获取订单统计
    async getOrderStatistics(userId, userType = 'buyer') {
        const condition = userType === 'buyer' ? { buyerId: userId } : { sellerId: userId };
        const orders = await this.findWhere(condition);

        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            accepted: orders.filter(o => o.status === 'accepted').length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled' || o.status === 'rejected').length,
            totalAmount: orders
                .filter(o => o.status === 'completed')
                .reduce((sum, o) => sum + o.productPrice, 0)
        };

        return stats;
    }

    // 检查商品是否已有待处理订单
    async hasActivOrder(productId, excludeOrderId = null) {
        const activeOrders = await this.findWhere({
            productId,
            status: { $in: ['pending', 'accepted'] }
        });

        // 文件系统版本的简化逻辑
        const filtered = activeOrders.filter(order =>
            ['pending', 'accepted'].includes(order.status) &&
            (excludeOrderId ? order.id !== excludeOrderId : true)
        );

        return filtered.length > 0;
    }

    // 获取用户最近的订单
    async getRecentOrders(userId, userType = 'buyer', limit = 10) {
        const condition = userType === 'buyer' ? { buyerId: userId } : { sellerId: userId };
        const orders = await this.findWhere(condition);

        // 按创建时间排序
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return orders.slice(0, limit);
    }

    // 检查用户是否可以评价订单
    async canEvaluateOrder(orderId, userId) {
        const order = await this.findById(orderId);
        if (!order) {
            return false;
        }

        // 只有已完成的订单才能评价，且评价人必须是买家或卖家
        return order.status === 'completed' &&
            (order.buyerId === userId || order.sellerId === userId);
    }
}

module.exports = Order; 