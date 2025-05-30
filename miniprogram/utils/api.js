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
                if (token) {
                    header['Authorization'] = `Bearer ${token}`;
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
        return apiService.put(`/product/${id}`, data);
    },

    // 删除商品
    delete(id) {
        return apiService.delete(`/product/${id}`);
    }
};

const OrderAPI = {
    // 创建订单
    create(data) {
        return apiService.post('/order/create', data);
    },

    // 获取买家订单
    getBuyerOrders(params) {
        return apiService.get('/order/my/buyer', params);
    },

    // 获取卖家订单
    getSellerOrders(params) {
        return apiService.get('/order/my/seller', params);
    },

    // 获取订单详情
    getDetail(id) {
        return apiService.get(`/order/${id}`);
    },

    // 更新订单状态
    updateStatus(id, status) {
        return apiService.put(`/order/${id}/status`, { status });
    },

    // 获取订单统计
    getStats(type) {
        return apiService.get('/order/stats', { type });
    }
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

module.exports = {
    apiService,
    AuthAPI,
    ProductAPI,
    OrderAPI,
    UserAPI
}; 