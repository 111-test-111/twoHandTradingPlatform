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
        cursorPosition: -1, // 光标位置，-1表示自动定位到末尾

        // 录音相关
        showRecordModal: false, // 是否显示录音模态框
        isRecording: false,
        recordingTime: 0,
        recordingTimer: null,

        // 播放相关
        currentPlayingId: '', // 当前正在播放的消息ID

        // 滚动相关
        scrollTop: 0,
        scrollIntoView: '',
        disableAutoScroll: false, // 禁用自动滚动
        lastScrollPosition: 0, // 上次滚动位置

        // 历史消息
        hasMoreHistory: true,
        loadingHistory: false,
        page: 1,

        // 用户信息弹窗
        showUserModal: false,
        selectedUser: {},

        // 上次活跃时间（用于判断是否显示时间）
        lastActiveTime: null,

        // 预览图片相关
        isPreviewingImage: false,

        // 自动刷新相关
        autoRefreshTimer: null,
        lastMessageId: '' // 记录最后一条消息ID，用于检测新消息
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

        // 启动自动刷新定时器
        this.startAutoRefresh();
    },

    onShow() {
        console.log('页面显示');

        // 如果禁用了自动滚动（例如从图片预览返回），需要恢复之前的滚动位置
        if (this.data.disableAutoScroll) {
            console.log('恢复滚动位置:', this.data.lastScrollPosition);

            // 使用scrollTop恢复滚动位置
            this.setData({
                scrollTop: this.data.lastScrollPosition,
                // 延迟200ms后允许自动滚动，避免连续操作冲突
                disableAutoScroll: false
            });
        } else {
            // 正常情况下滚动到底部
            this.scrollToBottom();
        }

        // 如果有会话ID，则标记消息为已读
        if (this.data.conversationId) {
            this.markAsRead();
        }

        // 如果定时器不存在，重新启动
        if (!this.data.autoRefreshTimer) {
            this.startAutoRefresh();
        }
    },

    onHide() {
        // 页面隐藏时取消输入框焦点
        this.setData({ inputFocus: false });

        // 停止播放语音
        this.stopVoice();

        // 如果正在录音，则完成录音
        if (this.data.isRecording) {
            this.finishRecording();
        } else if (this.data.showRecordModal) {
            // 如果显示了录音模态框但未录音，则关闭模态框
            this.setData({ showRecordModal: false });
        }

        // 停止自动刷新定时器
        this.stopAutoRefresh();
    },

    onUnload() {
        // 页面卸载时释放资源
        this.stopVoice();

        // 如果正在录音，则完成录音
        if (this.data.isRecording) {
            this.finishRecording();
        } else if (this.data.showRecordModal) {
            // 如果显示了录音模态框但未录音，则关闭模态框
            this.setData({ showRecordModal: false });
        }

        // 清除录音计时器
        this.clearRecordingTimer();

        // 停止自动刷新定时器
        this.stopAutoRefresh();
    },

    // 开始自动刷新
    startAutoRefresh() {
        // 确保没有现有的定时器
        this.stopAutoRefresh();

        // 创建新的定时器，每秒执行一次
        const timer = setInterval(() => {
            this.silentRefresh();
        }, 1000);

        this.setData({ autoRefreshTimer: timer });
        console.log('已启动自动刷新定时器');

        // 显示调试信息
        this.showDebugInfo('自动刷新已启动');
    },

    // 停止自动刷新
    stopAutoRefresh() {
        if (this.data.autoRefreshTimer) {
            clearInterval(this.data.autoRefreshTimer);
            this.setData({ autoRefreshTimer: null });
            console.log('已停止自动刷新定时器');
        }
    },

    // 显示调试信息（仅在开发环境）
    showDebugInfo(message, isError = false) {
        // 控制台输出
        if (isError) {
            console.error('[调试]', message);
        } else {
            console.log('[调试]', message);
        }

        // 仅在开发环境显示调试信息
        if (true) { // 可以替换为getApp().globalData.isDev等判断
            wx.showToast({
                title: message,
                icon: 'none',
                duration: 1000
            });
        }
    },

    // 静默刷新消息（不显示加载动画，不影响用户体验）
    async silentRefresh() {
        if (!this.data.conversationId || this.data.loadingHistory) return;

        try {
            // 获取最新消息
            const res = await MessageAPI.getMessages(this.data.conversationId, {
                page: 1,
                pageSize: 20
            });

            if (res.success && res.data && res.data.records && res.data.records.length > 0) {
                const newMessages = this.processMessages(res.data.records);

                // 检查是否有新消息
                let hasNewMessages = false;

                // 获取服务器返回的最新消息的ID集合
                const serverMessageIds = new Set(newMessages.map(msg => msg.id));

                // 获取当前已有消息的ID集合
                const currentMessageIds = new Set(this.data.messages.map(msg => msg.id));

                // 检查是否有新消息（服务器返回的消息ID不在当前消息列表中）
                for (const id of serverMessageIds) {
                    if (!currentMessageIds.has(id)) {
                        hasNewMessages = true;
                        console.log(`检测到新消息，ID: ${id}`);
                        break;
                    }
                }

                // 或者检查数量是否不同（也可能有新消息）
                if (newMessages.length !== this.data.messages.length) {
                    hasNewMessages = true;
                    console.log(`消息数量变化: 服务器${newMessages.length}条，本地${this.data.messages.length}条`);
                }

                // 如果有新消息，更新消息列表
                if (hasNewMessages) {
                    console.log('检测到新消息，更新聊天记录');

                    // 记录当前滚动位置
                    let shouldScrollToBottom = false;
                    if (this.isScrolledToBottom()) {
                        shouldScrollToBottom = true;
                    }

                    // 更新消息列表
                    this.setData({
                        messages: newMessages,
                        lastMessageId: newMessages.length > 0 ? newMessages[0].id : ''
                    });

                    // 如果之前是在底部，则滚动到底部显示新消息
                    if (shouldScrollToBottom) {
                        setTimeout(() => {
                            this.scrollToBottom();
                        }, 50);
                    }

                    // 标记为已读
                    this.markAsRead();

                    // 显示调试信息
                    this.showDebugInfo('收到新消息');
                }
            }
        } catch (error) {
            console.error('静默刷新消息失败:', error);
            // 静默失败，不提示用户
            this.showDebugInfo('刷新失败:' + error.message, true);
        }
    },

    // 检查是否滚动到底部
    isScrolledToBottom() {
        // 这里使用一个简单的方法来判断：如果最近没有手动滚动，则认为在底部
        return !this.data.disableAutoScroll;
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
            console.log(`加载消息页: ${page}, 加载更多: ${loadMore}`);

            const res = await MessageAPI.getMessages(this.data.conversationId, {
                page,
                pageSize: 20
            });

            if (res.success) {
                let newMessages = this.processMessages(res.data.records);
                console.log(`获取到 ${newMessages.length} 条消息`);

                if (loadMore) {
                    // 追加历史消息
                    newMessages = [...newMessages, ...this.data.messages];
                    this.setData({
                        messages: newMessages,
                        page,
                        hasMoreHistory: res.data.records.length === 20,
                        loadingHistory: false
                    });
                } else {
                    // 首次加载或刷新，直接替换
                    this.setData({
                        messages: newMessages,
                        page: 1,
                        hasMoreHistory: res.data.records.length === 20,
                        loadingHistory: false
                    });

                    // 首次加载后滚动到底部
                    setTimeout(() => {
                        this.scrollToBottom();
                    }, 300);
                }

                // 更新最后一条消息ID，用于自动刷新检测
                if (newMessages.length > 0) {
                    // 创建消息ID集合用于调试
                    const messageIds = newMessages.map(msg => msg.id);
                    console.log('当前消息ID集合:', messageIds);

                    // 保存最后一条消息ID
                    this.setData({
                        lastMessageId: newMessages[0]?.id || ''
                    });
                    console.log('设置最后消息ID:', newMessages[0]?.id || '无消息');
                } else {
                    console.log('无消息，清空lastMessageId');
                    this.setData({ lastMessageId: '' });
                }
            } else {
                throw new Error(res.message || '加载消息失败');
            }
        } catch (error) {
            console.error('加载消息失败:', error);
            this.setData({ loadingHistory: false });
            wx.showToast({
                title: '加载失败',
                icon: 'error'
            });
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

            // 处理图片URL，确保以http开头的完整URL
            let imageUrl = msg.imageUrl;
            if (imageUrl && !imageUrl.startsWith('http')) {
                // 临时文件路径（本地图片）不做处理
                if (!imageUrl.startsWith('http://tmp/') && !imageUrl.startsWith('wxfile://')) {
                    // 对于相对路径，转换为完整URL
                    console.log('需要转换的相对图片路径:', imageUrl);
                    const baseUrl = getApp().globalData.baseUrl || 'http://192.168.10.34:3000';
                    imageUrl = baseUrl + (imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl);
                    console.log('转换后的完整图片URL:', imageUrl);
                }
            }

            // 处理语音URL
            let audioUrl = msg.audioUrl;
            if (audioUrl && !audioUrl.startsWith('http')) {
                // 临时文件路径（本地录音）不做处理
                if (!audioUrl.startsWith('http://tmp/') && !audioUrl.startsWith('wxfile://')) {
                    // 对于相对路径，转换为完整URL
                    console.log('需要转换的相对语音路径:', audioUrl);
                    const baseUrl = getApp().globalData.baseUrl || 'http://192.168.10.34:3000';
                    audioUrl = baseUrl + (audioUrl.startsWith('/') ? audioUrl : '/' + audioUrl);
                    console.log('转换后的完整语音URL:', audioUrl);
                }
            }

            return {
                id: msg.id,
                type: msg.type || 'text', // 消息类型：text、image、audio
                content: msg.content,
                imageUrl: imageUrl, // 处理后的图片URL
                audioUrl: audioUrl, // 处理后的语音URL
                audioDuration: msg.audioDuration || '0:00', // 语音时长
                audioTime: msg.audioTime || 0, // 原始语音时长（秒）
                isOwn,
                time: this.formatMessageTime(msgTime),
                timeStr: this.formatTimeString(msgTime),
                showTime,
                status: msg.status || 'sent',
                isPlaying: false // 语音播放状态
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
            inputText: e.detail.value,
            cursorPosition: -1 // 重置光标位置
        });
    },

    // 监听消息列表滚动
    onMessageListScroll(e) {
        // 记录滚动位置
        const scrollTop = e.detail.scrollTop;
        this.setData({
            lastScrollPosition: scrollTop
        });
    },

    // 预览图片
    previewImage(e) {
        console.log('开始预览图片:', e.currentTarget.dataset.url);
        const { url } = e.currentTarget.dataset;

        // 获取所有图片消息的URL
        const imageUrls = this.data.messages
            .filter(msg => msg.type === 'image' && msg.imageUrl)
            .map(msg => msg.imageUrl);

        console.log('所有图片URL:', imageUrls);

        // 预览前禁用自动滚动
        this.setData({ disableAutoScroll: true });

        wx.previewImage({
            current: url,
            urls: imageUrls,
            success: () => {
                console.log('预览图片成功');
            },
            fail: (err) => {
                console.error('预览图片失败:', err);
                wx.showToast({
                    title: '无法预览图片',
                    icon: 'none'
                });
            }
        });
    },

    // 滚动到底部
    scrollToBottom() {
        // 如果禁用了自动滚动，则不执行
        if (this.data.disableAutoScroll) {
            console.log('已禁用自动滚动，不执行滚动到底部');
            return;
        }

        this.setData({
            scrollIntoView: 'bottom'
        });
    },

    // 输入框聚焦
    onInputFocus() {
        // 设置光标位置到文本末尾
        const textLength = this.data.inputText.length;
        this.setData({
            inputFocus: true,
            cursorPosition: textLength
        });

        // 如果禁用了自动滚动，则不执行
        if (this.data.disableAutoScroll) {
            console.log('已禁用自动滚动，不执行聚焦时滚动');
            return;
        }

        // 聚焦时延迟滚动到底部
        setTimeout(() => {
            this.scrollToBottom();
        }, 300);
    },

    // 输入框失焦
    onInputBlur() {
        this.setData({
            inputFocus: false
        });

        // 如果禁用了自动滚动，则不执行
        if (this.data.disableAutoScroll) {
            console.log('已禁用自动滚动，不执行失焦时滚动');
            return;
        }

        // 失焦时滚动到底部
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
    },

    // 选择表情包（占位方法）
    selectEmoji(e) {
        e.stopPropagation(); // 阻止事件冒泡
        wx.showToast({
            title: '表情包功能待开发',
            icon: 'none'
        });
    },

    // 选择图片
    selectImage(e) {
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            sizeType: ['original'], // 优先选择原图，确保高质量
            success: (res) => {
                const tempFilePath = res.tempFiles[0].tempFilePath;
                const size = res.tempFiles[0].size;

                console.log('选择的图片信息:', {
                    path: tempFilePath,
                    size: (size / 1024).toFixed(2) + 'KB'
                });

                // 获取图片尺寸
                wx.getImageInfo({
                    src: tempFilePath,
                    success: (imgInfo) => {
                        console.log('图片尺寸信息:', {
                            width: imgInfo.width,
                            height: imgInfo.height,
                            orientation: imgInfo.orientation,
                            type: imgInfo.type
                        });

                        // 发送图片消息，带上尺寸信息
                        this.sendImageMessage(tempFilePath, {
                            width: imgInfo.width,
                            height: imgInfo.height
                        });
                    },
                    fail: (err) => {
                        console.error('获取图片信息失败:', err);
                        // 即使获取失败也继续发送
                        this.sendImageMessage(tempFilePath);
                    }
                });
            },
            fail: (error) => {
                console.error('选择图片失败:', error);
                wx.showToast({
                    title: '选择图片失败',
                    icon: 'error'
                });
            }
        });
    },

    // 选择音频
    selectAudio(e) {
        // 显示录音模态框
        this.setData({
            showRecordModal: true
        });
    },

    // 从模态框开始录音
    startRecordingFromModal() {
        this.startRecording();
    },

    // 阻止冒泡
    preventBubble() {
        // 仅用于阻止事件冒泡
    },

    // 取消录音
    cancelRecording() {
        console.log('取消录音');

        // 如果正在录音，则停止
        if (this.recorderManager && this.data.isRecording) {
            this.recorderManager.stop();

            // 清除录音文件
            this.tempRecordFilePath = '';
        }

        // 清除录音计时器
        this.clearRecordingTimer();

        // 关闭录音模态框并重置状态
        this.setData({
            showRecordModal: false,
            isRecording: false
        });
    },

    // 完成录音
    finishRecording() {
        console.log('完成录音');
        if (this.recorderManager && this.data.isRecording) {
            this.recorderManager.stop();
        }
    },

    // 开始录音
    startRecording() {
        // 检查录音权限
        wx.authorize({
            scope: 'scope.record',
            success: () => {
                this.doStartRecording();
            },
            fail: (err) => {
                console.error('录音授权失败:', err);
                wx.showToast({
                    title: '请授权录音权限',
                    icon: 'none'
                });
                // 关闭录音模态框
                this.setData({ showRecordModal: false });
            }
        });
    },

    // 执行录音逻辑
    doStartRecording() {
        // 获取全局唯一的录音管理器
        const recorderManager = wx.getRecorderManager();

        // 录音参数
        const options = {
            duration: 60000, // 最长录音时间，单位ms
            sampleRate: 16000, // 采样率
            numberOfChannels: 1, // 录音通道数
            encodeBitRate: 64000, // 编码码率
            format: 'mp3', // 音频格式
            frameSize: 50 // 指定帧大小，单位KB
        };

        // 录音开始事件
        recorderManager.onStart(() => {
            console.log('录音开始');
            this.setData({
                isRecording: true,
                recordingTime: 0
            });

            // 开始计时
            this.startRecordingTimer();
        });

        // 录音出错事件
        recorderManager.onError((res) => {
            console.error('录音失败:', res);
            this.clearRecordingTimer();
            this.setData({
                isRecording: false,
                showRecordModal: false
            });

            wx.showToast({
                title: '录音失败',
                icon: 'error'
            });
        });

        // 录音完成事件
        recorderManager.onStop((res) => {
            console.log('录音完成:', res);
            this.clearRecordingTimer();
            this.setData({
                isRecording: false,
                showRecordModal: false
            });

            // 保存临时录音文件路径
            this.tempRecordFilePath = res.tempFilePath;

            // 判断录音时长
            if (this.data.recordingTime < 1) {
                wx.showToast({
                    title: '录音时间太短',
                    icon: 'none'
                });
                return;
            }

            // 如果是取消录音，则不发送
            if (!this.tempRecordFilePath) {
                return;
            }

            // 发送语音消息
            this.sendVoiceMessage(this.tempRecordFilePath, this.data.recordingTime);
        });

        // 开始录音
        recorderManager.start(options);

        // 设置全局引用
        this.recorderManager = recorderManager;
    },

    // 开始录音计时器
    startRecordingTimer() {
        this.clearRecordingTimer(); // 确保之前的计时器已清除

        const timer = setInterval(() => {
            this.setData({
                recordingTime: this.data.recordingTime + 1
            });

            // 最长录音时间到达时自动停止
            if (this.data.recordingTime >= 60) {
                this.stopRecording();
            }
        }, 1000);

        this.setData({ recordingTimer: timer });
    },

    // 清除录音计时器
    clearRecordingTimer() {
        if (this.data.recordingTimer) {
            clearInterval(this.data.recordingTimer);
            this.setData({ recordingTimer: null });
        }
    },

    // 停止录音
    stopRecording() {
        if (this.recorderManager && this.data.isRecording) {
            this.recorderManager.stop();
        }
    },

    // 发送语音消息
    async sendVoiceMessage(tempFilePath, duration) {
        if (this.data.sending) return;

        this.setData({ sending: true });

        // 格式化语音时长
        const durationStr = this.formatAudioDuration(duration);

        // 生成临时消息ID
        const tempId = `temp_${Date.now()}`;
        const now = new Date();
        const tempMessage = {
            id: tempId,
            type: 'audio',
            content: '', // 语音消息content为空
            audioUrl: tempFilePath,
            audioDuration: durationStr,
            audioTime: duration, // 原始秒数
            isOwn: true,
            time: '发送中',
            timeStr: this.formatTimeString(now),
            showTime: this.shouldShowTime(now),
            status: 'sending'
        };

        // 立即显示消息
        const newMessages = [...this.data.messages, tempMessage];
        this.setData({ messages: newMessages });

        // 滚动到底部
        setTimeout(() => {
            this.scrollToBottom();
        }, 50);

        try {
            // 上传语音到服务器
            const uploadRes = await this.uploadVoice(tempFilePath);
            if (!uploadRes.success) {
                throw new Error(uploadRes.message || '语音上传失败');
            }

            console.log('语音上传成功，URL:', uploadRes.data.url);

            // 发送语音消息
            const res = await MessageAPI.sendMessage({
                conversationId: this.data.conversationId,
                type: 'audio',
                content: '语音消息', // 提供一个默认内容以防服务器验证
                audioUrl: uploadRes.data.url, // 使用完整的服务器URL
                audioDuration: durationStr, // 格式化后的时长字符串
                audioTime: duration, // 原始秒数
                receiverId: this.data.otherUserId
            });

            if (res.success) {
                // 更新消息状态
                const updatedMessages = this.data.messages.map(msg => {
                    if (msg.id === tempId) {
                        return {
                            ...msg,
                            id: res.data.id,
                            audioUrl: uploadRes.data.url, // 使用完整的服务器URL
                            time: this.formatMessageTime(now),
                            status: 'sent'
                        };
                    }
                    return msg;
                });

                this.setData({
                    messages: updatedMessages,
                    lastActiveTime: now
                });
            } else {
                throw new Error(res.message || '发送失败');
            }
        } catch (error) {
            console.error('发送语音失败:', error);

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
                title: error.message || '发送失败',
                icon: 'error'
            });
        } finally {
            this.setData({ sending: false });
        }
    },

    // 上传语音
    async uploadVoice(filePath) {
        try {
            console.log('上传语音文件:', filePath);
            const result = await MessageAPI.uploadVoice(filePath);
            console.log('上传结果:', result);
            return result;
        } catch (error) {
            console.error('上传语音文件失败:', error);
            throw error;
        }
    },

    // 格式化语音时长
    formatAudioDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    },

    // 播放语音
    playVoice(e) {
        const { id, url } = e.currentTarget.dataset;

        // 如果正在播放这条语音，则停止播放
        if (this.data.currentPlayingId === id) {
            this.stopVoice();
            return;
        }

        // 如果正在播放其他语音，先停止
        if (this.data.currentPlayingId) {
            this.stopVoice();
        }

        console.log('播放语音:', url);

        // 获取全局唯一的音频上下文
        const innerAudioContext = wx.createInnerAudioContext();

        innerAudioContext.src = url;
        innerAudioContext.autoplay = true;

        // 播放事件
        innerAudioContext.onPlay(() => {
            console.log('语音开始播放');

            // 更新正在播放的消息ID
            this.setData({ currentPlayingId: id });

            // 更新消息列表中的播放状态
            this.updateMessagePlayingState(id, true);
        });

        // 播放错误
        innerAudioContext.onError((res) => {
            console.error('语音播放失败:', res);
            wx.showToast({
                title: '播放失败',
                icon: 'error'
            });
            this.stopVoice();
        });

        // 播放结束
        innerAudioContext.onEnded(() => {
            console.log('语音播放结束');
            this.stopVoice();
        });

        // 存储音频上下文引用
        this.innerAudioContext = innerAudioContext;
    },

    // 停止播放语音
    stopVoice() {
        if (this.innerAudioContext) {
            this.innerAudioContext.stop();
            this.innerAudioContext.destroy();
            this.innerAudioContext = null;
        }

        // 重置播放状态
        if (this.data.currentPlayingId) {
            this.updateMessagePlayingState(this.data.currentPlayingId, false);
            this.setData({ currentPlayingId: '' });
        }
    },

    // 更新消息的播放状态
    updateMessagePlayingState(id, isPlaying) {
        const updatedMessages = this.data.messages.map(msg => {
            if (msg.id === id) {
                return { ...msg, isPlaying };
            }
            return msg;
        });

        this.setData({ messages: updatedMessages });
    },

    // 发送图片消息
    async sendImageMessage(tempFilePath, imgInfo = null) {
        if (this.data.sending) return;

        this.setData({ sending: true });

        // 生成临时消息ID
        const tempId = `temp_${Date.now()}`;
        const now = new Date();
        const tempMessage = {
            id: tempId,
            type: 'image',
            content: '', // 图片消息content为空
            imageUrl: tempFilePath,
            imageDimensions: imgInfo, // 存储图片尺寸信息
            isOwn: true,
            time: '发送中',
            timeStr: this.formatTimeString(now),
            showTime: this.shouldShowTime(now),
            status: 'sending'
        };

        // 立即显示消息
        const newMessages = [...this.data.messages, tempMessage];
        this.setData({ messages: newMessages });

        // 滚动到底部
        setTimeout(() => {
            this.scrollToBottom();
        }, 50);

        try {
            // 上传图片到服务器
            const uploadRes = await this.uploadImage(tempFilePath);
            if (!uploadRes.success) {
                throw new Error(uploadRes.message || '图片上传失败');
            }

            console.log('图片上传成功，URL:', uploadRes.data.url);

            // 发送图片消息
            const res = await MessageAPI.sendMessage({
                conversationId: this.data.conversationId,
                type: 'image',
                content: '', // 图片消息content为空
                imageUrl: uploadRes.data.url, // 使用完整的服务器URL
                imageDimensions: imgInfo, // 传递图片尺寸信息
                receiverId: this.data.otherUserId
            });

            if (res.success) {
                // 更新消息状态
                const updatedMessages = this.data.messages.map(msg => {
                    if (msg.id === tempId) {
                        return {
                            ...msg,
                            id: res.data.id,
                            imageUrl: uploadRes.data.url, // 使用完整的服务器URL
                            time: this.formatMessageTime(now),
                            status: 'sent'
                        };
                    }
                    return msg;
                });

                this.setData({
                    messages: updatedMessages,
                    lastActiveTime: now
                });
            } else {
                throw new Error(res.message || '发送失败');
            }
        } catch (error) {
            console.error('发送图片失败:', error);

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
                title: error.message || '发送失败',
                icon: 'error'
            });
        } finally {
            this.setData({ sending: false });
        }
    },

    // 上传图片
    async uploadImage(filePath) {
        try {
            console.log('上传聊天图片:', filePath);
            const result = await MessageAPI.uploadImage(filePath);
            console.log('上传结果:', result);
            return result;
        } catch (error) {
            console.error('上传聊天图片失败:', error);
            throw error;
        }
    },

    // 判断是否显示时间
    shouldShowTime(currentTime) {
        const lastTime = this.data.lastActiveTime;
        if (!lastTime) return true;

        // 与上条消息间隔超过5分钟则显示时间
        return (currentTime - lastTime) > 5 * 60 * 1000;
    },

    // 加载更多历史消息
    loadMoreHistory() {
        if (this.data.hasMoreHistory && !this.data.loadingHistory) {
            this.loadMessages(true);
        }
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
    },

    // 发送文本消息
    async sendMessage() {
        const content = this.data.inputText.trim();
        if (!content || this.data.sending) return;

        // 防止重复发送
        this.setData({
            sending: true,
            inputText: '',
            cursorPosition: 0 // 清空后重置光标位置
        });

        // 生成临时消息ID
        const tempId = `temp_${Date.now()}`;
        const now = new Date();
        const tempMessage = {
            id: tempId,
            type: 'text',
            content,
            isOwn: true,
            time: '发送中',
            timeStr: this.formatTimeString(now),
            showTime: this.shouldShowTime(now),
            status: 'sending'
        };

        // 立即显示消息
        const newMessages = [...this.data.messages, tempMessage];
        this.setData({ messages: newMessages });

        // 滚动到底部
        setTimeout(() => {
            this.scrollToBottom();
        }, 50);

        try {
            const res = await MessageAPI.sendMessage({
                conversationId: this.data.conversationId,
                type: 'text',
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
                            time: this.formatMessageTime(now),
                            status: 'sent'
                        };
                    }
                    return msg;
                });

                this.setData({
                    messages: updatedMessages,
                    lastActiveTime: now
                });
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
    }
}); 