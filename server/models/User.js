const BaseModel = require('./BaseModel');
const path = require('path');

class User extends BaseModel {
    constructor() {
        super(path.join(__dirname, '../data/users'));
    }

    // 根据微信openid查找用户
    async findByOpenid(openid) {
        const users = await this.findWhere({ openid });
        return users.length > 0 ? users[0] : null;
    }

    // 创建用户（微信登录）
    async createUser(wechatUserInfo) {
        const userData = {
            openid: wechatUserInfo.openid,
            nickname: wechatUserInfo.nickName || '微信用户',
            avatar: wechatUserInfo.avatarUrl || '',
            gender: wechatUserInfo.gender || 0,
            city: wechatUserInfo.city || '',
            province: wechatUserInfo.province || '',
            country: wechatUserInfo.country || '',
            // 新增字段
            phone: '', // 手机号
            // 校园相关信息
            campus: '', // 校区
            dormitory: '', // 宿舍楼
            contactInfo: '', // 联系方式
            realName: '', // 真实姓名（可选）
            studentId: '', // 学号（可选）
            // 信用评分
            creditScore: 100, // 初始信用分
            totalTransactions: 0, // 总交易次数
            successTransactions: 0, // 成功交易次数
            // 状态
            status: 'active', // active, inactive, banned
            isVerified: false, // 是否通过身份验证
            // 统计信息
            sellCount: 0, // 出售商品数量
            buyCount: 0, // 购买商品数量
            favoriteCount: 0, // 收藏数量
            // 关联产品
            publishedProducts: [], // 发布的商品ID列表
            purchasedProducts: [], // 购买的商品ID列表
            favoriteProducts: [] // 收藏的商品ID列表
        };

        const newUser = await this.create(userData);

        // 添加userId字段（使用生成的ID的前8位）
        if (newUser && newUser.id) {
            newUser.userId = newUser.id.substring(0, 8) + '...';
            await this.update(newUser.id, { userId: newUser.userId });
        }

        return newUser;
    }

    // 更新用户信息
    async updateProfile(userId, profileData) {
        console.log('=== User.updateProfile 开始 ===');
        console.log('用户ID:', userId);
        console.log('更新数据:', profileData);

        const allowedFields = [
            'nickname', 'avatar', 'campus', 'dormitory',
            'contactInfo', 'realName', 'studentId', 'phone', 'gender', 'userId'
        ];

        const updateData = {};
        allowedFields.forEach(field => {
            if (profileData.hasOwnProperty(field)) {
                updateData[field] = profileData[field];
                console.log(`添加字段 ${field}:`, profileData[field]);
            }
        });

        console.log('最终更新数据:', updateData);

        try {
            const result = await this.update(userId, updateData);
            console.log('更新结果:', {
                id: result.id,
                avatar: result.avatar,
                updatedAt: result.updatedAt
            });
            console.log('=== User.updateProfile 成功 ===');
            return result;
        } catch (error) {
            console.error('=== User.updateProfile 失败 ===');
            console.error('错误详情:', error);
            throw error;
        }
    }

    // 关联商品（发布、购买、收藏）
    async associateProduct(userId, productId, type) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        const updateData = {};

        if (type === 'publish') {
            // 确保不重复添加
            if (!user.publishedProducts) {
                user.publishedProducts = [];
            }
            if (!user.publishedProducts.includes(productId)) {
                updateData.publishedProducts = [...user.publishedProducts, productId];
                updateData.sellCount = user.sellCount + 1;
            }
        } else if (type === 'purchase') {
            if (!user.purchasedProducts) {
                user.purchasedProducts = [];
            }
            if (!user.purchasedProducts.includes(productId)) {
                updateData.purchasedProducts = [...user.purchasedProducts, productId];
                updateData.buyCount = user.buyCount + 1;
            }
        } else if (type === 'favorite') {
            if (!user.favoriteProducts) {
                user.favoriteProducts = [];
            }
            if (!user.favoriteProducts.includes(productId)) {
                updateData.favoriteProducts = [...user.favoriteProducts, productId];
                updateData.favoriteCount = user.favoriteCount + 1;
            }
        }

        if (Object.keys(updateData).length > 0) {
            return await this.update(userId, updateData);
        }

        return user;
    }

    // 取消关联商品（取消收藏）
    async disassociateProduct(userId, productId, type) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        const updateData = {};

        if (type === 'favorite' && user.favoriteProducts) {
            const index = user.favoriteProducts.indexOf(productId);
            if (index !== -1) {
                const newFavorites = [...user.favoriteProducts];
                newFavorites.splice(index, 1);
                updateData.favoriteProducts = newFavorites;
                updateData.favoriteCount = Math.max(0, user.favoriteCount - 1);
            }
        }

        if (Object.keys(updateData).length > 0) {
            return await this.update(userId, updateData);
        }

        return user;
    }

    // 更新信用分
    async updateCreditScore(userId, scoreChange, transactionType) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        const updateData = {
            creditScore: Math.max(0, Math.min(100, user.creditScore + scoreChange)),
            totalTransactions: user.totalTransactions + 1
        };

        if (transactionType === 'success') {
            updateData.successTransactions = user.successTransactions + 1;
        }

        return await this.update(userId, updateData);
    }

    // 增加购买/出售计数
    async incrementCounter(userId, type) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        const updateData = {};
        if (type === 'sell') {
            updateData.sellCount = user.sellCount + 1;
        } else if (type === 'buy') {
            updateData.buyCount = user.buyCount + 1;
        } else if (type === 'favorite') {
            updateData.favoriteCount = user.favoriteCount + 1;
        }

        return await this.update(userId, updateData);
    }

    // 获取用户公开信息
    getPublicInfo(user) {
        return {
            id: user.id,
            nickname: user.nickname,
            avatar: user.avatar,
            campus: user.campus,
            creditScore: user.creditScore,
            totalTransactions: user.totalTransactions,
            successTransactions: user.successTransactions,
            sellCount: user.sellCount,
            createdAt: user.createdAt
        };
    }

    // 搜索用户
    async searchUsers(keyword, page = 1, limit = 10) {
        const condition = {
            $or: [
                { nickname: { $regex: keyword, $options: 'i' } },
                { realName: { $regex: keyword, $options: 'i' } }
            ]
        };

        // 简化搜索逻辑（文件系统版本）
        const allUsers = await this.findAll();
        const filteredUsers = allUsers.filter(user =>
            user.nickname.toLowerCase().includes(keyword.toLowerCase()) ||
            (user.realName && user.realName.toLowerCase().includes(keyword.toLowerCase()))
        );

        const total = filteredUsers.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const records = filteredUsers.slice(startIndex, startIndex + limit);

        return {
            records: records.map(user => this.getPublicInfo(user)),
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords: total
            }
        };
    }
}

module.exports = User; 