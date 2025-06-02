const { AuthAPI } = require('./utils/api');
const config = require('./utils/config');

App({
    globalData: {
        userInfo: null,
        isLogin: false,
        baseUrl: config.SERVER_BASE_URL
    },

    onLaunch() {
        console.log('小程序启动');
        this.clearOldConfig(); // 清理旧的配置缓存
        this.checkLogin();
    },

    onShow() {
        console.log('小程序显示');
    },

    onHide() {
        console.log('小程序隐藏');
    },

    // 清理旧的配置缓存
    clearOldConfig() {
        try {
            // 清理可能缓存的旧API地址
            wx.removeStorageSync('apiBaseUrl');
            console.log('已清理旧配置缓存，当前API地址:', config.API_BASE_URL);
        } catch (error) {
            console.error('清理配置缓存失败:', error);
        }
    },

    // 检查登录状态
    async checkLogin() {
        try {
            const token = wx.getStorageSync('token');
            console.log('检查登录状态, token:', token ? '存在' : '不存在');

            if (token) {
                // 首先从本地存储恢复用户信息，确保离线时也能显示
                const localUserInfo = wx.getStorageSync('userInfo');
                if (localUserInfo) {
                    this.globalData.userInfo = localUserInfo;
                    this.globalData.isLogin = true;
                    console.log('从本地恢复用户信息成功');

                    // 确保API服务实例也有token
                    const { apiService } = require('./utils/api');
                    apiService.setToken(token);
                    console.log('已将token设置到API服务实例');
                }

                // 尝试从服务器验证token并获取最新用户信息
                try {
                    console.log('开始验证token有效性');
                    const res = await AuthAPI.verifyToken();
                    console.log('token验证结果:', res);

                    if (res.success) {
                        this.globalData.isLogin = true;
                        this.globalData.userInfo = res.data.user;
                        // 确保token正确设置
                        wx.setStorageSync('token', token);
                        // 更新本地存储的用户信息
                        wx.setStorageSync('userInfo', res.data.user);
                        console.log('token验证成功，已更新用户信息');
                        return true;
                    } else {
                        // token无效，清除登录状态
                        console.warn('token验证失败，清除登录状态');
                        this.clearUserInfo();
                    }
                } catch (networkError) {
                    console.log('网络验证失败，使用本地缓存的用户信息:', networkError);
                    // 如果网络请求失败但有本地用户信息，仍然认为已登录
                    if (localUserInfo) {
                        return true;
                    }
                }
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
        }

        this.globalData.isLogin = false;
        this.globalData.userInfo = null;
        return false;
    },

    // 设置用户信息
    setUserInfo(userInfo) {
        this.globalData.userInfo = userInfo;
        this.globalData.isLogin = true;
        wx.setStorageSync('userInfo', userInfo);
    },

    // 清除用户信息
    clearUserInfo() {
        this.globalData.userInfo = null;
        this.globalData.isLogin = false;
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('token');
    }
}); 