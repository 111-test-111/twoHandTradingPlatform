const { AuthAPI } = require('../../../utils/api');
const app = getApp();

Page({
    data: {
        loading: false,
        canIUseGetUserProfile: false,
        canIUseOpenData: wx.canIUse('open-data.type.userAvatarUrl') && wx.canIUse('open-data.type.userNickName'),

        // 界面状态
        showPrivacyModal: false,
        agreePrivacy: false,

        // 用户信息预览
        previewUserInfo: null,
        showUserInfo: false
    },

    onLoad(options) {
        console.log('登录页面加载', options);

        // 检查微信API支持情况
        if (wx.getUserProfile) {
            this.setData({
                canIUseGetUserProfile: true
            });
        }

        // 检查是否已经登录
        this.checkLoginStatus();

        // 保存来源页面，用于登录成功后跳转
        this.fromPage = options.from || 'profile';
    },

    onShow() {
        // 页面显示时检查登录状态
        this.checkLoginStatus();
    },

    // 检查登录状态
    checkLoginStatus() {
        if (app.globalData.isLogin) {
            // 已登录，跳转回来源页面
            this.navigateBack();
        }
    },

    // 微信授权登录
    async wechatLogin() {
        if (this.data.loading) return;

        try {
            this.setData({ loading: true });

            // 1. 获取用户信息
            let userInfo = null;
            if (this.data.canIUseGetUserProfile) {
                // 使用新版API
                userInfo = await this.getUserProfile();
            } else {
                // 使用旧版API（兼容）
                userInfo = await this.getUserInfo();
            }
            console.log('获取到用户信息:', userInfo);

            // 2. 获取登录凭证
            const loginRes = await this.wxLogin();
            if (!loginRes.code) {
                throw new Error('获取微信登录凭证失败');
            }
            console.log('获取到微信登录凭证:', loginRes.code);

            // 3. 调用后端登录API
            const authRes = await AuthAPI.wechatLogin(loginRes.code, userInfo);

            if (authRes.success) {
                // 4. 登录成功，保存用户信息
                const token = authRes.data.token;
                const user = authRes.data.user;

                // 保存token
                wx.setStorageSync('token', token);
                console.log('已保存token:', token);

                // 确保API服务也设置了token
                const { apiService } = require('../../../utils/api');
                apiService.setToken(token);
                console.log('已设置API服务的token');

                // 更新全局用户信息
                app.setUserInfo(user);

                console.log('登录成功:', user);

                // 5. 显示成功提示
                wx.showToast({
                    title: '登录成功',
                    icon: 'success',
                    duration: 1500
                });

                // 6. 延迟跳转，让用户看到成功提示
                setTimeout(() => {
                    this.navigateBack();
                }, 1500);

            } else {
                throw new Error(authRes.message || '登录失败');
            }

        } catch (error) {
            console.error('微信登录失败:', error);

            let errorMessage = '登录失败';

            if (error.message) {
                if (error.message.includes('getUserProfile')) {
                    errorMessage = '需要授权获取用户信息';
                } else if (error.message.includes('network')) {
                    errorMessage = '网络连接失败，请检查网络';
                } else {
                    errorMessage = error.message;
                }
            }

            wx.showModal({
                title: '登录失败',
                content: errorMessage,
                showCancel: false,
                confirmText: '知道了'
            });

        } finally {
            this.setData({ loading: false });
        }
    },

    // 获取微信登录凭证
    wxLogin() {
        return new Promise((resolve, reject) => {
            wx.login({
                success: (res) => {
                    console.log('wx.login success:', res);
                    resolve(res);
                },
                fail: (error) => {
                    console.error('wx.login fail:', error);
                    reject(new Error('获取微信登录凭证失败'));
                }
            });
        });
    },

    // 获取用户信息（新版API）
    getUserProfile() {
        return new Promise((resolve, reject) => {
            wx.getUserProfile({
                desc: '登录校园二手交易平台',
                success: (res) => {
                    console.log('getUserProfile success:', res.userInfo);
                    resolve(res.userInfo);
                },
                fail: (error) => {
                    console.error('getUserProfile fail:', error);
                    reject(new Error('用户取消授权或获取用户信息失败'));
                }
            });
        });
    },

    // 获取用户信息（旧版API，兼容用）
    getUserInfo() {
        return new Promise((resolve, reject) => {
            wx.getUserInfo({
                success: (res) => {
                    console.log('getUserInfo success:', res.userInfo);
                    resolve(res.userInfo);
                },
                fail: (error) => {
                    console.error('getUserInfo fail:', error);
                    reject(new Error('获取用户信息失败，请在设置中开启授权'));
                }
            });
        });
    },

    // 快速登录（用于演示）
    async quickLogin() {
        if (this.data.loading) return;

        try {
            this.setData({ loading: true });

            // 模拟快速登录，使用默认用户信息
            const mockUserInfo = {
                nickName: '演示用户',
                avatarUrl: '/assets/images/placeholder.png',
                gender: 1,
                city: '广州',
                province: '广东',
                country: '中国'
            };

            // 获取登录凭证
            const loginRes = await this.wxLogin();

            // 调用后端API
            const authRes = await AuthAPI.wechatLogin(loginRes.code, mockUserInfo);

            if (authRes.success) {
                // 保存用户信息
                wx.setStorageSync('token', authRes.data.token);
                console.log('已保存token:', authRes.data.token);

                // 确保API服务也设置了token
                const { apiService } = require('../../../utils/api');
                apiService.setToken(authRes.data.token);
                console.log('已设置API服务的token');

                app.setUserInfo(authRes.data.user);

                wx.showToast({
                    title: '快速登录成功',
                    icon: 'success'
                });

                setTimeout(() => {
                    this.navigateBack();
                }, 1500);
            }

        } catch (error) {
            console.error('快速登录失败:', error);
            wx.showToast({
                title: '快速登录失败',
                icon: 'none'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // 跳转回来源页面
    navigateBack() {
        const pages = getCurrentPages();

        if (pages.length > 1) {
            // 有上一页，直接返回
            wx.navigateBack();
        } else {
            // 没有上一页，跳转到首页
            wx.reLaunch({
                url: '/pages/index/index'
            });
        }
    },

    // 显示隐私协议
    showPrivacy() {
        this.setData({
            showPrivacyModal: true
        });
    },

    // 关闭隐私协议
    closePrivacy() {
        this.setData({
            showPrivacyModal: false
        });
    },

    // 同意隐私协议
    agreePrivacyPolicy() {
        this.setData({
            agreePrivacy: true,
            showPrivacyModal: false
        });
    },

    // 查看用户协议
    viewUserAgreement() {
        wx.showModal({
            title: '用户协议',
            content: '欢迎使用校园二手交易平台！\n\n1. 请遵守校园规章制度\n2. 确保交易物品的真实性\n3. 文明交易，诚信为本\n4. 保护个人隐私信息\n5. 禁止发布违法违规内容\n\n如有疑问，请联系客服。',
            showCancel: false,
            confirmText: '我知道了'
        });
    },

    // 联系客服
    contactService() {
        wx.showModal({
            title: '联系客服',
            content: '客服电话：13705267759\n\n工作时间：周一至周五 9:00-18:00\n\n您也可以在小程序内留言，我们会及时回复。',
            showCancel: false,
            confirmText: '知道了'
        });
    },

    // 访客模式（跳过登录）
    guestMode() {
        wx.showModal({
            title: '访客模式',
            content: '访客模式下功能受限，建议登录后享受完整服务',
            confirmText: '继续',
            cancelText: '去登录',
            success: (res) => {
                if (res.confirm) {
                    // 用户选择继续访客模式
                    this.navigateBack();
                }
                // 选择去登录则不做任何操作，留在登录页面
            }
        });
    }
}); 