const { ProductAPI } = require('../../utils/api');

Page({
    data: {
        popularProducts: [],
        categories: [],
        selectedCategory: '',
        loading: false,
        hasMore: true,
        currentPage: 1,
        pageSize: 10,
        pressedIndex: -1
    },

    onLoad() {
        this.loadData();
    },

    onShow() {
        // 每次显示页面时刷新数据
        this.refreshData();
    },

    onPullDownRefresh() {
        this.refreshData();
    },

    // 刷新数据
    refreshData() {
        this.setData({
            popularProducts: [],
            currentPage: 1,
            hasMore: true
        });
        this.loadData().finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    // 加载初始数据
    async loadData() {
        this.setData({ loading: true });

        try {
            // 并行加载数据
            const [popularRes, categoriesRes] = await Promise.all([
                ProductAPI.getPopular(this.data.pageSize, this.data.selectedCategory || undefined),
                ProductAPI.getCategories()
            ]);

            if (popularRes.success) {
                // 确保每个商品都有图片属性和卖家信息
                const popularProducts = popularRes.data.map(product => {
                    if (!product.images || product.images.length === 0) {
                        product.images = ['/assets/images/placeholder.png'];
                    }
                    if (!product.seller) {
                        product.seller = {
                            nickname: '匿名用户',
                            avatar: '/assets/images/default-avatar.png'
                        };
                    }
                    console.log('热门商品:', product.title, '图片:', product.images[0], '卖家:', product.seller.nickname);
                    return product;
                });

                this.setData({
                    popularProducts,
                    hasMore: popularProducts.length >= this.data.pageSize
                });
            }

            if (categoriesRes.success) {
                // 添加"全部"选项
                const allCategories = [
                    { name: '全部', value: '', count: categoriesRes.data.total || 0 },
                    ...categoriesRes.data.categories
                ];
                this.setData({ categories: allCategories });
            }

        } catch (error) {
            console.error('加载数据失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'none'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // 加载更多热门商品
    async loadMoreProducts() {
        if (this.data.loading || !this.data.hasMore) return;

        this.setData({ loading: true });

        try {
            const nextPage = this.data.currentPage + 1;

            // 获取下一页的热门商品
            const res = await ProductAPI.getList({
                page: nextPage,
                limit: this.data.pageSize,
                category: this.data.selectedCategory || undefined,
                sortBy: 'viewCount', // 按浏览量排序来模拟热门
                sortOrder: 'desc'
            });

            if (res.success && res.data.records.length > 0) {
                // 处理新加载的商品数据
                const newProducts = res.data.records.map(product => {
                    if (!product.images || product.images.length === 0) {
                        product.images = ['/assets/images/placeholder.png'];
                    }
                    if (!product.seller) {
                        product.seller = {
                            nickname: '匿名用户',
                            avatar: '/assets/images/default-avatar.png'
                        };
                    }
                    return product;
                });

                this.setData({
                    popularProducts: [...this.data.popularProducts, ...newProducts],
                    currentPage: nextPage,
                    hasMore: res.data.pagination.hasNextPage
                });
            } else {
                this.setData({ hasMore: false });
            }
        } catch (error) {
            console.error('加载更多失败:', error);
            wx.showToast({
                title: '加载更多失败',
                icon: 'none'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // 搜索栏点击
    onSearchTap() {
        wx.navigateTo({
            url: '/pages/product/list/list?search=true'
        });
    },

    // 分类点击
    async onCategoryTap(e) {
        const category = e.currentTarget.dataset.category;

        // 设置选中的分类
        this.setData({
            selectedCategory: category,
            popularProducts: [],
            currentPage: 1,
            hasMore: true
        });

        // 重新加载商品列表
        this.setData({ loading: true });

        try {
            const popularRes = await ProductAPI.getPopular(this.data.pageSize, category || undefined);

            if (popularRes.success) {
                const popularProducts = popularRes.data.map(product => {
                    if (!product.images || product.images.length === 0) {
                        product.images = ['/assets/images/placeholder.png'];
                    }
                    if (!product.seller) {
                        product.seller = {
                            nickname: '匿名用户',
                            avatar: '/assets/images/default-avatar.png'
                        };
                    }
                    return product;
                });

                this.setData({
                    popularProducts,
                    hasMore: popularProducts.length >= this.data.pageSize
                });
            }
        } catch (error) {
            console.error('筛选商品失败:', error);
            wx.showToast({
                title: '筛选失败',
                icon: 'none'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // 商品点击
    onProductTap(e) {
        const productId = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/product/detail/detail?id=${productId}`
        });
    },

    // 商品长按事件
    onProductLongPress(e) {
        const productId = e.currentTarget.dataset.id;
        const index = e.currentTarget.dataset.index;
        // 设置按下状态，保持动画
        this.setData({ pressedIndex: index });

        // 触觉反馈
        wx.vibrateShort({
            type: 'medium'
        });

        // 显示操作菜单
        wx.showActionSheet({
            itemList: ['查看详情', '分享商品', '收藏商品'],
            // 弹窗关闭后重置按下状态
            complete: () => this.setData({ pressedIndex: -1 }),
            success: (res) => {
                switch (res.tapIndex) {
                    case 0: // 查看详情
                        wx.navigateTo({
                            url: `/pages/product/detail/detail?id=${productId}`
                        });
                        break;
                    case 1: // 分享商品
                        this.shareProduct(productId);
                        break;
                    case 2: // 收藏商品
                        this.favoriteProduct(productId);
                        break;
                }
            }
        });
    },

    // 触摸开始
    onProductTouchStart(e) {
        // 这里可以添加触摸开始的处理逻辑
        console.log('触摸开始');
    },

    // 触摸结束
    onProductTouchEnd(e) {
        // 这里可以添加触摸结束的处理逻辑
        console.log('触摸结束');
    },

    // 分享商品
    shareProduct(productId) {
        wx.showToast({
            title: '分享功能开发中',
            icon: 'none'
        });
    },

    // 收藏商品
    favoriteProduct(productId) {
        wx.showToast({
            title: '收藏功能开发中',
            icon: 'none'
        });
    },

    // 跳转到发布页面
    goToPublish() {
        // 检查是否已登录
        const token = wx.getStorageSync('token');
        if (!token) {
            wx.showModal({
                title: '提示',
                content: '发布商品前请先登录',
                confirmText: '去登录',
                success(res) {
                    if (res.confirm) {
                        wx.navigateTo({
                            url: '/pages/auth/login/login'
                        });
                    }
                }
            });
            return;
        }

        wx.navigateTo({
            url: '/pages/product/publish/publish'
        });
    }
}); 