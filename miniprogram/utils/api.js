const config = require('./config.js');

// API配置：服务器地址现在从配置文件中读取
const API_BASE_URL = config.API_BASE_URL;
const SERVER_BASE_URL = config.SERVER_BASE_URL;

class ApiService {
    constructor() {
        this.token = '';
    }

    static getInstance() {
        if (!ApiService.instance) {
            ApiService.instance = new ApiService();
        }
        return ApiService.instance;
    }

    // 获取完整URL
    getFullUrl(path) {
        if (!path) return '';
        // 如果已经是完整URL，则直接返回
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        // 如果是以/开头的相对路径，补全为完整URL
        if (path.startsWith('/')) {
            return `${SERVER_BASE_URL}${path}`;
        }
        // 其他相对路径也补全为完整URL
        return `${SERVER_BASE_URL}/${path}`;
    }

    // 处理图片URL数组
    processImageUrls(images) {
        if (!images || !Array.isArray(images)) return [];
        return images.map(img => this.getFullUrl(img));
    }

    // 处理单个商品数据，确保图片URL是完整的
    processProductData(product) {
        if (!product) return null;

        // 创建一个商品副本，不修改原对象
        const processedProduct = { ...product };

        // 处理商品图片
        if (processedProduct.images) {
            processedProduct.images = this.processImageUrls(processedProduct.images);
        }

        // 处理卖家头像
        if (processedProduct.seller && processedProduct.seller.avatar) {
            processedProduct.seller.avatar = this.getFullUrl(processedProduct.seller.avatar);
        }

        return processedProduct;
    }

    // 处理商品列表数据
    processProductsData(products) {
        if (!products || !Array.isArray(products)) return [];
        return products.map(product => this.processProductData(product));
    }

    // 设置token
    setToken(token) {
        this.token = token;
        wx.setStorageSync('token', token);
    }

    // 获取token
    getToken() {
        if (!this.token) {
            this.token = wx.getStorageSync('token') || '';
            console.log('从存储获取token:', this.token ? '已获取' : '未获取');
        }

        // 如果token为空，尝试从app获取
        if (!this.token) {
            try {
                const app = getApp();
                if (app && app.globalData && app.globalData.isLogin) {
                    console.log('尝试从app全局数据获取token');
                    // 如果应用已登录但token为空，重新获取
                    const token = wx.getStorageSync('token') || '';
                    if (token) {
                        this.token = token;
                        console.log('从app全局数据获取token成功');
                    }
                }
            } catch (e) {
                console.error('尝试从app获取token失败:', e);
            }
        }

        return this.token;
    }

    // 清除token
    clearToken() {
        this.token = '';
        wx.removeStorageSync('token');
    }

    // 基础请求方法
    request(config) {
        return new Promise((resolve, reject) => {
            const header = {
                'content-type': 'application/json',
                ...config.header
            };

            // 添加认证头
            if (config.needAuth !== false) {
                const token = this.getToken();
                console.log('请求认证状态:', config.url, token ? '有token' : '无token');

                if (token) {
                    header['Authorization'] = `Bearer ${token}`;
                } else {
                    console.warn('请求需要认证但无token:', config.url);

                    // 检查是否已登录但token丢失
                    const app = getApp();
                    if (app && app.globalData && app.globalData.isLogin) {
                        console.error('用户已登录但token丢失，尝试重新登录');
                        // 清除登录状态
                        app.clearUserInfo();

                        setTimeout(() => {
                            wx.showModal({
                                title: '登录已失效',
                                content: '您的登录已失效，请重新登录',
                                showCancel: false,
                                success: () => {
                                    wx.navigateTo({
                                        url: '/pages/auth/login/login'
                                    });
                                }
                            });
                        }, 500);

                        return reject({
                            success: false,
                            message: '登录已失效，请重新登录'
                        });
                    }
                }
            }

            wx.request({
                url: `${API_BASE_URL}${config.url}`,
                method: config.method || 'GET',
                data: config.data,
                header,
                success: (res) => {
                    const response = res.data;

                    if (res.statusCode === 200) {
                        resolve(response);
                    } else if (res.statusCode === 401) {
                        // token过期或无效
                        this.clearToken();
                        wx.showToast({
                            title: '请重新登录',
                            icon: 'none'
                        });
                        wx.reLaunch({
                            url: '/pages/auth/login/login'
                        });
                        reject(response);
                    } else {
                        wx.showToast({
                            title: response.message || '请求失败',
                            icon: 'none'
                        });
                        reject(response);
                    }
                },
                fail: (error) => {
                    console.error('API请求失败:', error);
                    wx.showToast({
                        title: '网络连接失败',
                        icon: 'none'
                    });
                    reject({ success: false, message: '网络连接失败' });
                }
            });
        });
    }

    // GET请求
    get(url, data) {
        const queryString = data ? this.objectToQueryString(data) : '';
        return this.request({
            url: queryString ? `${url}?${queryString}` : url,
            method: 'GET'
        });
    }

    // POST请求
    post(url, data) {
        return this.request({
            url,
            method: 'POST',
            data
        });
    }

    // PUT请求
    put(url, data) {
        return this.request({
            url,
            method: 'PUT',
            data
        });
    }

    // DELETE请求
    delete(url) {
        return this.request({
            url,
            method: 'DELETE'
        });
    }

    // 对象转查询字符串
    objectToQueryString(obj) {
        const params = [];
        for (const key in obj) {
            if (obj[key] !== undefined && obj[key] !== null) {
                params.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key].toString())}`);
            }
        }
        return params.join('&');
    }
}

// 导出单例实例
const apiService = ApiService.getInstance();

// 具体的API方法
const AuthAPI = {
    // 微信登录
    wechatLogin(code, userInfo) {
        return apiService.post('/auth/wechat-login', { code, userInfo });
    },

    // 验证token
    verifyToken() {
        return apiService.get('/auth/verify');
    },

    // 刷新token
    refreshToken() {
        return apiService.post('/auth/refresh');
    },

    // 更新用户地理位置信息
    updateLocation() {
        return apiService.post('/auth/update-location');
    }
};

const ProductAPI = {
    // 获取商品列表
    getList(params) {
        return new Promise((resolve, reject) => {
            apiService.get('/product/list', params)
                .then(res => {
                    if (res.success && res.data && res.data.records) {
                        // 处理图片URL
                        res.data.records = apiService.processProductsData(res.data.records);
                    }
                    resolve(res);
                })
                .catch(error => reject(error));
        });
    },

    // 获取商品详情
    getDetail(id) {
        return new Promise((resolve, reject) => {
            apiService.get(`/product/${id}`)
                .then(res => {
                    if (res.success && res.data) {
                        // 处理图片URL
                        res.data = apiService.processProductData(res.data);
                    }
                    resolve(res);
                })
                .catch(error => reject(error));
        });
    },

    // 发布商品
    publish(data) {
        return apiService.post('/product/publish', data);
    },

    // 获取我的商品
    getMyProducts(params) {
        return new Promise((resolve, reject) => {
            apiService.get('/product/my/list', params)
                .then(res => {
                    if (res.success && res.data && res.data.records) {
                        // 处理图片URL
                        res.data.records = apiService.processProductsData(res.data.records);
                    }
                    resolve(res);
                })
                .catch(error => {
                    console.error('获取我的商品失败:', error);
                    reject(error);
                });
        });
    },

    // 获取热门商品
    getPopular(limit, category) {
        return new Promise((resolve, reject) => {
            apiService.get('/product/popular', { limit, category })
                .then(res => {
                    if (res.success && res.data) {
                        // 处理图片URL
                        res.data = apiService.processProductsData(res.data);
                    }
                    resolve(res);
                })
                .catch(error => reject(error));
        });
    },

    // 获取分类统计
    getCategories() {
        return apiService.get('/product/categories');
    },

    // 更新商品
    update(id, data) {
        console.log(`更新商品 ID:${id}, 数据:`, data);
        return new Promise((resolve, reject) => {
            apiService.put(`/product/${id}`, data)
                .then(res => {
                    console.log('更新商品响应:', res);
                    resolve(res);
                })
                .catch(error => {
                    console.error('更新商品失败:', error);
                    reject(error);
                });
        });
    },

    // 删除商品
    delete(id) {
        return apiService.delete(`/product/${id}`);
    }
};

const OrderAPI = {
    // 创建订单
    async create(data) {
        try {
            console.log('创建订单, 数据:', data);

            // 先检查商品状态
            const productRes = await ProductAPI.getDetail(data.productId);
            if (!productRes.success) {
                console.error('商品信息获取失败:', productRes);
                return {
                    success: false,
                    message: '商品信息获取失败'
                };
            }

            // 检查商品是否仍然可用
            if (productRes.data.status !== 'available') {
                console.error('商品当前不可购买, 状态:', productRes.data.status);
                return {
                    success: false,
                    message: '该商品当前不可购买，可能已被预订或售出'
                };
            }

            // 创建订单
            const orderRes = await apiService.post('/order/create', data);
            console.log('创建订单响应:', orderRes);

            // 创建订单成功后，检查商品状态是否已更新为reserved
            if (orderRes.success) {
                try {
                    // 再次检查商品状态
                    const updatedProductRes = await ProductAPI.getDetail(data.productId);
                    if (updatedProductRes.success && updatedProductRes.data.status !== 'reserved') {
                        console.warn('订单创建成功，但商品状态未更新为reserved，当前状态:',
                            updatedProductRes.data.status);
                        // 尝试更新商品状态
                        await ProductAPI.update(data.productId, { status: 'reserved' });
                    }
                } catch (error) {
                    console.error('检查商品状态失败:', error);
                    // 不影响主流程
                }
            }

            return orderRes;
        } catch (error) {
            console.error('创建订单失败:', error);
            return {
                success: false,
                message: '创建订单失败'
            };
        }
    },

    // 获取买家订单
    getBuyerOrders(params) {
        console.log('请求买家订单参数:', params);
        return new Promise((resolve, reject) => {
            apiService.get('/order/my/buyer', params)
                .then(res => {
                    console.log('获取买家订单响应:', res);

                    // 标准化响应结构并构造 product 对象
                    if (res.success && res.data) {
                        const { records = [], pagination = {} } = res.data;
                        const orders = records.map(order => ({
                            ...order,
                            product: {
                                id: order.productId,
                                title: order.productTitle,
                                price: order.productPrice,
                                images: apiService.processImageUrls(order.productImages || [])
                            }
                        }));
                        res.data.orders = orders;
                        res.data.hasMore = pagination.currentPage < pagination.totalPages;
                    }

                    resolve(res);
                })
                .catch(error => {
                    console.error('获取买家订单失败:', error);
                    reject(error);
                });
        });
    },

    // 获取卖家订单
    getSellerOrders(params) {
        console.log('请求卖家订单参数:', params);
        return new Promise((resolve, reject) => {
            apiService.get('/order/my/seller', params)
                .then(res => {
                    console.log('获取卖家订单响应:', res);

                    // 标准化响应结构并构造 product 对象
                    if (res.success && res.data) {
                        const { records = [], pagination = {} } = res.data;
                        const orders = records.map(order => ({
                            ...order,
                            product: {
                                id: order.productId,
                                title: order.productTitle,
                                price: order.productPrice,
                                images: apiService.processImageUrls(order.productImages || [])
                            }
                        }));
                        res.data.orders = orders;
                        res.data.hasMore = pagination.currentPage < pagination.totalPages;
                    }

                    resolve(res);
                })
                .catch(error => {
                    console.error('获取卖家订单失败:', error);
                    reject(error);
                });
        });
    },

    // 获取订单详情
    getDetail(id) {
        return apiService.get(`/order/${id}`).then(async res => {
            if (res.success && res.data) {
                // 尝试获取完整产品详情以包含状态
                let productDetail;
                try {
                    const productRes = await ProductAPI.getDetail(res.data.productId);
                    if (productRes.success && productRes.data) {
                        productDetail = productRes.data;
                    } else {
                        productDetail = {
                            id: res.data.productId,
                            title: res.data.productTitle,
                            price: res.data.productPrice,
                            images: apiService.processImageUrls(res.data.productImages || []),
                            status: res.data.productStatus || 'available'
                        };
                    }
                } catch (e) {
                    productDetail = {
                        id: res.data.productId,
                        title: res.data.productTitle,
                        price: res.data.productPrice,
                        images: apiService.processImageUrls(res.data.productImages || []),
                        status: res.data.productStatus || 'available'
                    };
                }
                res.data.product = productDetail;
            }
            return res;
        });
    },

    // 更新订单状态
    async updateStatus(id, status) {
        try {
            // 先获取订单详情，了解商品ID
            const orderRes = await this.getDetail(id);
            if (!orderRes.success) {
                return {
                    success: false,
                    message: '获取订单信息失败'
                };
            }

            const productId = orderRes.data.productId;

            // 更新订单状态
            const res = await apiService.put(`/order/${id}/status`, { status });

            if (res.success) {
                // 根据新状态更新商品状态
                try {
                    let productStatus = null;

                    switch (status) {
                        case 'completed':
                            // 交易完成，商品状态设为已售出
                            productStatus = 'sold';
                            break;
                        case 'cancelled':
                        case 'rejected':
                            // 订单取消或拒绝，商品状态恢复为可用
                            productStatus = 'available';
                            break;
                        // 其他状态不需要更改商品状态
                    }

                    if (productStatus) {
                        // 获取当前商品状态，确保只在需要时更新
                        const productRes = await ProductAPI.getDetail(productId);
                        if (productRes.success && productRes.data.status !== productStatus) {
                            console.log(`更新商品[${productId}]状态: ${productRes.data.status} -> ${productStatus}`);
                            await ProductAPI.update(productId, { status: productStatus });
                        }
                    }
                } catch (error) {
                    console.error('更新商品状态失败:', error);
                    // 商品状态更新失败不影响订单状态更新
                }
            }

            return res;
        } catch (error) {
            console.error('更新订单状态失败:', error);
            return {
                success: false,
                message: '更新订单状态失败'
            };
        }
    },

    // 获取订单统计
    getStats(type) {
        return apiService.get('/order/stats', { type });
    },

    // 删除订单
    delete(id) {
        console.log('准备删除订单, ID:', id);
        return new Promise((resolve, reject) => {
            try {
                console.log('发送删除订单API请求:', `/order/${id}`);
                apiService.delete(`/order/${id}`)
                    .then(res => {
                        console.log('删除订单API响应成功:', res);
                        resolve(res);
                    })
                    .catch(error => {
                        console.error('删除订单API响应失败:', error);
                        reject(error);
                    });
            } catch (error) {
                console.error('删除订单请求异常:', error);
                reject({
                    success: false,
                    message: '删除订单请求异常'
                });
            }
        });
    },
};

const UserAPI = {
    // 获取用户信息
    getProfile() {
        return apiService.get('/user/profile');
    },

    // 更新用户信息
    updateProfile(data) {
        return apiService.put('/user/profile', data);
    },

    // 获取用户公开信息
    getPublicInfo(id) {
        return apiService.get(`/user/${id}/public`);
    },

    // 获取用户统计
    getStats() {
        return apiService.get('/user/stats');
    },

    // 上传头像
    uploadAvatar(filePath) {
        return new Promise((resolve, reject) => {
            console.log('开始上传头像:', filePath);
            console.log('上传URL:', `${API_BASE_URL}/user/upload-avatar`);
            console.log('Token:', apiService.getToken());

            wx.uploadFile({
                url: `${API_BASE_URL}/user/upload-avatar`,
                filePath: filePath,
                name: 'avatar',
                header: {
                    'Authorization': `Bearer ${apiService.getToken()}`
                },
                success: (res) => {
                    console.log('上传响应:', res);
                    try {
                        if (res.statusCode === 200) {
                            const data = JSON.parse(res.data);
                            console.log('上传成功数据:', data);
                            resolve(data);
                        } else {
                            console.error('上传失败状态码:', res.statusCode);
                            console.error('上传失败响应:', res.data);
                            reject({
                                success: false,
                                message: `上传失败，状态码：${res.statusCode}`,
                                statusCode: res.statusCode,
                                data: res.data
                            });
                        }
                    } catch (error) {
                        console.error('解析响应数据失败:', error);
                        reject({
                            success: false,
                            message: '服务器响应格式错误',
                            error: error.message
                        });
                    }
                },
                fail: (error) => {
                    console.error('上传请求失败:', error);
                    reject({
                        success: false,
                        message: '网络请求失败',
                        error: error
                    });
                }
            });
        });
    }
};

const MessageAPI = {
    // 创建或获取对话
    createOrGetConversation(data) {
        return apiService.post('/message/conversation', data);
    },

    // 获取对话信息
    getConversation(conversationId) {
        return apiService.get(`/message/conversation/${conversationId}`);
    },

    // 获取会话列表
    getConversations(params) {
        return apiService.get('/message/conversations', params);
    },

    // 获取消息列表
    getMessages(conversationId, params) {
        return apiService.get(`/message/conversation/${conversationId}/messages`, params);
    },

    // 发送消息
    sendMessage(data) {
        return apiService.post('/message/send', data);
    },

    // 上传聊天图片
    uploadImage(filePath) {
        return new Promise((resolve, reject) => {
            console.log('开始上传聊天图片:', filePath);
            console.log('上传URL:', `${API_BASE_URL}/message/upload-image`);
            console.log('Token:', apiService.getToken());

            wx.uploadFile({
                url: `${API_BASE_URL}/message/upload-image`,
                filePath: filePath,
                name: 'image',
                header: {
                    'Authorization': `Bearer ${apiService.getToken()}`
                },
                success: (res) => {
                    console.log('上传响应:', res);
                    try {
                        if (res.statusCode === 200) {
                            const data = JSON.parse(res.data);
                            console.log('上传成功数据:', data);
                            resolve(data);
                        } else {
                            console.error('上传失败状态码:', res.statusCode);
                            console.error('上传失败响应:', res.data);
                            reject({
                                success: false,
                                message: `上传失败，状态码：${res.statusCode}`,
                                statusCode: res.statusCode,
                                data: res.data
                            });
                        }
                    } catch (error) {
                        console.error('解析响应数据失败:', error);
                        reject({
                            success: false,
                            message: '服务器响应格式错误',
                            error: error.message
                        });
                    }
                },
                fail: (error) => {
                    console.error('上传请求失败:', error);
                    reject({
                        success: false,
                        message: '网络请求失败',
                        error: error
                    });
                }
            });
        });
    },

    // 上传语音消息
    uploadVoice(filePath) {
        return new Promise((resolve, reject) => {
            console.log('开始上传语音消息:', filePath);
            console.log('上传URL:', `${API_BASE_URL}/message/upload-voice`);
            console.log('Token:', apiService.getToken());

            wx.uploadFile({
                url: `${API_BASE_URL}/message/upload-voice`,
                filePath: filePath,
                name: 'voice',
                header: {
                    'Authorization': `Bearer ${apiService.getToken()}`
                },
                success: (res) => {
                    console.log('上传响应:', res);
                    try {
                        if (res.statusCode === 200) {
                            const data = JSON.parse(res.data);
                            console.log('上传成功数据:', data);
                            resolve(data);
                        } else {
                            console.error('上传失败状态码:', res.statusCode);
                            console.error('上传失败响应:', res.data);
                            reject({
                                success: false,
                                message: `上传失败，状态码：${res.statusCode}`,
                                statusCode: res.statusCode,
                                data: res.data
                            });
                        }
                    } catch (error) {
                        console.error('解析响应数据失败:', error);
                        reject({
                            success: false,
                            message: '服务器响应格式错误',
                            error: error.message
                        });
                    }
                },
                fail: (error) => {
                    console.error('上传请求失败:', error);
                    reject({
                        success: false,
                        message: '网络请求失败',
                        error: error
                    });
                }
            });
        });
    },

    // 删除会话
    deleteConversation(conversationId) {
        return apiService.delete(`/message/conversation/${conversationId}`);
    },

    // 标记消息为已读
    markAsRead(conversationId) {
        return apiService.put(`/message/conversation/${conversationId}/read`);
    }
};

module.exports = {
    apiService,
    AuthAPI,
    ProductAPI,
    OrderAPI,
    UserAPI,
    MessageAPI
}; 