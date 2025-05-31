const { AuthAPI, UserAPI } = require('../../../utils/api');
const app = getApp();

Page({
    data: {
        userInfo: null,
        isLogin: false,
        loading: false,
        avatarUrl: '',
        nickName: '',
        gender: 0,
        city: '',
        province: '',
        country: '',
        language: '',
        canIUseGetUserProfile: false,
        canIUseOpenData: wx.canIUse('open-data.type.userAvatarUrl') && wx.canIUse('open-data.type.userNickName')
    },

    onLoad() {
        console.log('用户设置页面');

        // 检查API支持情况
        if (wx.getUserProfile) {
            this.setData({
                canIUseGetUserProfile: true
            });
        }

        this.loadUserInfo();
    },

    onShow() {
        // 页面显示时刷新用户信息
        this.loadUserInfo();
    },

    // 加载用户信息
    async loadUserInfo() {
        try {
            // 检查是否已登录
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

            if (isLogin && userInfo) {
                this.setData({
                    isLogin: true,
                    userInfo: userInfo,
                    avatarUrl: userInfo.avatar || '',
                    nickName: userInfo.nickname || '',
                    gender: userInfo.gender || 0,
                    city: userInfo.city || '',
                    province: userInfo.province || '',
                    country: userInfo.country || '',
                    language: userInfo.language || ''
                });
            } else {
                this.setData({
                    isLogin: false,
                    userInfo: null
                });
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            wx.showToast({
                title: '加载用户信息失败',
                icon: 'none'
            });
        }
    },

    // 微信登录
    async wechatLogin() {
        if (this.data.loading) return;

        try {
            this.setData({ loading: true });

            // 先获取登录凭证
            const loginRes = await this.wxLogin();
            const code = loginRes.code;

            // 获取用户信息
            let userInfo = null;
            try {
                if (this.data.canIUseGetUserProfile) {
                    userInfo = await this.getUserProfile();
                } else {
                    // 兼容旧版本
                    userInfo = await this.getUserInfo();
                }
            } catch (userInfoError) {
                // 针对getUserProfile的特定错误处理
                if (userInfoError.errMsg && userInfoError.errMsg.includes('getUserProfile:fail can only be invoked by user TAP gesture')) {
                    throw new Error('请直接点击登录按钮进行登录');
                }
                throw userInfoError;
            }

            // 调用后端API进行登录
            const authRes = await AuthAPI.wechatLogin(code, userInfo);

            if (authRes.success) {
                // 保存token
                const token = authRes.data.token;
                wx.setStorageSync('token', token);

                // 更新全局用户信息
                app.setUserInfo(authRes.data.user);

                // 更新页面数据
                this.setData({
                    isLogin: true,
                    userInfo: authRes.data.user,
                    avatarUrl: authRes.data.user.avatar || userInfo.avatar,
                    nickName: authRes.data.user.nickname || userInfo.nickname,
                    gender: authRes.data.user.gender || userInfo.gender,
                    city: authRes.data.user.city || userInfo.city,
                    province: authRes.data.user.province || userInfo.province,
                    country: authRes.data.user.country || userInfo.country,
                    language: authRes.data.user.language || userInfo.language
                });

                wx.showToast({
                    title: '登录成功',
                    icon: 'success'
                });
            } else {
                throw new Error(authRes.message || '登录失败');
            }

        } catch (error) {
            console.error('微信登录失败:', error);

            let errorMessage = '登录失败';
            if (error.message) {
                if (error.message.includes('用户取消') || error.message.includes('cancel')) {
                    // 用户取消授权，不显示错误提示
                    return;
                } else if (error.message.includes('TAP gesture')) {
                    errorMessage = '请直接点击登录按钮进行登录';
                } else {
                    errorMessage = error.message;
                }
            }

            wx.showToast({
                title: errorMessage,
                icon: 'none'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // 获取微信登录凭证
    wxLogin() {
        return new Promise((resolve, reject) => {
            wx.login({
                success: resolve,
                fail: reject
            });
        });
    },

    // 获取用户信息（新版API）
    getUserProfile() {
        return new Promise((resolve, reject) => {
            wx.getUserProfile({
                desc: '用于完善用户资料',
                success: (res) => {
                    resolve(res.userInfo);
                },
                fail: reject
            });
        });
    },

    // 获取用户信息（旧版API，兼容）
    getUserInfo() {
        return new Promise((resolve, reject) => {
            wx.getUserInfo({
                success: (res) => {
                    resolve(res.userInfo);
                },
                fail: reject
            });
        });
    },

    // 更新用户头像
    async updateAvatar() {
        if (!this.data.isLogin) {
            wx.showToast({
                title: '请先登录',
                icon: 'none'
            });
            return;
        }

        try {
            // 先选择图片，不显示上传提示框
            const res = await this.chooseImage();
            if (res.tempFilePaths && res.tempFilePaths.length > 0) {
                const tempFilePath = res.tempFilePaths[0];
                console.log('选择的图片路径:', tempFilePath);

                // 用户选择图片成功后，再显示上传提示框
                wx.showLoading({
                    title: '上传中...'
                });

                // 上传图片到服务器（服务器会自动更新用户头像信息）
                const uploadRes = await this.uploadImage(tempFilePath);
                console.log('上传结果:', uploadRes);

                if (uploadRes.success) {
                    // 头像上传接口已经更新了服务器端的用户数据
                    // 直接更新本地页面状态和全局数据
                    const newAvatarUrl = uploadRes.data.url;
                    const updatedUser = uploadRes.data.user;

                    // 更新全局用户信息
                    if (updatedUser) {
                        app.setUserInfo(updatedUser);
                    } else {
                        // 如果服务器没有返回完整用户信息，手动更新头像字段
                        const currentUser = { ...app.globalData.userInfo, avatar: newAvatarUrl };
                        app.setUserInfo(currentUser);
                    }

                    // 更新页面显示
                    this.setData({
                        avatarUrl: newAvatarUrl,
                        userInfo: app.globalData.userInfo
                    });

                    wx.hideLoading();
                    wx.showToast({
                        title: '头像更新成功',
                        icon: 'success'
                    });

                    console.log('头像上传完成，本地数据已更新:', {
                        newAvatarUrl: newAvatarUrl,
                        globalUserInfo: app.globalData.userInfo
                    });
                } else {
                    throw new Error(uploadRes.message || '上传失败');
                }
            }
        } catch (error) {
            console.error('更新头像失败:', error);
            wx.hideLoading();

            // 如果是用户取消选择图片，不显示错误提示
            if (error.errMsg && error.errMsg.includes('cancel')) {
                console.log('用户取消选择图片');
                return;
            }

            wx.showToast({
                title: error.message || '更新头像失败',
                icon: 'none'
            });
        }
    },

    // 选择图片
    chooseImage() {
        return new Promise((resolve, reject) => {
            wx.chooseImage({
                count: 1,
                sizeType: ['compressed'],
                sourceType: ['album', 'camera'],
                success: resolve,
                fail: reject
            });
        });
    },

    // 上传图片（需要根据后端API实现）
    uploadImage(filePath) {
        return UserAPI.uploadAvatar(filePath);
    },

    // 更新用户资料
    async updateUserProfile(data) {
        try {
            console.log('准备更新用户资料:', data);
            const res = await UserAPI.updateProfile(data);
            console.log('更新用户资料响应:', res);

            if (res.success) {
                // 更新全局用户信息
                const updatedUser = { ...app.globalData.userInfo, ...data };
                app.setUserInfo(updatedUser);

                // 更新页面状态
                this.setData({
                    userInfo: updatedUser
                });

                console.log('用户资料更新成功');
            } else {
                throw new Error(res.message || '更新失败');
            }
            return res;
        } catch (error) {
            console.error('更新用户资料失败:', error);
            throw error;
        }
    },

    // 退出登录
    logout() {
        wx.showModal({
            title: '确认退出',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (res.confirm) {
                    // 清除本地数据
                    app.clearUserInfo();

                    wx.showToast({
                        title: '已退出登录',
                        icon: 'success',
                        duration: 1500
                    });

                    // 延迟跳转到登录页面
                    setTimeout(() => {
                        wx.redirectTo({
                            url: '/pages/auth/login/login'
                        });
                    }, 1500);
                }
            }
        });
    },

    // 查看用户协议
    viewUserAgreement() {
        wx.showModal({
            title: '用户协议',
            content: '这里是用户协议内容...',
            showCancel: false
        });
    },

    // 查看隐私政策
    viewPrivacyPolicy() {
        wx.showModal({
            title: '隐私政策',
            content: '这里是隐私政策内容...',
            showCancel: false
        });
    },

    // 联系客服
    contactService() {
        wx.makePhoneCall({
            phoneNumber: '400-123-4567',
            fail: () => {
                wx.showToast({
                    title: '无法拨打电话',
                    icon: 'none'
                });
            }
        });
    },

    // 关于我们
    aboutUs() {
        wx.showModal({
            title: '关于我们',
            content: '这里是关于我们的介绍...',
            showCancel: false
        });
    }
}); 