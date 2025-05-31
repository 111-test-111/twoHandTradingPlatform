const { MessageAPI } = require('../../../utils/api');

Page({
    data: {
        conversations: [],
        loading: true,
        loadingMore: false,
        hasMore: true,
        page: 1,

        // 删除确认
        showDeleteModal: false,
        deleteTarget: {
            id: '',
            name: ''
        },

        // 滑动相关变量
        startX: 0,
        moveX: 0
    },

    onLoad() {
        this.loadConversations();
    },

    onShow() {
        // 每次显示页面时刷新会话列表
        if (this.data.conversations.length > 0) {
            this.refreshConversations(false);
        } else {
            this.refreshConversations();
        }
    },

    onPullDownRefresh() {
        this.refreshConversations().finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loadingMore) {
            this.loadMoreConversations();
        }
    },

    // 刷新会话列表
    async refreshConversations(showLoading = true) {
        this.setData({
            page: 1,
            hasMore: true
        });
        await this.loadConversations(showLoading);
    },

    // 加载会话列表
    async loadConversations(showLoading = true) {
        if (this.data.loadingMore) return;

        try {
            if (showLoading) {
                this.setData({ loading: true });
            }

            const res = await MessageAPI.getConversations({
                page: 1,
                pageSize: 20
            });

            if (res.success) {
                const conversations = this.processConversations(res.data.records);
                this.setData({
                    conversations,
                    hasMore: res.data.pagination.hasNext,
                    page: 1
                });
            }
        } catch (error) {
            console.error('加载会话列表失败:', error);
            if (showLoading) {
                wx.showToast({
                    title: '加载失败',
                    icon: 'error'
                });
            }
        } finally {
            this.setData({ loading: false });
        }
    },

    // 加载更多会话
    async loadMoreConversations() {
        if (this.data.loadingMore || !this.data.hasMore) return;

        try {
            this.setData({ loadingMore: true });

            const nextPage = this.data.page + 1;
            const res = await MessageAPI.getConversations({
                page: nextPage,
                pageSize: 20
            });

            if (res.success) {
                const newConversations = this.processConversations(res.data.records);
                const allConversations = [...this.data.conversations, ...newConversations];

                this.setData({
                    conversations: allConversations,
                    hasMore: res.data.pagination.hasNext,
                    page: nextPage
                });
            }
        } catch (error) {
            console.error('加载更多会话失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
        } finally {
            this.setData({ loadingMore: false });
        }
    },

    // 处理会话数据
    processConversations(conversations) {
        return conversations.map(conv => {
            return {
                id: conv.id,
                otherUser: conv.otherUser,
                lastMessage: this.truncateMessage(conv.lastMessage?.content || ''),
                lastMessageTime: this.formatTime(conv.lastMessageTime),
                unreadCount: conv.unreadCount || 0,
                productInfo: conv.productInfo || null,
                slideOpen: false
            };
        });
    },

    // 截断消息文本，最多显示10个字符（中英文混合）
    truncateMessage(message) {
        if (!message) return '[暂无消息]';

        let displayLength = 0;
        let result = '';

        for (let i = 0; i < message.length; i++) {
            const char = message[i];

            // 中文字符占2个显示长度，英文/数字/符号占1个显示长度
            const charLength = /[\u4e00-\u9fa5]/.test(char) ? 2 : 1;

            if (displayLength + charLength > 25) { // 大约10个中文字符的长度
                result += '...';
                break;
            }

            result += char;
            displayLength += charLength;
        }

        return result || '[暂无消息]';
    },

    // 格式化时间
    formatTime(timeStr) {
        if (!timeStr) return '';

        const time = new Date(timeStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const timeDate = new Date(time.getFullYear(), time.getMonth(), time.getDate());

        if (timeDate.getTime() === today.getTime()) {
            // 今天：显示时间
            return time.toLocaleTimeString().slice(0, 5);
        } else if (timeDate.getTime() === yesterday.getTime()) {
            // 昨天
            return '昨天';
        } else if (now.getTime() - time.getTime() < 7 * 24 * 60 * 60 * 1000) {
            // 一周内：显示星期
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return weekdays[time.getDay()];
        } else {
            // 超过一周：显示日期
            return time.toLocaleDateString().slice(5); // 去掉年份
        }
    },

    // 打开聊天页面
    openChat(e) {
        const conversation = e.currentTarget.dataset.conversation;
        if (!conversation) return;

        // 如果是左滑状态则不跳转
        if (conversation.slideOpen) return;

        wx.navigateTo({
            url: `/pages/message/chat/chat?conversationId=${conversation.id}`
        });
    },

    // 触摸开始事件
    touchStart(e) {
        if (e.touches.length !== 1) return;
        this.setData({
            startX: e.touches[0].clientX,
            moveX: 0
        });
    },

    // 触摸移动事件
    touchMove(e) {
        if (e.touches.length !== 1) return;

        const moveX = e.touches[0].clientX;
        const deltaX = this.data.startX - moveX;

        // 如果是向左滑动
        if (deltaX > 10) {
            this.setData({
                moveX: deltaX
            });
        }
    },

    // 触摸结束事件
    touchEnd(e) {
        const index = e.currentTarget.dataset.index;
        const deltaX = this.data.moveX;
        const conversations = this.data.conversations;

        // 先关闭所有其他开着的滑块
        conversations.forEach((item, idx) => {
            if (idx !== index && item.slideOpen) {
                item.slideOpen = false;
            }
        });

        // 更新当前滑块状态
        if (deltaX > 50) {
            // 滑动距离大于50px则打开操作按钮
            conversations[index].slideOpen = true;
        } else {
            conversations[index].slideOpen = false;
        }

        this.setData({
            conversations,
            moveX: 0
        });
    },

    // 标记为已读
    async markAsRead(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;

        try {
            const res = await MessageAPI.markAsRead(id);
            if (res.success) {
                // 更新本地数据
                const conversations = this.data.conversations.map(conv => {
                    if (conv.id === id) {
                        return { ...conv, unreadCount: 0, slideOpen: false };
                    }
                    return conv;
                });

                this.setData({ conversations });

                wx.showToast({
                    title: '已标为已读',
                    icon: 'success'
                });
            }
        } catch (error) {
            console.error('标记已读失败:', error);
            wx.showToast({
                title: '操作失败',
                icon: 'error'
            });
        }
    },

    // 确认删除会话
    confirmDeleteConversation(e) {
        const id = e.currentTarget.dataset.id;
        const name = e.currentTarget.dataset.name;

        if (!id) return;

        this.setData({
            showDeleteModal: true,
            deleteTarget: {
                id,
                name
            }
        });
    },

    // 隐藏删除弹窗
    hideDeleteModal() {
        this.setData({
            showDeleteModal: false,
            deleteTarget: { id: '', name: '' }
        });
    },

    // 确认删除
    async confirmDelete() {
        const { id } = this.data.deleteTarget;
        if (!id) return;

        try {
            wx.showLoading({ title: '删除中...' });

            const res = await MessageAPI.deleteConversation(id);
            if (res.success) {
                // 从列表中移除
                const conversations = this.data.conversations.filter(conv => conv.id !== id);
                this.setData({ conversations });

                wx.showToast({
                    title: '删除成功',
                    icon: 'success'
                });
            } else {
                throw new Error(res.message || '删除失败');
            }
        } catch (error) {
            console.error('删除会话失败:', error);
            wx.showToast({
                title: '删除失败',
                icon: 'error'
            });
        } finally {
            wx.hideLoading();
            this.hideDeleteModal();
        }
    },

    // 页面分享
    onShareAppMessage() {
        return {
            title: '消息中心',
            path: '/pages/message/list/list'
        };
    }
}); 