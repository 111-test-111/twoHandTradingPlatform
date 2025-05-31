const { UserAPI, ProductAPI, OrderAPI } = require('../../../utils/api');
const app = getApp();

Page({
    data: {
        userInfo: null,
        isLogin: false,
        loading: true,

        // 统计数据
        stats: {
            user: {
                creditScore: 0,
                totalTransactions: 0,
                successTransactions: 0,
                sellCount: 0,
                buyCount: 0,
                favoriteCount: 0,
                isVerified: false
            },
            products: {
                total: 0,
                available: 0,
                sold: 0,
                totalViews: 0,
                totalFavorites: 0
            }
        },

        // 我的商品
        myProducts: [],
        productLoading: false,
        productPage: 1,
        productHasMore: true,

        // 当前选中的标签
        activeTab: 'published', // published, bought, favorites

        // 订单相关
        recentOrders: [],

        // UI状态
        refreshing: false,

        // 缓存控制
        lastFromPage: '', // 记录上一个页面路径
        dataLoadedAt: 0,  // 数据加载时间戳
        cacheExpireTime: 5 * 60 * 1000 // 缓存5分钟过期
    },

    onLoad() {
        console.log('用户资料页面');
        this.checkLoginAndLoadData();
    },

    onShow() {
        // 智能刷新逻辑
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        const prevPage = pages.length > 1 ? pages[pages.length - 2] : null;

        let shouldRefresh = false;

        // 判断是否需要刷新数据
        if (!this.data.dataLoadedAt) {
            // 首次进入，必须加载
            shouldRefresh = true;
            console.log('首次进入，需要加载数据');
        } else if (Date.now() - this.data.dataLoadedAt > this.data.cacheExpireTime) {
            // 缓存过期，需要刷新
            shouldRefresh = true;
            console.log('缓存过期，需要刷新数据');
        } else if (prevPage) {
            const fromPagePath = prevPage.route;

            // 从商品详情页返回，不刷新（利用缓存）
            if (fromPagePath.includes('product/detail')) {
                shouldRefresh = false;
                console.log('从商品详情页返回，使用缓存数据');
            }
            // 从发布页面返回，需要刷新（可能有新商品）
            else if (fromPagePath.includes('product/publish')) {
                shouldRefresh = true;
                console.log('从发布页面返回，需要刷新数据');
            }
            // 从其他页面进入，检查是否是同一个tab切换
            else if (fromPagePath !== this.data.lastFromPage) {
                shouldRefresh = true;
                console.log('从其他页面进入，需要刷新数据');
            }

            // 记录当前来源页面
            this.setData({
                lastFromPage: fromPagePath
            });
        }

        if (shouldRefresh) {
            this.checkLoginAndLoadData();
        } else {
            console.log('使用缓存数据，不重新加载');
        }
    },

    // 下拉刷新
    onPullDownRefresh() {
        this.refreshData();
    },

    // 上拉加载更多
    onReachBottom() {
        if (this.data.activeTab === 'published') {
            this.loadMoreProducts();
        }
    },

    // 检查登录状态并加载数据
    async checkLoginAndLoadData() {
        try {
            let isLogin = app.globalData.isLogin;
            let userInfo = app.globalData.userInfo;

            // 如果全局数据中没有用户信息，尝试从本地存储恢复
            if (!userInfo) {
                const localUserInfo = wx.getStorageSync('userInfo');
                const token = wx.getStorageSync('token');

                if (localUserInfo && token) {
                    userInfo = localUserInfo;
                    isLogin = true;
                    // 更新全局数据
                    app.globalData.userInfo = userInfo;
                    app.globalData.isLogin = true;
                }
            }

            this.setData({
                isLogin: isLogin,
                userInfo: userInfo
            });

            if (isLogin) {
                await this.loadUserData();
            } else {
                this.setData({ loading: false });
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
            this.setData({ loading: false });
        }
    },

    // 加载用户数据
    async loadUserData() {
        try {
            this.setData({ loading: true });

            // 并行加载多个数据
            const promises = [
                this.loadUserStats(),
                this.loadMyProducts(),
                this.loadRecentOrders()
            ];

            await Promise.all(promises);

        } catch (error) {
            console.error('加载用户数据失败:', error);
            wx.showToast({
                title: '加载数据失败',
                icon: 'none'
            });
        } finally {
            this.setData({
                loading: false,
                dataLoadedAt: Date.now() // 更新数据加载时间戳
            });
            wx.stopPullDownRefresh();
        }
    },

    // 加载用户统计信息
    async loadUserStats() {
        try {
            const res = await UserAPI.getStats();
            if (res.success) {
                this.setData({
                    stats: res.data
                });
            }
        } catch (error) {
            console.error('加载用户统计失败:', error);
        }
    },

    // 加载我的商品
    async loadMyProducts(reset = true) {
        if (this.data.productLoading) return;

        try {
            this.setData({ productLoading: true });

            const page = reset ? 1 : this.data.productPage;
            // 发布列表不再过滤状态，显示所有商品
            const res = await ProductAPI.getMyProducts({
                page: page,
                limit: 10
            });

            if (res.success) {
                const newProducts = res.data.records || [];

                // 确保每个商品都有图片
                const processedProducts = newProducts.map(product => {
                    if (!product.images || product.images.length === 0) {
                        product.images = ['/assets/images/placeholder.png'];
                    }
                    // 格式化创建时间
                    if (product.createdAt) {
                        const date = new Date(product.createdAt);
                        product.createdAt = `${date.getMonth() + 1}月${date.getDate()}日`;
                    }
                    return product;
                });

                const myProducts = reset ? processedProducts : [...this.data.myProducts, ...processedProducts];

                this.setData({
                    myProducts: myProducts,
                    productPage: page + 1,
                    productHasMore: newProducts.length >= 10
                });

                console.log('已加载商品数量:', myProducts.length);
            }
        } catch (error) {
            console.error('加载我的商品失败:', error);
        } finally {
            this.setData({ productLoading: false });
        }
    },

    // 加载最近订单
    async loadRecentOrders() {
        try {
            // 加载最近的买家订单和卖家订单
            const [buyerRes, sellerRes] = await Promise.all([
                OrderAPI.getBuyerOrders({ page: 1, limit: 3 }),
                OrderAPI.getSellerOrders({ page: 1, limit: 3 })
            ]);

            const recentOrders = [];

            if (buyerRes.success) {
                recentOrders.push(...buyerRes.data.orders.map(order => ({
                    ...order,
                    type: 'buy'
                })));
            }

            if (sellerRes.success) {
                recentOrders.push(...sellerRes.data.orders.map(order => ({
                    ...order,
                    type: 'sell'
                })));
            }

            // 按时间排序，取最近的5个
            recentOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            this.setData({
                recentOrders: recentOrders.slice(0, 5)
            });

        } catch (error) {
            console.error('加载最近订单失败:', error);
        }
    },

    // 刷新数据
    async refreshData() {
        this.setData({ refreshing: true });
        // 手动刷新时强制重新加载，重置时间戳
        this.setData({ dataLoadedAt: 0 });
        await this.loadUserData();
        this.setData({ refreshing: false });
    },

    // 加载更多商品
    async loadMoreProducts() {
        if (!this.data.productHasMore || this.data.productLoading) return;
        await this.loadMyProducts(false);
    },

    // 切换标签
    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({
            activeTab: tab
        });

        // 根据标签加载不同数据
        switch (tab) {
            case 'published':
                this.loadMyProducts(true);
                break;
            case 'bought':
                this.loadBoughtProducts();
                break;
            case 'favorites':
                this.loadFavoriteProducts();
                break;
        }
    },

    // 加载已购买的商品
    async loadBoughtProducts() {
        try {
            const res = await OrderAPI.getBuyerOrders({ page: 1, limit: 20 });
            if (res.success) {
                this.setData({
                    myProducts: res.data.orders || []
                });
            }
        } catch (error) {
            console.error('加载已购买商品失败:', error);
        }
    },

    // 加载收藏的商品
    async loadFavoriteProducts() {
        // 这里需要根据你的后端API实现
        wx.showToast({
            title: '功能开发中',
            icon: 'none'
        });
    },

    // 跳转到设置页面
    goToSettings() {
        wx.navigateTo({
            url: '/pages/user/settings/settings'
        });
    },

    // 跳转到登录页面
    goToLogin() {
        wx.navigateTo({
            url: '/pages/auth/login/login'
        });
    },

    // 查看商品详情
    viewProduct(e) {
        const productId = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/product/detail/detail?id=${productId}`
        });
    },

    // 编辑商品
    editProduct(e) {
        const productId = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/product/publish/publish?id=${productId}`
        });
    },

    // 删除商品
    deleteProduct(e) {
        const productId = e.currentTarget.dataset.id;
        const productTitle = e.currentTarget.dataset.title;

        wx.showModal({
            title: '确认删除',
            content: `确定要删除商品"${productTitle}"吗？`,
            success: async (res) => {
                if (res.confirm) {
                    try {
                        const result = await ProductAPI.delete(productId);
                        if (result.success) {
                            wx.showToast({
                                title: '删除成功',
                                icon: 'success'
                            });
                            // 刷新商品列表
                            this.loadMyProducts(true);
                            this.loadUserStats();
                        }
                    } catch (error) {
                        console.error('删除商品失败:', error);
                        wx.showToast({
                            title: '删除失败',
                            icon: 'none'
                        });
                    }
                }
            }
        });
    },

    // 查看订单详情
    viewOrder(e) {
        const orderId = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/order/detail/detail?id=${orderId}`
        });
    },

    // 查看所有订单
    viewAllOrders() {
        wx.navigateTo({
            url: '/pages/order/list/list'
        });
    },

    // 发布商品
    publishProduct() {
        if (!this.data.isLogin) {
            this.goToLogin();
            return;
        }

        console.log('跳转到发布商品页面');
        // 由于发布页面为 tabBar，需要使用 switchTab
        wx.switchTab({
            url: '/pages/product/publish/publish'
        });
    },

    // 查看消息
    viewMessages() {
        if (!this.data.isLogin) {
            this.goToLogin();
            return;
        }

        wx.navigateTo({
            url: '/pages/message/list/list'
        });
    },

    // 预览头像
    previewAvatar() {
        if (this.data.userInfo && this.data.userInfo.avatar) {
            wx.previewImage({
                urls: [this.data.userInfo.avatar]
            });
        }
    },

    // 分享页面
    onShareAppMessage() {
        // 替换可选链表达式，使用兼容写法
        const nickname = this.data.userInfo && this.data.userInfo.nickname ? this.data.userInfo.nickname : '用户';
        const userId = this.data.userInfo && this.data.userInfo.id ? this.data.userInfo.id : '';
        const avatarUrl = this.data.userInfo && this.data.userInfo.avatar ? this.data.userInfo.avatar : '';
        return {
            title: nickname + '的个人主页',
            path: '/pages/user/profile/profile?userId=' + userId,
            imageUrl: avatarUrl
        };
    }
}); 