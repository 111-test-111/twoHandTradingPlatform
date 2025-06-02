const { ProductAPI, OrderAPI, UserAPI } = require('../../../utils/api');

Page({
    data: {
        product: {
            id: '',
            title: '',
            price: 0,
            description: '',
            images: [],
            condition: '',
            campus: '',
            tradeMethods: '',
            seller: null,
            sellerId: '',
            status: 'available',
            category: '',
            region: '',
            viewCount: 0,
            createdAt: ''
        },
        isOwner: false,
        loading: true,
        isFavorited: false,
        currentImageIndex: 0,
        sellerStats: null
    },

    onLoad(options) {
        if (options.id) {
            this.loadProductDetail(options.id);
        }
    },

    async loadProductDetail(id) {
        try {
            wx.showLoading({ title: '加载中...' });

            const res = await ProductAPI.getDetail(id);
            console.log('商品详情API响应:', res);

            if (res.success) {
                console.log('商品图片数据:', res.data.images);

                // 检查是否是商品拥有者
                const userInfo = wx.getStorageSync('userInfo');
                const isOwner = userInfo && userInfo.id === res.data.sellerId;

                this.setData({
                    product: res.data,
                    isOwner,
                    loading: false
                });

                // 加载卖家统计信息（如果不是拥有者）
                if (!isOwner && res.data.sellerId) {
                    this.loadSellerStats(res.data.sellerId);
                }

                // 检查收藏状态
                this.checkFavoriteStatus(id);

                // 更新页面标题
                wx.setNavigationBarTitle({
                    title: res.data.title || '商品详情'
                });
            }
        } catch (error) {
            console.error('加载商品详情失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
            this.setData({ loading: false });
        } finally {
            wx.hideLoading();
        }
    },

    // 加载卖家统计信息
    async loadSellerStats(sellerId) {
        try {
            // 通过公共接口获取卖家公开信息，包括统计数据
            const res = await UserAPI.getPublicInfo(sellerId);
            if (res.success && res.data) {
                // 假设返回数据中包含 stats 字段
                const stats = res.data.stats || {
                    totalProducts: res.data.totalProducts || 0,
                    soldProducts: res.data.soldProducts || 0,
                    positiveRate: res.data.positiveRate || 0
                };
                this.setData({ sellerStats: stats });
            }
        } catch (error) {
            console.error('加载卖家统计失败:', error);
        }
    },

    // 检查收藏状态
    async checkFavoriteStatus(productId) {
        try {
            // 这里可以添加检查收藏状态的API调用
            // const res = await ProductAPI.checkFavorite(productId);
            // 暂时从本地存储检查
            const favorites = wx.getStorageSync('favorites') || [];
            const isFavorited = favorites.includes(productId);
            this.setData({ isFavorited });
        } catch (error) {
            console.error('检查收藏状态失败:', error);
        }
    },

    // 轮播图切换事件
    onSwiperChange(e) {
        this.setData({
            currentImageIndex: e.detail.current
        });
    },

    // 图片点击预览
    onImageTap(e) {
        const { src, index } = e.currentTarget.dataset;
        const { images } = this.data.product;

        wx.previewImage({
            current: src,
            urls: images
        });
    },

    // 时间格式化
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

    // 切换收藏状态
    async onToggleFavorite() {
        try {
            const { product, isFavorited } = this.data;

            // 更新本地存储
            let favorites = wx.getStorageSync('favorites') || [];

            if (isFavorited) {
                // 取消收藏
                favorites = favorites.filter(id => id !== product.id);
                wx.showToast({
                    title: '已取消收藏',
                    icon: 'success'
                });
            } else {
                // 添加收藏
                favorites.push(product.id);
                wx.showToast({
                    title: '已添加收藏',
                    icon: 'success'
                });
            }

            wx.setStorageSync('favorites', favorites);
            this.setData({ isFavorited: !isFavorited });

            // 这里可以添加服务器端的收藏API调用
            // await ProductAPI.toggleFavorite(product.id, !isFavorited);

        } catch (error) {
            console.error('收藏操作失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        }
    },

    // 联系卖家
    onContact() {
        const { product } = this.data;

        // 检查是否已登录
        const userInfo = wx.getStorageSync('userInfo');
        if (!userInfo) {
            wx.showModal({
                title: '提示',
                content: '请先登录后再联系卖家',
                confirmText: '去登录',
                success: (res) => {
                    if (res.confirm) {
                        wx.navigateTo({
                            url: '/pages/auth/login/login'
                        });
                    }
                }
            });
            return;
        }

        // 检查是否试图联系自己
        if (userInfo.id === product.sellerId) {
            wx.showToast({
                title: '不能联系自己',
                icon: 'none'
            });
            return;
        }

        // 跳转到聊天页面
        wx.navigateTo({
            url: `/pages/message/chat/chat?userId=${product.sellerId}&productId=${product.id}`
        });
    },

    // 立即购买
    async onBuy() {
        try {
            wx.showLoading({ title: '处理中...' });

            // 跳转到订单详情页，不立即设置商品状态为reserved
            wx.navigateTo({
                url: `/pages/order/detail/detail?productId=${this.data.product.id}&action=buy`
            });
        } catch (error) {
            console.error('处理订单失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 编辑商品
    onEdit() {
        wx.navigateTo({
            url: `/pages/product/publish/publish?id=${this.data.product.id}&edit=true`
        });
    },

    // 删除商品
    async onDelete() {
        wx.showModal({
            title: '确认删除',
            content: '确定要删除这个商品吗？删除后无法恢复。',
            confirmColor: '#ff4757',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        wx.showLoading({ title: '删除中...' });

                        const deleteRes = await ProductAPI.delete(this.data.product.id);
                        if (deleteRes.success) {
                            wx.showToast({
                                title: '删除成功',
                                icon: 'success'
                            });
                            setTimeout(() => {
                                wx.navigateBack();
                            }, 1500);
                        }
                    } catch (error) {
                        console.error('删除商品失败:', error);
                        wx.showToast({
                            title: '删除失败',
                            icon: 'error'
                        });
                    } finally {
                        wx.hideLoading();
                    }
                }
            }
        });
    },

    // 页面分享
    onShareAppMessage() {
        const { product } = this.data;
        return {
            title: product.title,
            path: `/pages/product/detail/detail?id=${product.id}`,
            imageUrl: product.images[0]
        };
    },

    // 分享到朋友圈
    onShareTimeline() {
        const { product } = this.data;
        return {
            title: `${product.title} - 仅售¥${product.price}`,
            imageUrl: product.images[0]
        };
    },

    // 图片加载错误处理
    onImageError(e) {
        console.error('图片加载失败:', e.detail);
        const { index } = e.currentTarget.dataset;
        console.log('失败的图片索引:', index);
        console.log('图片URL:', e.currentTarget.src);
    }
}); 