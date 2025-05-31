const { MessageAPI, UserAPI } = require('../../../utils/api');

Page({
    data: {
        // 聊天相关数据
        conversationId: '',
        otherUserId: '',
        otherUser: {},
        currentUser: {},
        messages: [],

        // 输入相关
        inputText: '',
        inputFocus: false,
        sending: false,

        // 滚动相关
        scrollTop: 0,
        scrollIntoView: '',

        // 历史消息
        hasMoreHistory: true,
        loadingHistory: false,
        page: 1,

        // 用户信息弹窗
        showUserModal: false,
        selectedUser: {},

        // 上次活跃时间（用于判断是否显示时间）
        lastActiveTime: null
    },

    onLoad(options) {
        console.log('聊天页面参数:', options);

        // 获取参数
        const { userId, productId, conversationId } = options;

        if (conversationId) {
            this.setData({ conversationId });
            this.loadConversation(conversationId);
        } else if (userId) {
            this.setData({ otherUserId: userId });
            this.initChat(userId, productId);
        } else {
            wx.showToast({
                title: '参数错误',
                icon: 'error'
            });
            wx.navigateBack();
            return;
        }

        // 获取当前用户信息
        this.loadCurrentUser();

        // 设置页面标题
        wx.setNavigationBarTitle({
            title: '聊天'
        });
    },

    onShow() {
        // 页面显示时滚动到底部并标记为已读
        this.scrollToBottom();
        
        // 如果有会话ID，则标记消息为已读
        if (this.data.conversationId) {
            this.markAsRead();
        }
    },

    onHide() {
        // 页面隐藏时取消输入框焦点
        this.setData({ inputFocus: false });
    },

    // 初始化聊天
    async initChat(otherUserId, productId) {
        try {
            wx.showLoading({ title: '加载中...' });

            // 加载对方用户信息
            await this.loadOtherUser(otherUserId);

            // 创建或获取对话
            const conversation = await MessageAPI.createOrGetConversation({
                otherUserId,
                productId
            });

            if (conversation.success) {
                this.setData({
                    conversationId: conversation.data.id
                });

                // 加载消息历史
                await this.loadMessages();
            }
        } catch (error) {
            console.error('初始化聊天失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 加载已存在的对话
    async loadConversation(conversationId) {
        try {
            wx.showLoading({ title: '加载中...' });

            // 获取对话信息
            const res = await MessageAPI.getConversation(conversationId);
            if (res.success) {
                const conversation = res.data;
                this.setData({
                    otherUserId: conversation.otherUserId,
                    otherUser: conversation.otherUser || {},
                    conversationId
                });

                // 加载对方用户信息
                if (!conversation.otherUser) {
                    await this.loadOtherUser(conversation.otherUserId);
                }

                // 加载消息历史
                await this.loadMessages();

                // 标记消息为已读
                await this.markAsRead();
            }
        } catch (error) {
            console.error('加载对话失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 加载当前用户信息
    async loadCurrentUser() {
        try {
            const userInfo = wx.getStorageSync('userInfo');
            if (userInfo) {
                this.setData({ currentUser: userInfo });
            }
        } catch (error) {
            console.error('加载当前用户信息失败:', error);
        }
    },

    // 加载对方用户信息
    async loadOtherUser(userId) {
        try {
            const res = await UserAPI.getPublicInfo(userId);
            if (res.success) {
                this.setData({
                    otherUser: res.data
                });

                // 更新页面标题
                wx.setNavigationBarTitle({
                    title: res.data.nickname || '聊天'
                });
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
        }
    },

    // 加载消息列表
    async loadMessages(loadMore = false) {
        if (this.data.loadingHistory) return;

        try {
            this.setData({ loadingHistory: true });

            const page = loadMore ? this.data.page + 1 : 1;
            const res = await MessageAPI.getMessages(this.data.conversationId, {
                page,
                pageSize: 20
            });

            if (res.success) {
                let newMessages = this.processMessages(res.data.records);

                if (loadMore) {
                    // 加载更多：插入到前面
                    newMessages = [...newMessages, ...this.data.messages];
                }

                this.setData({
                    messages: newMessages,
                    hasMoreHistory: res.data.pagination.hasNext,
                    page
                });

                // 首次加载或发送新消息时滚动到底部
                if (!loadMore) {
                    setTimeout(() => {
                        this.scrollToBottom();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('加载消息失败:', error);
            if (!loadMore) {
                wx.showToast({
                    title: '加载消息失败',
                    icon: 'error'
                });
            }
        } finally {
            this.setData({ loadingHistory: false });
        }
    },

    // 处理消息数据
    processMessages(messages) {
        const currentUserId = this.data.currentUser.id;
        let lastTime = null;

        return messages.map((msg, index) => {
            const isOwn = msg.senderId === currentUserId;
            const msgTime = new Date(msg.createdAt);

            // 判断是否显示时间（与上条消息间隔超过5分钟）
            let showTime = false;
            if (!lastTime || (msgTime - lastTime) > 5 * 60 * 1000) {
                showTime = true;
                lastTime = msgTime;
            }

            return {
                id: msg.id,
                content: msg.content,
                isOwn,
                time: this.formatMessageTime(msgTime),
                timeStr: this.formatTimeString(msgTime),
                showTime,
                status: msg.status || 'sent'
            };
        });
    },

    // 格式化消息时间
    formatMessageTime(time) {
        const now = new Date();
        const diff = now - time;

        if (diff < 60 * 1000) return '刚刚';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
        if (diff < 24 * 60 * 60 * 1000) return time.toLocaleTimeString().slice(0, 5);

        return time.toLocaleDateString();
    },

    // 格式化时间字符串
    formatTimeString(time) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDate = new Date(time.getFullYear(), time.getMonth(), time.getDate());

        if (msgDate.getTime() === today.getTime()) {
            return `今天 ${time.toLocaleTimeString().slice(0, 5)}`;
        } else if (msgDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
            return `昨天 ${time.toLocaleTimeString().slice(0, 5)}`;
        } else {
            return time.toLocaleDateString();
        }
    },

    // 输入框变化
    onInputChange(e) {
        this.setData({
            inputText: e.detail.value
        });
    },

    // 输入框聚焦
    onInputFocus() {
        this.setData({
            inputFocus: true
        });
        // 聚焦时滚动到底部
        setTimeout(() => {
            this.scrollToBottom();
        }, 300);
    },

    // 输入框失焦
    onInputBlur() {
        this.setData({
            inputFocus: false
        });
    },

    // 发送消息
    async sendMessage() {
        const content = this.data.inputText.trim();
        if (!content || this.data.sending) return;

        this.setData({
            sending: true,
            inputText: ''
        });

        // 生成临时消息ID
        const tempId = `temp_${Date.now()}`;
        const tempMessage = {
            id: tempId,
            content,
            isOwn: true,
            time: '发送中',
            timeStr: this.formatTimeString(new Date()),
            showTime: false,
            status: 'sending'
        };

        // 立即显示消息
        const newMessages = [...this.data.messages, tempMessage];
        this.setData({ messages: newMessages });
        this.scrollToBottom();

        try {
            const res = await MessageAPI.sendMessage({
                conversationId: this.data.conversationId,
                content,
                receiverId: this.data.otherUserId
            });

            if (res.success) {
                // 更新消息状态
                const updatedMessages = this.data.messages.map(msg => {
                    if (msg.id === tempId) {
                        return {
                            ...msg,
                            id: res.data.id,
                            time: this.formatMessageTime(new Date()),
                            status: 'sent'
                        };
                    }
                    return msg;
                });

                this.setData({ messages: updatedMessages });
            } else {
                throw new Error(res.message || '发送失败');
            }
        } catch (error) {
            console.error('发送消息失败:', error);

            // 更新消息状态为失败
            const updatedMessages = this.data.messages.map(msg => {
                if (msg.id === tempId) {
                    return {
                        ...msg,
                        time: '发送失败',
                        status: 'failed'
                    };
                }
                return msg;
            });

            this.setData({ messages: updatedMessages });

            wx.showToast({
                title: '发送失败',
                icon: 'error'
            });
        } finally {
            this.setData({ sending: false });
        }
    },

    // 加载更多历史消息
    loadMoreHistory() {
        if (this.data.hasMoreHistory && !this.data.loadingHistory) {
            this.loadMessages(true);
        }
    },

    // 滚动到底部
    scrollToBottom() {
        this.setData({
            scrollIntoView: 'bottom'
        });
    },

    // 查看用户资料
    viewUserProfile() {
        this.setData({
            selectedUser: this.data.otherUser,
            showUserModal: true
        });
    },

    // 查看自己的资料
    viewMyProfile() {
        this.setData({
            selectedUser: this.data.currentUser,
            showUserModal: true
        });
    },

    // 隐藏用户信息弹窗
    hideUserModal() {
        this.setData({
            showUserModal: false
        });
    },

    // 跳转到用户详细资料
    goToUserProfile() {
        this.hideUserModal();
        wx.navigateTo({
            url: `/pages/user/homepage/homepage?id=${this.data.selectedUser.id}`
        });
    },

    // 页面分享
    onShareAppMessage() {
        return {
            title: `与${this.data.otherUser.nickname || '用户'}的聊天`,
            path: `/pages/message/chat/chat?userId=${this.data.otherUserId}`
        };
    },

    // 标记消息为已读
    async markAsRead() {
        try {
            await MessageAPI.markAsRead(this.data.conversationId);
        } catch (error) {
            console.error('标记已读失败:', error);
        }
    }
}); 