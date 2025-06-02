const { OrderAPI } = require('../../../utils/api');

Page({
    data: {
        loading: true,
        loadingMore: false,
        activeTab: 0,
        tabs: ['全部', '待确认', '进行中', '已完成', '已取消'],
        buyerOrders: [],
        sellerOrders: [],
        displayOrders: [],
        page: 1,
        limit: 10,
        hasMore: true,
        isBuyerMode: true, // 买家模式或卖家模式
        userInfo: null, // 添加用户信息
        statusFilters: {
            0: '', // 全部
            1: 'pending', // 待确认
            2: 'accepted', // 进行中
            3: 'completed', // 已完成
            4: 'cancelled,rejected' // 已取消、已拒绝
        },
        // 调试标志
        debug: true
    },

    onLoad() {
        console.log('订单列表页加载');

        // 获取用户信息
        const userInfo = wx.getStorageSync('userInfo');
        console.log('当前用户信息:', userInfo);

        if (!userInfo) {
            console.warn('未找到用户信息');
            wx.showToast({
                title: '请先登录',
                icon: 'none'
            });
            setTimeout(() => {
                wx.navigateTo({
                    url: '/pages/auth/login/login'
                });
            }, 1500);
            return;
        }

        this.setData({
            userInfo,
            loading: true
        });

        // 清除可能存在的旧刷新标志
        wx.removeStorageSync('orderListNeedRefresh');

        // 直接加载订单数据
        this.setData({
            page: 1,
            hasMore: true,
            buyerOrders: [],
            sellerOrders: [],
            displayOrders: []
        });

        // 延迟加载，避免页面切换动画卡顿
        setTimeout(() => {
            this.loadOrders();
        }, 300);
    },

    onShow() {
        console.log('订单列表页显示');

        // 从缓存获取是否需要刷新标志
        const needRefresh = wx.getStorageSync('orderListNeedRefresh');
        if (needRefresh) {
            console.log('订单列表需要刷新');
            // 清除刷新标志
            wx.removeStorageSync('orderListNeedRefresh');

            // 重置数据并重新加载
            this.setData({
                page: 1,
                hasMore: true,
                buyerOrders: [],
                sellerOrders: [],
                displayOrders: []
            });
            this.loadOrders();
        } else {
            // 即使不需要强制刷新，也检查是否需要加载数据
            if (this.data.buyerOrders.length === 0 && this.data.sellerOrders.length === 0) {
                console.log('订单列表为空，初始加载数据');
                this.loadOrders();
            }
        }
    },

    onPullDownRefresh() {
        this.setData({
            page: 1,
            hasMore: true,
            buyerOrders: [],
            sellerOrders: [],
            displayOrders: []
        });
        this.loadOrders().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loadingMore) {
            this.loadMoreOrders();
        }
    },

    // 加载订单列表
    async loadOrders() {
        try {
            this.setData({ loading: true });

            // 并发加载买家和卖家订单
            const promises = [
                this.loadBuyerOrders(),
                this.loadSellerOrders()
            ];

            await Promise.all(promises).catch(error => {
                console.error('加载订单异常:', error);
            });

            console.log('加载订单完成 - 买家订单:', this.data.buyerOrders.length,
                '卖家订单:', this.data.sellerOrders.length);

            this.updateDisplayOrders();
        } catch (error) {
            console.error('加载订单失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // 加载更多订单
    async loadMoreOrders() {
        if (!this.data.hasMore || this.data.loadingMore) return;

        try {
            this.setData({
                loadingMore: true,
                page: this.data.page + 1
            });

            if (this.data.isBuyerMode) {
                await this.loadBuyerOrders();
            } else {
                await this.loadSellerOrders();
            }

            this.updateDisplayOrders();
        } catch (error) {
            console.error('加载更多订单失败:', error);
            this.setData({ page: this.data.page - 1 });
        } finally {
            this.setData({ loadingMore: false });
        }
    },

    // 加载买家订单
    async loadBuyerOrders() {
        try {
            const { page, limit, statusFilters, activeTab } = this.data;
            const status = statusFilters[activeTab];

            const params = {
                page,
                limit,
                status
            };

            console.log('请求买家订单参数:', params);
            const res = await OrderAPI.getBuyerOrders(params);
            console.log('买家订单响应:', res);

            // 调试API返回结构
            this.debugData('买家订单API响应', res);

            if (res.success) {
                let orders = [];

                if (page === 1) {
                    orders = res.data.orders || [];
                } else {
                    orders = [...this.data.buyerOrders, ...(res.data.orders || [])];
                }

                console.log('更新买家订单列表:', orders.length, '条记录');
                this.setData({
                    buyerOrders: orders,
                    hasMore: res.data.hasMore === true // 确保布尔值
                });
            } else {
                console.error('获取买家订单失败:', res.message);
                wx.showToast({
                    title: res.message || '加载失败',
                    icon: 'error'
                });
            }
        } catch (error) {
            console.error('加载买家订单出错:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
        }
    },

    // 加载卖家订单
    async loadSellerOrders() {
        try {
            const { page, limit, statusFilters, activeTab } = this.data;
            const status = statusFilters[activeTab];

            const params = {
                page,
                limit,
                status
            };

            console.log('请求卖家订单参数:', params);
            const res = await OrderAPI.getSellerOrders(params);
            console.log('卖家订单响应:', res);

            // 调试API返回结构
            this.debugData('卖家订单API响应', res);

            if (res.success) {
                let orders = [];

                if (page === 1) {
                    orders = res.data.orders || [];
                } else {
                    orders = [...this.data.sellerOrders, ...(res.data.orders || [])];
                }

                console.log('更新卖家订单列表:', orders.length, '条记录');
                this.setData({
                    sellerOrders: orders,
                    hasMore: res.data.hasMore === true // 确保布尔值
                });
            } else {
                console.error('获取卖家订单失败:', res.message);
                wx.showToast({
                    title: res.message || '加载失败',
                    icon: 'error'
                });
            }
        } catch (error) {
            console.error('加载卖家订单出错:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
        }
    },

    // 更新显示的订单列表
    updateDisplayOrders() {
        const { isBuyerMode, buyerOrders, sellerOrders } = this.data;
        this.setData({
            displayOrders: isBuyerMode ? buyerOrders : sellerOrders
        });
    },

    // 切换标签
    onTabChange(e) {
        const index = e.currentTarget.dataset.index;
        this.setData({
            activeTab: index,
            page: 1,
            hasMore: true,
            buyerOrders: [],
            sellerOrders: [],
            displayOrders: []
        });
        this.loadOrders();
    },

    // 切换买家/卖家模式
    toggleMode() {
        const isBuyerMode = !this.data.isBuyerMode;
        console.log('切换到', isBuyerMode ? '买家' : '卖家', '模式');

        this.setData({
            isBuyerMode: isBuyerMode,
            page: 1,
            hasMore: true
        });

        if (isBuyerMode && this.data.buyerOrders.length === 0) {
            // 如果买家订单为空，加载买家订单
            this.loadBuyerOrders().then(() => this.updateDisplayOrders());
        } else if (!isBuyerMode && this.data.sellerOrders.length === 0) {
            // 如果卖家订单为空，加载卖家订单
            this.loadSellerOrders().then(() => this.updateDisplayOrders());
        } else {
            // 否则直接更新显示
            this.updateDisplayOrders();
        }
    },

    // 进入订单详情
    goToOrderDetail(e) {
        const orderId = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/order/detail/detail?id=${orderId}`
        });
    },

    // 删除订单
    deleteOrder(e) {
        // 防止事件冒泡，避免触发goToOrderDetail
        e.stopPropagation();

        const orderId = e.currentTarget.dataset.id;
        console.log('点击删除订单按钮, ID:', orderId);

        if (!orderId) {
            console.error('删除订单失败: 没有获取到订单ID');
            return;
        }

        wx.showModal({
            title: '删除订单',
            content: '确定要删除此订单吗？删除后对方仍可查看该订单',
            confirmText: '删除',
            cancelText: '取消',
            success: async (res) => {
                if (res.confirm) {
                    console.log('确认删除订单:', orderId);
                    wx.showLoading({ title: '删除中...' });

                    try {
                        const result = await OrderAPI.delete(orderId);
                        console.log('删除订单API响应:', result);
                        wx.hideLoading();

                        if (result.success) {
                            wx.showToast({ title: '删除成功', icon: 'success' });

                            // 从本地列表中移除已删除的订单
                            const { buyerOrders, sellerOrders, isBuyerMode } = this.data;
                            const newBuyerOrders = buyerOrders.filter(o => o.id !== orderId);
                            const newSellerOrders = sellerOrders.filter(o => o.id !== orderId);

                            console.log('删除前:', isBuyerMode ? buyerOrders.length : sellerOrders.length,
                                '删除后:', isBuyerMode ? newBuyerOrders.length : newSellerOrders.length);

                            this.setData({
                                buyerOrders: newBuyerOrders,
                                sellerOrders: newSellerOrders,
                                displayOrders: isBuyerMode ? newBuyerOrders : newSellerOrders
                            });
                        } else {
                            console.error('删除订单失败:', result.message);
                            wx.showToast({
                                title: result.message || '删除失败',
                                icon: 'error'
                            });
                        }
                    } catch (error) {
                        wx.hideLoading();
                        console.error('删除订单请求异常:', error);
                        wx.showToast({
                            title: '网络错误，删除失败',
                            icon: 'error'
                        });
                    }
                } else {
                    console.log('取消删除订单');
                }
            },
            fail: (error) => {
                console.error('显示删除确认框失败:', error);
            }
        });
    },

    // 格式化时间
    formatTime(timeStr) {
        if (!timeStr) return '';

        const time = new Date(timeStr);
        const now = new Date();
        const diff = now.getTime() - time.getTime();

        const minute = 60 * 1000;
        const hour = minute * 60;
        const day = hour * 24;
        const month = day * 30;

        if (diff < minute) {
            return '刚刚';
        } else if (diff < hour) {
            return Math.floor(diff / minute) + '分钟前';
        } else if (diff < day) {
            return Math.floor(diff / hour) + '小时前';
        } else if (diff < month) {
            return Math.floor(diff / day) + '天前';
        } else {
            return time.toLocaleDateString();
        }
    },

    // 获取订单状态文本
    getStatusText(status) {
        const statusMap = {
            'pending': '待确认',
            'accepted': '已确认',
            'completed': '已完成',
            'cancelled': '已取消',
            'rejected': '已拒绝'
        };
        return statusMap[status] || '未知状态';
    },

    // 调试用，分析API返回的数据结构
    debugData(prefix, data) {
        if (!this.data.debug) return;

        console.log('===== DEBUG =====');
        console.log(`${prefix}:`, data);

        try {
            if (data && data.data) {
                console.log(`${prefix} 结构:`, {
                    hasOrders: !!data.data.orders,
                    ordersType: data.data.orders ? (Array.isArray(data.data.orders) ? 'Array' : typeof data.data.orders) : 'undefined',
                    ordersCount: data.data.orders && Array.isArray(data.data.orders) ? data.data.orders.length : 0,
                    hasMoreType: typeof data.data.hasMore,
                    hasMore: data.data.hasMore,
                    dataKeys: Object.keys(data.data)
                });

                if (data.data.orders && data.data.orders.length > 0) {
                    console.log(`${prefix} 第一条订单:`, {
                        id: data.data.orders[0].id,
                        productId: data.data.orders[0].productId,
                        status: data.data.orders[0].status,
                        hasProduct: !!data.data.orders[0].product,
                        hasBuyer: !!data.data.orders[0].buyer
                    });
                }
            }
        } catch (e) {
            console.error('调试数据分析错误:', e);
        }
        console.log('===============');
    },
}); 