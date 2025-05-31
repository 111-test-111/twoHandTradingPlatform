const { ProductAPI } = require('../../../utils/api');

Page({
    data: {
        products: [],
        keyword: '',
        showSearch: false,
        loading: false,
        refreshing: false,
        hasMore: true,
        page: 1,
        limit: 10,
        currentFilter: '',
        pressedIndex: -1
    },

    onLoad(options) {
        if (options.search || options.keyword) {
            this.setData({
                showSearch: true,
                keyword: options.keyword || ''
            });
        }

        wx.setNavigationBarTitle({
            title: options.title || '商品列表'
        });

        this.loadProducts();
    },

    onShow() {
        // 删除自动刷新
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadMoreProducts();
        }
    },

    onRefresh() {
        this.setData({ refreshing: true });
        this.refreshData().finally(() => {
            this.setData({ refreshing: false });
        });
    },

    onPullDownRefresh() {
        this.refreshData().finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    async refreshData() {
        this.setData({
            page: 1,
            products: [],
            hasMore: true
        });
        await this.loadProducts();
    },

    async loadProducts() {
        if (this.data.loading) return;

        this.setData({ loading: true });

        try {
            const res = await ProductAPI.getList({
                page: this.data.page,
                limit: this.data.limit,
                keyword: this.data.keyword || undefined
            });

            console.log('商品列表API响应:', res);

            if (res.success) {
                const newProducts = res.data.records || res.data || [];

                this.setData({
                    products: this.data.page === 1 ? newProducts : [...this.data.products, ...newProducts],
                    hasMore: res.data.pagination ? res.data.pagination.hasNextPage : newProducts.length === this.data.limit
                });
            } else {
                wx.showToast({
                    title: res.message || '加载失败',
                    icon: 'error'
                });
            }
        } catch (error) {
            console.error('加载商品失败:', error);
            wx.showToast({
                title: '网络错误',
                icon: 'error'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    async loadMoreProducts() {
        this.setData({
            page: this.data.page + 1
        });
        await this.loadProducts();
    },

    onSearchInput(e) {
        this.setData({ keyword: e.detail.value });
    },

    onSearchConfirm() {
        this.refreshData();
    },

    clearSearch() {
        this.setData({ keyword: '' });
        this.refreshData();
    },

    onCategoryFilter() {
        const currentFilter = this.data.currentFilter === 'category' ? '' : 'category';
        this.setData({ currentFilter });

        wx.showActionSheet({
            itemList: ['全部', '数码电子', '图书教材', '生活用品', '服装配饰', '运动器材'],
            success: (res) => {
                console.log('选择分类:', res.tapIndex);
            }
        });
    },

    onPriceFilter() {
        const currentFilter = this.data.currentFilter === 'price' ? '' : 'price';
        this.setData({ currentFilter });

        wx.showActionSheet({
            itemList: ['全部', '0-50元', '50-100元', '100-200元', '200-500元', '500元以上'],
            success: (res) => {
                console.log('选择价格范围:', res.tapIndex);
            }
        });
    },

    onSortFilter() {
        const currentFilter = this.data.currentFilter === 'sort' ? '' : 'sort';
        this.setData({ currentFilter });

        wx.showActionSheet({
            itemList: ['默认排序', '价格从低到高', '价格从高到低', '最新发布', '浏览量最多'],
            success: (res) => {
                console.log('选择排序方式:', res.tapIndex);
            }
        });
    },

    onProductTap(e) {
        const productId = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/product/detail/detail?id=${productId}`
        });
    },

    onProductLongPress(e) {
        const product = this.data.products[e.currentTarget.dataset.index];
        wx.showActionSheet({
            itemList: ['查看详情', '收藏商品', '分享商品'],
            success: (res) => {
                switch (res.tapIndex) {
                    case 0:
                        this.onProductTap(e);
                        break;
                    case 1:
                        this.toggleFavorite(product);
                        break;
                    case 2:
                        this.shareProduct(product);
                        break;
                }
            }
        });
    },

    onProductTouchStart(e) {
        const index = e.currentTarget.dataset.index;
        this.setData({ pressedIndex: index });
    },

    onProductTouchEnd() {
        this.setData({ pressedIndex: -1 });
    },

    toggleFavorite(product) {
        let favorites = wx.getStorageSync('favorites') || [];
        const isFavorited = favorites.includes(product.id);

        if (isFavorited) {
            favorites = favorites.filter(id => id !== product.id);
            wx.showToast({
                title: '已取消收藏',
                icon: 'success'
            });
        } else {
            favorites.push(product.id);
            wx.showToast({
                title: '已添加收藏',
                icon: 'success'
            });
        }

        wx.setStorageSync('favorites', favorites);
    },

    shareProduct(product) {
        wx.setClipboardData({
            data: `${product.title} - 仅售¥${product.price}`,
            success: () => {
                wx.showToast({
                    title: '商品信息已复制',
                    icon: 'success'
                });
            }
        });
    },

    goToPublish() {
        wx.navigateTo({
            url: '/pages/product/publish/publish'
        });
    },

    onShareAppMessage() {
        return {
            title: '发现好物，快来看看！',
            path: '/pages/product/list/list',
            imageUrl: this.data.products[0]?.images?.[0] || ''
        };
    }
}); 