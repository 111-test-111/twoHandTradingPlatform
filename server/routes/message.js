const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

// 数据存储路径
const DATA_DIR = path.join(__dirname, '../data/messages');

// 配置聊天图片上传
const imageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../data/messages/images');
        // 确保目录存在
        require('fs-extra').ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = uuidv4() + ext;
        cb(null, filename);
    }
});

// 配置语音消息上传
const voiceStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../data/messages/voices');
        // 确保目录存在
        require('fs-extra').ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.mp3'; // 默认使用.mp3扩展名
        const filename = uuidv4() + ext;
        cb(null, filename);
    }
});

const imageUpload = multer({
    storage: imageStorage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1 // 一次只能上传一张图片
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只能上传图片文件'));
        }
    }
});

const voiceUpload = multer({
    storage: voiceStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1 // 一次只能上传一个语音文件
    },
    fileFilter: function (req, file, cb) {
        // 支持常见的音频格式
        const validMimeTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/wav',
            'audio/x-m4a', 'audio/aac', 'audio/ogg'
        ];
        if (validMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只能上传音频文件'));
        }
    }
});

// 确保数据目录存在
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch (error) {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// 生成唯一ID
function generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 创建或获取对话
 * POST /api/message/conversation
 */
router.post('/conversation', verifyToken, async (req, res) => {
    try {
        await ensureDataDir();

        const { otherUserId, productId } = req.body;
        const currentUserId = req.user.id;

        if (!otherUserId) {
            return res.status(400).json({
                success: false,
                message: '缺少对方用户ID'
            });
        }

        if (otherUserId === currentUserId) {
            return res.status(400).json({
                success: false,
                message: '不能与自己创建对话'
            });
        }

        // 对话ID：保证两个用户间的对话唯一
        const conversationId = [currentUserId, otherUserId].sort().join('_');
        const conversationFile = path.join(DATA_DIR, `conversation_${conversationId}.json`);

        let conversation;
        try {
            const data = await fs.readFile(conversationFile, 'utf8');
            conversation = JSON.parse(data);

            // 如果对话已存在，且当前用户主动联系对方，清除当前用户的删除状态
            let needUpdate = false;

            // 清除当前用户的删除状态（允许看到完整聊天记录），但保持隐藏状态（不出现在消息列表）
            if (conversation.deletedBy && conversation.deletedBy.includes(currentUserId)) {
                conversation.deletedBy = conversation.deletedBy.filter(id => id !== currentUserId);
                needUpdate = true;
            }

            if (conversation.deletedTimes && conversation.deletedTimes[currentUserId]) {
                delete conversation.deletedTimes[currentUserId];
                needUpdate = true;
            }

            // 注意：这里不清除hiddenBy状态，会话仍然不会出现在消息列表中

            // 如果有更新，保存会话数据
            if (needUpdate) {
                await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));
            }
        } catch (error) {
            // 对话不存在，创建新对话
            conversation = {
                id: conversationId,
                participants: [currentUserId, otherUserId],
                productId: productId || null,
                createdAt: new Date().toISOString(),
                lastMessageTime: new Date().toISOString(),
                lastMessage: null,
                unreadCount: {
                    [currentUserId]: 0,
                    [otherUserId]: 0
                },
                deletedBy: [], // 删除状态：影响消息内容显示
                deletedTimes: {}, // 删除时间：过滤消息
                hiddenBy: [] // 隐藏状态：影响会话列表显示
            };

            await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));
        }

        res.json({
            success: true,
            data: conversation
        });
    } catch (error) {
        console.error('创建对话失败:', error);
        res.status(500).json({
            success: false,
            message: '创建对话失败'
        });
    }
});

/**
 * 获取对话信息
 * GET /api/message/conversation/:conversationId
 */
router.get('/conversation/:conversationId', verifyToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const currentUserId = req.user.id;

        const conversationFile = path.join(DATA_DIR, `conversation_${conversationId}.json`);

        try {
            const data = await fs.readFile(conversationFile, 'utf8');
            const conversation = JSON.parse(data);

            // 检查用户是否有权限访问此对话
            if (!conversation.participants.includes(currentUserId)) {
                return res.status(403).json({
                    success: false,
                    message: '无权限访问此对话'
                });
            }

            // 获取对方用户ID
            const otherUserId = conversation.participants.find(id => id !== currentUserId);

            // 获取对方用户的真实信息
            let otherUser = {
                id: otherUserId,
                nickname: `用户${otherUserId}`,
                avatar: '/assets/images/placeholder.png'
            };

            try {
                // 尝试从用户数据文件中读取真实用户信息
                const userDataPath = path.join(__dirname, '../data/users');
                const userFiles = await fs.readdir(userDataPath);
                const userFile = userFiles.find(f => f.includes(otherUserId) && f.endsWith('.json'));

                if (userFile) {
                    const userData = await fs.readFile(path.join(userDataPath, userFile), 'utf8');
                    const user = JSON.parse(userData);
                    otherUser = {
                        id: otherUserId,
                        nickname: user.nickname || user.name || `用户${otherUserId}`,
                        avatar: user.avatar || '/assets/images/placeholder.png'
                    };
                }
            } catch (userError) {
                console.log('读取用户信息失败，使用默认信息:', userError.message);
            }

            res.json({
                success: true,
                data: {
                    ...conversation,
                    otherUserId,
                    otherUser
                }
            });
        } catch (error) {
            res.status(404).json({
                success: false,
                message: '对话不存在'
            });
        }
    } catch (error) {
        console.error('获取对话失败:', error);
        res.status(500).json({
            success: false,
            message: '获取对话失败'
        });
    }
});

/**
 * 获取会话列表
 * GET /api/message/conversations
 */
router.get('/conversations', verifyToken, async (req, res) => {
    try {
        await ensureDataDir();

        const currentUserId = req.user.id;
        const { page = 1, pageSize = 20 } = req.query;

        // 读取所有会话文件
        const files = await fs.readdir(DATA_DIR);
        const conversationFiles = files.filter(file => file.startsWith('conversation_') && file.endsWith('.json'));

        const conversations = [];

        for (const file of conversationFiles) {
            try {
                const data = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
                const conversation = JSON.parse(data);

                // 只获取当前用户参与的会话，且当前用户未隐藏的会话
                if (conversation.participants.includes(currentUserId)) {
                    // 检查当前用户是否已隐藏此会话
                    const hiddenBy = conversation.hiddenBy || [];
                    if (hiddenBy.includes(currentUserId)) {
                        continue; // 跳过已隐藏的会话
                    }

                    // 只显示有实际消息往来的会话（排除空会话）
                    if (!conversation.lastMessage || !conversation.lastMessage.content) {
                        continue; // 跳过没有消息内容的会话
                    }

                    const otherUserId = conversation.participants.find(id => id !== currentUserId);

                    // 获取对方用户的真实信息
                    let otherUser = {
                        id: otherUserId,
                        nickname: `用户${otherUserId}`,
                        avatar: '/assets/images/placeholder.png'
                    };

                    try {
                        // 尝试从用户数据文件中读取真实用户信息
                        const userDataPath = path.join(__dirname, '../data/users');
                        const userFiles = await fs.readdir(userDataPath);
                        const userFile = userFiles.find(f => f.includes(otherUserId) && f.endsWith('.json'));

                        if (userFile) {
                            const userData = await fs.readFile(path.join(userDataPath, userFile), 'utf8');
                            const user = JSON.parse(userData);
                            otherUser = {
                                id: otherUserId,
                                nickname: user.nickname || user.name || `用户${otherUserId}`,
                                avatar: user.avatar || '/assets/images/placeholder.png'
                            };
                        }
                    } catch (userError) {
                        console.log('读取用户信息失败，使用默认信息:', userError.message);
                    }

                    // 获取商品信息（如果有）
                    let productInfo = null;
                    if (conversation.productId) {
                        try {
                            const productDataPath = path.join(__dirname, '../data/products');
                            const productFiles = await fs.readdir(productDataPath);
                            const productFile = productFiles.find(f => f.includes(conversation.productId) && f.endsWith('.json'));

                            if (productFile) {
                                const productData = await fs.readFile(path.join(productDataPath, productFile), 'utf8');
                                const product = JSON.parse(productData);
                                productInfo = {
                                    id: product.id,
                                    title: product.title,
                                    price: product.price,
                                    images: product.images
                                };
                            }
                        } catch (productError) {
                            console.log('读取商品信息失败:', productError.message);
                        }
                    }

                    conversations.push({
                        id: conversation.id,
                        otherUser,
                        lastMessage: conversation.lastMessage,
                        lastMessageTime: conversation.lastMessageTime,
                        unreadCount: conversation.unreadCount?.[currentUserId] || 0,
                        productInfo,
                        createdAt: conversation.createdAt
                    });
                }
            } catch (error) {
                console.error(`读取会话文件 ${file} 失败:`, error);
                continue;
            }
        }

        // 按最后消息时间排序
        conversations.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

        // 分页处理
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + parseInt(pageSize);
        const paginatedConversations = conversations.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: {
                records: paginatedConversations,
                pagination: {
                    page: parseInt(page),
                    pageSize: parseInt(pageSize),
                    totalRecords: conversations.length,
                    totalPages: Math.ceil(conversations.length / pageSize),
                    hasNext: endIndex < conversations.length
                }
            }
        });
    } catch (error) {
        console.error('获取会话列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取会话列表失败'
        });
    }
});

/**
 * 获取消息列表
 * GET /api/message/conversation/:conversationId/messages
 */
router.get('/conversation/:conversationId/messages', verifyToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, pageSize = 20 } = req.query;
        const currentUserId = req.user.id;

        const messagesFile = path.join(DATA_DIR, `messages_${conversationId}.json`);

        let messages = [];
        try {
            const data = await fs.readFile(messagesFile, 'utf8');
            messages = JSON.parse(data);
        } catch (error) {
            // 消息文件不存在，返回空列表
        }

        // 验证用户权限（检查是否参与此对话）
        const conversationFile = path.join(DATA_DIR, `conversation_${conversationId}.json`);
        let conversation;
        try {
            const conversationData = await fs.readFile(conversationFile, 'utf8');
            conversation = JSON.parse(conversationData);

            if (!conversation.participants.includes(currentUserId)) {
                return res.status(403).json({
                    success: false,
                    message: '无权限访问此对话'
                });
            }
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: '对话不存在'
            });
        }

        // 检查用户的删除时间，过滤删除时间之前的消息
        const deletedTimes = conversation.deletedTimes || {};
        const userDeletedTime = deletedTimes[currentUserId];

        if (userDeletedTime) {
            // 只显示删除时间之后的消息
            messages = messages.filter(msg => new Date(msg.createdAt) > new Date(userDeletedTime));
        }

        // 按时间倒序排序（最新的在前面）
        messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 分页
        const start = (page - 1) * pageSize;
        const end = start + parseInt(pageSize);
        const paginatedMessages = messages.slice(start, end);

        // 转换相对图片URL为完整服务器URL
        const records = paginatedMessages.reverse().map(msg => {
            if (msg.imageUrl && msg.imageUrl.startsWith('/')) {
                msg.imageUrl = config.serverUrl + msg.imageUrl;
            }
            return msg;
        });
        res.json({
            success: true,
            data: {
                records,
                pagination: {
                    currentPage: parseInt(page),
                    pageSize: parseInt(pageSize),
                    totalRecords: messages.length,
                    totalPages: Math.ceil(messages.length / pageSize),
                    hasNext: end < messages.length
                }
            }
        });
    } catch (error) {
        console.error('获取消息列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取消息列表失败'
        });
    }
});

/**
 * 发送消息
 * POST /api/message/send
 */
router.post('/send', verifyToken, async (req, res) => {
    try {
        const { conversationId, content, receiverId, type, imageUrl, audioUrl, audioDuration } = req.body;
        const senderId = req.user.id;

        if (!conversationId || !receiverId) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        // 根据消息类型验证必要字段
        if (type === 'image') {
            if (!imageUrl) {
                return res.status(400).json({
                    success: false,
                    message: '图片消息缺少图片URL'
                });
            }
        } else if (type === 'audio') {
            if (!audioUrl) {
                return res.status(400).json({
                    success: false,
                    message: '语音消息缺少语音URL'
                });
            }
        } else {
            // 文本消息需要content
            if (!content) {
                return res.status(400).json({
                    success: false,
                    message: '文本消息缺少内容'
                });
            }
        }

        // 创建消息
        const message = {
            id: generateId(),
            conversationId,
            senderId,
            receiverId,
            type: type || 'text', // 消息类型：text、image、audio
            content: content ? content.trim() : '',
            imageUrl: imageUrl || null, // 图片URL
            audioUrl: audioUrl || null, // 音频URL
            audioDuration: audioDuration || null, // 语音时长
            createdAt: new Date().toISOString(),
            status: 'sent'
        };

        // 保存消息
        const messagesFile = path.join(DATA_DIR, `messages_${conversationId}.json`);
        let messages = [];

        try {
            const data = await fs.readFile(messagesFile, 'utf8');
            messages = JSON.parse(data);
        } catch (error) {
            // 消息文件不存在，创建空数组
        }

        messages.push(message);
        await fs.writeFile(messagesFile, JSON.stringify(messages, null, 2));

        // 更新对话信息
        const conversationFile = path.join(DATA_DIR, `conversation_${conversationId}.json`);
        try {
            const conversationData = await fs.readFile(conversationFile, 'utf8');
            const conversation = JSON.parse(conversationData);

            // 设置最后消息的显示内容
            let lastMessageContent;
            if (type === 'image') {
                lastMessageContent = '[图片]';
            } else if (type === 'audio') {
                lastMessageContent = '[语音]';
            } else {
                lastMessageContent = content;
            }

            conversation.lastMessage = {
                content: lastMessageContent,
                senderId: senderId,
                createdAt: message.createdAt,
                type: message.type
            };
            conversation.lastMessageTime = message.createdAt;

            // 清除发送者和接收者的所有状态（完全激活会话）
            if (conversation.deletedBy) {
                // 清除发送者的删除状态
                if (conversation.deletedBy.includes(senderId)) {
                    conversation.deletedBy = conversation.deletedBy.filter(id => id !== senderId);
                }
                // 清除接收者的删除状态，确保接收者能收到消息
                if (conversation.deletedBy.includes(receiverId)) {
                    conversation.deletedBy = conversation.deletedBy.filter(id => id !== receiverId);
                }
            }

            if (conversation.deletedTimes) {
                // 清除发送者的删除时间
                if (conversation.deletedTimes[senderId]) {
                    delete conversation.deletedTimes[senderId];
                }
                // 清除接收者的删除时间
                if (conversation.deletedTimes[receiverId]) {
                    delete conversation.deletedTimes[receiverId];
                }
            }

            if (conversation.hiddenBy) {
                // 清除发送者的隐藏状态
                if (conversation.hiddenBy.includes(senderId)) {
                    conversation.hiddenBy = conversation.hiddenBy.filter(id => id !== senderId);
                }
                // 清除接收者的隐藏状态，确保接收者能在消息列表中看到会话
                if (conversation.hiddenBy.includes(receiverId)) {
                    conversation.hiddenBy = conversation.hiddenBy.filter(id => id !== receiverId);
                }
            }

            // 更新未读数
            if (!conversation.unreadCount) {
                conversation.unreadCount = {};
            }
            conversation.unreadCount[receiverId] = (conversation.unreadCount[receiverId] || 0) + 1;

            await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));
        } catch (error) {
            console.error('更新对话信息失败:', error);
        }

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        console.error('发送消息失败:', error);
        res.status(500).json({
            success: false,
            message: '发送消息失败'
        });
    }
});

/**
 * 删除会话（软删除）
 * DELETE /api/message/conversation/:conversationId
 */
router.delete('/conversation/:conversationId', verifyToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const currentUserId = req.user.id;

        const conversationFile = path.join(DATA_DIR, `conversation_${conversationId}.json`);

        // 验证用户权限并读取会话数据
        let conversation;
        try {
            const data = await fs.readFile(conversationFile, 'utf8');
            conversation = JSON.parse(data);

            if (!conversation.participants.includes(currentUserId)) {
                return res.status(403).json({
                    success: false,
                    message: '无权限删除此对话'
                });
            }
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: '对话不存在'
            });
        }

        // 初始化删除相关字段
        if (!conversation.deletedBy) {
            conversation.deletedBy = [];
        }
        if (!conversation.deletedTimes) {
            conversation.deletedTimes = {};
        }
        if (!conversation.hiddenBy) {
            conversation.hiddenBy = [];
        }

        // 记录当前用户的删除时间
        const deleteTime = new Date().toISOString();
        conversation.deletedTimes[currentUserId] = deleteTime;

        // 添加当前用户到删除列表
        if (!conversation.deletedBy.includes(currentUserId)) {
            conversation.deletedBy.push(currentUserId);
        }

        // 添加当前用户到隐藏列表（会话不出现在消息列表中）
        if (!conversation.hiddenBy.includes(currentUserId)) {
            conversation.hiddenBy.push(currentUserId);
        }

        // 检查是否双方都删除了
        const allParticipantsDeleted = conversation.participants.every(participantId =>
            conversation.deletedBy.includes(participantId)
        );

        if (allParticipantsDeleted) {
            // 双方都删除了，物理删除文件
            const messagesFile = path.join(DATA_DIR, `messages_${conversationId}.json`);

            try {
                await fs.unlink(conversationFile);
            } catch (error) {
                console.error('删除对话文件失败:', error);
            }

            try {
                await fs.unlink(messagesFile);
            } catch (error) {
                console.error('删除消息文件失败:', error);
            }

            res.json({
                success: true,
                message: '会话彻底删除成功'
            });
        } else {
            // 只是标记删除，保存更新后的会话数据
            await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));

            res.json({
                success: true,
                message: '会话删除成功'
            });
        }
    } catch (error) {
        console.error('删除会话失败:', error);
        res.status(500).json({
            success: false,
            message: '删除会话失败'
        });
    }
});

/**
 * 标记消息为已读
 * PUT /api/message/conversation/:conversationId/read
 */
router.put('/conversation/:conversationId/read', verifyToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const currentUserId = req.user.id;

        const conversationFile = path.join(DATA_DIR, `conversation_${conversationId}.json`);

        try {
            const data = await fs.readFile(conversationFile, 'utf8');
            const conversation = JSON.parse(data);

            if (!conversation.participants.includes(currentUserId)) {
                return res.status(403).json({
                    success: false,
                    message: '无权限访问此对话'
                });
            }

            // 重置当前用户的未读数
            if (!conversation.unreadCount) {
                conversation.unreadCount = {};
            }
            conversation.unreadCount[currentUserId] = 0;

            await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));

            res.json({
                success: true,
                message: '标记为已读成功'
            });
        } catch (error) {
            res.status(404).json({
                success: false,
                message: '对话不存在'
            });
        }
    } catch (error) {
        console.error('标记为已读失败:', error);
        res.status(500).json({
            success: false,
            message: '标记为已读失败'
        });
    }
});

/**
 * 上传聊天图片
 * POST /api/message/upload-image
 */
router.post('/upload-image', verifyToken, imageUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传图片'
            });
        }

        // 返回完整的服务器URL
        const imageUrl = config.serverUrl + '/messages/images/' + req.file.filename;

        console.log('聊天图片上传成功:', {
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            url: imageUrl
        });

        res.json({
            success: true,
            message: '聊天图片上传成功',
            data: {
                url: imageUrl, // 完整服务器URL
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size
            }
        });

    } catch (error) {
        console.error('上传聊天图片错误:', error);
        res.status(500).json({
            success: false,
            message: '上传聊天图片失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 上传语音消息
 * POST /api/message/upload-voice
 */
router.post('/upload-voice', verifyToken, voiceUpload.single('voice'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传语音'
            });
        }

        // 返回完整的服务器URL
        const audioUrl = config.serverUrl + '/messages/voices/' + req.file.filename;

        console.log('语音消息上传成功:', {
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            url: audioUrl
        });

        res.json({
            success: true,
            message: '语音消息上传成功',
            data: {
                url: audioUrl, // 完整服务器URL
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size
            }
        });

    } catch (error) {
        console.error('上传语音消息错误:', error);
        res.status(500).json({
            success: false,
            message: '上传语音消息失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router; 