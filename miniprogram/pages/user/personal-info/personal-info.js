const { UserAPI } = require('../../../utils/api');
const app = getApp();

Page({
    data: {
        userInfo: null,
        isLogin: false,
        loading: false,
        saving: false, // 保存状态
        hasChanges: false, // 是否有未保存的更改

        // 原始用户信息字段（从服务器获取）
        originalData: {
            nickname: '',
            realName: '',
            phone: '',
            userId: '',
            studentId: '',
            campus: '',
            dormitory: '',
            contactInfo: '',
            gender: 0
        },

        // 当前编辑中的用户信息字段
        nickname: '',
        realName: '',
        phone: '',
        userId: '',
        studentId: '',
        campus: '',
        dormitory: '',
        contactInfo: '',
        gender: 0,

        // UI控制
        showGenderPicker: false,
        genderOptions: ['未知', '男', '女']
    },

    onLoad() {
        console.log('个人信息编辑页面');
        this.loadUserInfo();
    },

    onShow() {
        // 页面显示时刷新用户信息
        this.loadUserInfo();
    },

    // 加载用户信息
    async loadUserInfo() {
        try {
            let isLogin = app.globalData.isLogin;
            let userInfo = app.globalData.userInfo;

            if (!userInfo) {
                const localUserInfo = wx.getStorageSync('userInfo');
                const token = wx.getStorageSync('token');

                if (localUserInfo && token) {
                    userInfo = localUserInfo;
                    isLogin = true;
                    app.globalData.userInfo = userInfo;
                    app.globalData.isLogin = true;
                }
            }

            if (isLogin && userInfo) {
                const userData = {
                    nickname: userInfo.nickname || '',
                    realName: userInfo.realName || '',
                    phone: userInfo.phone || '',
                    userId: userInfo.userId || (userInfo.id ? userInfo.id.substring(0, 8) + '...' : ''),
                    studentId: userInfo.studentId || '',
                    campus: userInfo.campus || '',
                    dormitory: userInfo.dormitory || '',
                    contactInfo: userInfo.contactInfo || '',
                    gender: userInfo.gender || 0
                };

                this.setData({
                    isLogin: true,
                    userInfo: userInfo,
                    originalData: { ...userData }, // 保存原始数据
                    ...userData, // 设置当前编辑数据
                    hasChanges: false
                });
            } else {
                wx.showToast({
                    title: '请先登录',
                    icon: 'none'
                });
                wx.navigateBack();
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            wx.showToast({
                title: '加载用户信息失败',
                icon: 'none'
            });
        }
    },

    // 编辑字段
    editField(e) {
        const field = e.currentTarget.dataset.field;
        const currentValue = this.data[field] || '';

        if (field === 'userId') {
            this.showUserIdModal();
            return;
        }

        if (field === 'gender') {
            this.setData({
                showGenderPicker: true
            });
            return;
        }

        let title = '';
        let placeholder = '';
        switch (field) {
            case 'nickname':
                title = '修改昵称';
                placeholder = '请输入昵称';
                break;
            case 'realName':
                title = '修改真实姓名';
                placeholder = '请输入真实姓名';
                break;
            case 'phone':
                title = '修改手机号';
                placeholder = '请输入手机号';
                break;
            case 'studentId':
                title = '修改学号';
                placeholder = '请输入学号';
                break;
            case 'campus':
                title = '修改校区';
                placeholder = '请输入校区';
                break;
            case 'dormitory':
                title = '修改宿舍楼';
                placeholder = '请输入宿舍楼';
                break;
            case 'contactInfo':
                title = '修改联系方式';
                placeholder = '请输入联系方式';
                break;
        }

        wx.showModal({
            title: title,
            editable: true,
            placeholderText: placeholder,
            content: currentValue,
            success: (res) => {
                if (res.confirm && res.content !== undefined) {
                    const newValue = res.content.trim();

                    // 手机号验证
                    if (field === 'phone' && newValue && !/^1[3-9]\d{9}$/.test(newValue)) {
                        wx.showToast({
                            title: '请输入正确的手机号',
                            icon: 'none'
                        });
                        return;
                    }

                    this.updateLocalField(field, newValue);
                }
            }
        });
    },

    // 显示用户ID模态框
    showUserIdModal() {
        const fullUserId = this.data.userInfo ? this.data.userInfo.id : '';

        wx.showModal({
            title: '用户ID',
            content: fullUserId,
            showCancel: true,
            cancelText: '关闭',
            confirmText: '复制',
            success: (res) => {
                if (res.confirm) {
                    // 复制到剪切板
                    wx.setClipboardData({
                        data: fullUserId,
                        success: () => {
                            wx.showToast({
                                title: '已复制到剪切板',
                                icon: 'success'
                            });
                        },
                        fail: () => {
                            wx.showToast({
                                title: '复制失败',
                                icon: 'none'
                            });
                        }
                    });
                }
            }
        });
    },

    // 更新本地字段（不保存到服务器）
    updateLocalField(field, value) {
        const updateData = {};
        updateData[field] = value;

        // 检查是否有变化
        const hasChanges = this.checkHasChanges({ ...this.data, ...updateData });

        this.setData({
            ...updateData,
            hasChanges: hasChanges
        });
    },

    // 检查是否有未保存的更改
    checkHasChanges(currentData = this.data) {
        const original = this.data.originalData;
        const fields = ['nickname', 'realName', 'phone', 'studentId', 'campus', 'dormitory', 'contactInfo', 'gender'];

        return fields.some(field => {
            return currentData[field] !== original[field];
        });
    },

    // 性别选择器改变
    onGenderPickerChange(e) {
        const index = parseInt(e.detail.value);
        this.updateLocalField('gender', index);
        this.setData({
            showGenderPicker: false
        });
    },

    // 取消性别选择
    onGenderPickerCancel() {
        this.setData({
            showGenderPicker: false
        });
    },

    // 保存所有更改
    async saveChanges() {
        if (!this.data.hasChanges) {
            wx.showToast({
                title: '没有需要保存的更改',
                icon: 'none'
            });
            return;
        }

        try {
            this.setData({ saving: true });

            wx.showLoading({
                title: '保存中...'
            });

            // 准备更新数据
            const updateData = {
                nickname: this.data.nickname,
                realName: this.data.realName,
                phone: this.data.phone,
                studentId: this.data.studentId,
                campus: this.data.campus,
                dormitory: this.data.dormitory,
                contactInfo: this.data.contactInfo,
                gender: this.data.gender
            };

            const res = await UserAPI.updateProfile(updateData);

            if (res.success) {
                // 更新全局用户信息
                const updatedUser = { ...app.globalData.userInfo, ...updateData };
                app.setUserInfo(updatedUser);

                // 更新原始数据，清除变更状态
                this.setData({
                    originalData: { ...updateData, userId: this.data.userId },
                    hasChanges: false,
                    userInfo: updatedUser
                });

                wx.hideLoading();
                wx.showToast({
                    title: '保存成功',
                    icon: 'success'
                });

                // 延迟返回上一页
                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
            } else {
                throw new Error(res.message || '保存失败');
            }
        } catch (error) {
            console.error('保存失败:', error);
            wx.hideLoading();
            wx.showToast({
                title: error.message || '保存失败',
                icon: 'none'
            });
        } finally {
            this.setData({ saving: false });
        }
    },

    // 取消更改
    cancelChanges() {
        if (!this.data.hasChanges) {
            wx.navigateBack();
            return;
        }

        wx.showModal({
            title: '确认取消',
            content: '您有未保存的更改，确定要放弃这些更改吗？',
            success: (res) => {
                if (res.confirm) {
                    // 恢复原始数据
                    this.setData({
                        ...this.data.originalData,
                        hasChanges: false
                    });
                    wx.navigateBack();
                }
            }
        });
    },

    // 返回上一页（带提示）
    goBack() {
        this.cancelChanges();
    }
}); 