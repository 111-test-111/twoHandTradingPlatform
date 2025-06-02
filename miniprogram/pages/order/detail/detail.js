const { ProductAPI, OrderAPI, UserAPI } = require('../../../utils/api');

Page({
    data: {
        loading: true,
        submitting: false,
        productId: '',
        product: null,
        seller: null,
        action: '', // 'buy' or 'view'
        orderId: '',
        order: null,
        userInfo: null,
        buyerInfo: {
            name: '',
            phone: '',
            campus: '',
            address: '',
            paymentMethod: '微信支付',
            payAmount: 0,
            message: ''
        },
        campusOptions: ['东校区', '西校区', '南校区', '北校区'],
        selectedCampusIndex: -1,
        paymentMethods: ['微信支付', '支付宝', '校园卡', '现金'],
        selectedPaymentIndex: 0,
        errors: {}
    },

    onLoad(options) {
        const userInfo = wx.getStorageSync('userInfo');
        this.setData({ userInfo });

        if (options.productId && options.action === 'buy') {
            // 新订单创建模式
            this.setData({
                productId: options.productId,
                action: 'buy'
            });
            this.loadProductDetail(options.productId);
        } else if (options.id) {
            // 查看已有订单模式
            this.setData({
                orderId: options.id,
                action: 'view'
            });
            this.loadOrderDetail(options.id);
        } else {
            wx.showToast({
                title: '参数错误',
                icon: 'error'
            });
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
        }
    },

    // 加载商品详情
    async loadProductDetail(id) {
        try {
            wx.showLoading({ title: '加载中...' });
            const res = await ProductAPI.getDetail(id);

            if (res.success) {
                // 初始化支付金额为商品价格
                let buyerInfo = this.data.buyerInfo;
                buyerInfo.payAmount = res.data.price;

                // 获取用户信息预填表单
                const userInfo = wx.getStorageSync('userInfo');
                if (userInfo) {
                    try {
                        const profileRes = await UserAPI.getProfile();
                        if (profileRes.success && profileRes.data) {
                            buyerInfo.name = profileRes.data.realName || userInfo.nickname || '';
                            buyerInfo.phone = profileRes.data.phone || '';

                            // 设置校区
                            const campusIndex = this.data.campusOptions.findIndex(
                                campus => campus === profileRes.data.campus
                            );
                            if (campusIndex !== -1) {
                                this.setData({ selectedCampusIndex: campusIndex });
                                buyerInfo.campus = this.data.campusOptions[campusIndex];
                            }
                        }
                    } catch (error) {
                        console.error('获取用户资料失败:', error);
                    }
                }

                this.setData({
                    product: res.data,
                    seller: res.data.seller,
                    buyerInfo: buyerInfo,
                    loading: false
                });

                // 更新页面标题
                wx.setNavigationBarTitle({
                    title: '订单确认'
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

    // 加载订单详情
    async loadOrderDetail(id) {
        try {
            wx.showLoading({ title: '加载中...' });
            const res = await OrderAPI.getDetail(id);

            if (res.success) {
                const { userInfo } = this.data;
                const isSeller = userInfo && userInfo.id === res.data.sellerId;
                const isBuyer = userInfo && userInfo.id === res.data.buyerId;

                this.setData({
                    order: res.data,
                    product: res.data.product,
                    seller: res.data.seller,
                    isSeller,
                    isBuyer,
                    buyerInfo: {
                        name: res.data.buyerName,
                        phone: res.data.buyerPhone,
                        campus: res.data.buyerCampus,
                        address: res.data.buyerAddress,
                        paymentMethod: res.data.paymentMethod,
                        payAmount: res.data.payAmount,
                        message: res.data.buyerMessage
                    },
                    loading: false
                });

                // 设置校区索引
                const campusIndex = this.data.campusOptions.findIndex(
                    campus => campus === res.data.buyerCampus
                );
                if (campusIndex !== -1) {
                    this.setData({ selectedCampusIndex: campusIndex });
                }

                // 设置支付方式索引
                const paymentIndex = this.data.paymentMethods.findIndex(
                    method => method === res.data.paymentMethod
                );
                if (paymentIndex !== -1) {
                    this.setData({ selectedPaymentIndex: paymentIndex });
                }

                // 更新页面标题
                wx.setNavigationBarTitle({
                    title: '订单详情'
                });
            }
        } catch (error) {
            console.error('加载订单详情失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
            this.setData({ loading: false });
        } finally {
            wx.hideLoading();
        }
    },

    // 输入事件处理
    onInputName(e) {
        this.setData({ 'buyerInfo.name': e.detail.value });
    },

    onInputPhone(e) {
        this.setData({ 'buyerInfo.phone': e.detail.value });
    },

    onInputAddress(e) {
        this.setData({ 'buyerInfo.address': e.detail.value });
    },

    onInputPayAmount(e) {
        this.setData({ 'buyerInfo.payAmount': e.detail.value });
    },

    onInputMessage(e) {
        this.setData({ 'buyerInfo.message': e.detail.value });
    },

    // 选择器事件处理
    onCampusChange(e) {
        const index = Number(e.detail.value);
        this.setData({
            selectedCampusIndex: index,
            'buyerInfo.campus': this.data.campusOptions[index]
        });
    },

    onPaymentMethodChange(e) {
        const index = Number(e.detail.value);
        this.setData({
            selectedPaymentIndex: index,
            'buyerInfo.paymentMethod': this.data.paymentMethods[index]
        });
    },

    // 表单验证
    validateForm() {
        const { buyerInfo } = this.data;
        const errors = {};

        if (!buyerInfo.name.trim()) {
            errors.name = '请输入姓名';
        }

        if (!buyerInfo.phone.trim()) {
            errors.phone = '请输入联系电话';
        } else if (!/^1\d{10}$/.test(buyerInfo.phone)) {
            errors.phone = '请输入有效的手机号码';
        }

        if (!buyerInfo.campus) {
            errors.campus = '请选择校区';
        }

        if (!buyerInfo.address.trim()) {
            errors.address = '请输入详细地址';
        }

        if (isNaN(buyerInfo.payAmount) || Number(buyerInfo.payAmount) <= 0) {
            errors.payAmount = '请输入有效的支付金额';
        }

        this.setData({ errors });
        return Object.keys(errors).length === 0;
    },

    // 提交订单
    async submitOrder() {
        if (!this.validateForm()) {
            wx.showToast({
                title: '请完善信息',
                icon: 'error'
            });
            return;
        }

        try {
            this.setData({ submitting: true });
            wx.showLoading({ title: '提交中...' });

            const { buyerInfo, productId, userInfo } = this.data;

            if (!userInfo || !userInfo.id) {
                wx.showToast({
                    title: '请先登录',
                    icon: 'error'
                });
                setTimeout(() => {
                    wx.navigateTo({
                        url: '/pages/auth/login/login'
                    });
                }, 1500);
                return;
            }

            const orderData = {
                productId: productId,
                buyerId: userInfo.id,
                buyerName: buyerInfo.name,
                buyerPhone: buyerInfo.phone,
                buyerCampus: buyerInfo.campus,
                buyerAddress: buyerInfo.address,
                paymentMethod: buyerInfo.paymentMethod,
                payAmount: Number(buyerInfo.payAmount),
                buyerMessage: buyerInfo.message || '无备注信息'
            };

            console.log('提交订单数据:', orderData);
            const res = await OrderAPI.create(orderData);
            console.log('订单创建响应:', res);

            if (res.success) {
                wx.showToast({
                    title: '订单已提交',
                    icon: 'success'
                });

                // 设置订单列表需要刷新的标志
                wx.setStorageSync('orderListNeedRefresh', true);

                // 保存订单ID，用于直接跳转到订单详情
                const orderId = res.data.id || res.data.orderId;
                console.log('创建的订单ID:', orderId);

                // 延迟后跳转
                setTimeout(() => {
                    if (orderId) {
                        // 如果有订单ID，直接查看订单详情
                        wx.redirectTo({
                            url: `/pages/order/detail/detail?id=${orderId}`
                        });
                    } else {
                        // 没有订单ID，跳转到订单列表
                        wx.redirectTo({
                            url: '/pages/order/list/list'
                        });
                    }
                }, 1500);
            } else {
                wx.showToast({
                    title: res.message || '提交失败',
                    icon: 'error'
                });
            }
        } catch (error) {
            console.error('提交订单失败:', error);
            wx.showToast({
                title: '提交失败',
                icon: 'error'
            });
        } finally {
            this.setData({ submitting: false });
            wx.hideLoading();
        }
    },

    // 确认订单（卖家）
    async confirmOrder() {
        try {
            wx.showLoading({ title: '处理中...' });
            const res = await OrderAPI.updateStatus(this.data.orderId, 'accepted');

            if (res.success) {
                wx.showToast({
                    title: '已确认订单',
                    icon: 'success'
                });

                // 刷新订单详情
                setTimeout(() => {
                    this.loadOrderDetail(this.data.orderId);
                }, 1500);
            }
        } catch (error) {
            console.error('确认订单失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 拒绝订单（卖家）
    async rejectOrder() {
        try {
            wx.showLoading({ title: '处理中...' });
            const res = await OrderAPI.updateStatus(this.data.orderId, 'rejected');

            if (res.success) {
                wx.showToast({
                    title: '已拒绝订单',
                    icon: 'success'
                });

                // 刷新订单详情
                setTimeout(() => {
                    this.loadOrderDetail(this.data.orderId);
                }, 1500);
            }
        } catch (error) {
            console.error('拒绝订单失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 取消订单（买家）
    async cancelOrder() {
        try {
            wx.showLoading({ title: '处理中...' });
            const res = await OrderAPI.updateStatus(this.data.orderId, 'cancelled');

            if (res.success) {
                wx.showToast({
                    title: '已取消订单',
                    icon: 'success'
                });

                // 刷新订单详情
                setTimeout(() => {
                    this.loadOrderDetail(this.data.orderId);
                }, 1500);
            }
        } catch (error) {
            console.error('取消订单失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 完成交易（买家或卖家）
    async completeOrder() {
        try {
            wx.showLoading({ title: '处理中...' });
            const res = await OrderAPI.updateStatus(this.data.orderId, 'completed');

            if (res.success) {
                wx.showToast({
                    title: '交易已完成',
                    icon: 'success'
                });

                // 刷新订单详情
                setTimeout(() => {
                    this.loadOrderDetail(this.data.orderId);
                }, 1500);
            }
        } catch (error) {
            console.error('完成交易失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 联系对方
    contactOtherParty() {
        const { order } = this.data;
        if (!order) return;

        const userInfo = wx.getStorageSync('userInfo');
        const isBuyer = userInfo && userInfo.id === order.buyerId;
        const otherUserId = isBuyer ? order.sellerId : order.buyerId;

        wx.navigateTo({
            url: `/pages/message/chat/chat?userId=${otherUserId}&orderId=${order.id}`
        });
    },

    // 返回订单列表
    goToOrderList() {
        wx.navigateTo({
            url: '/pages/order/list/list'
        });
    },

    // 时间格式化
    formatTime(timeStr) {
        if (!timeStr) return '';

        const time = new Date(timeStr);
        return `${time.getFullYear()}-${(time.getMonth() + 1).toString().padStart(2, '0')}-${time.getDate().toString().padStart(2, '0')} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    },

    // 买家支付订单
    async payOrder() {
        try {
            wx.showModal({
                title: '确认付款',
                content: '请确认您已按照约定方式完成付款',
                confirmText: '已付款',
                cancelText: '取消',
                success: async (res) => {
                    if (res.confirm) {
                        wx.showLoading({ title: '处理中...' });
                        const updateRes = await OrderAPI.updateStatus(this.data.orderId, 'completed');

                        if (updateRes.success) {
                            wx.showToast({
                                title: '付款确认成功',
                                icon: 'success'
                            });

                            // 刷新订单详情
                            setTimeout(() => {
                                this.loadOrderDetail(this.data.orderId);
                            }, 1500);
                        } else {
                            wx.showToast({
                                title: updateRes.message || '操作失败',
                                icon: 'error'
                            });
                        }
                        wx.hideLoading();
                    }
                }
            });
        } catch (error) {
            console.error('付款确认失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        }
    }
}); 