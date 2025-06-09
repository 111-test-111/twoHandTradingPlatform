const BaseModel = require('./BaseModel');
const path = require('path');

class Product extends BaseModel {
    constructor() {
        super(path.join(__dirname, '../data/products'));
    }

    // 创建商品
    async createProduct(productData, sellerId) {
        const product = {
            sellerId,
            title: productData.title,
            description: productData.description,
            price: parseFloat(productData.price),
            originalPrice: productData.originalPrice ? parseFloat(productData.originalPrice) : null,
            category: productData.category,
            condition: productData.condition,
            images: productData.images || [], // 直接保存相对路径，不做URL处理
            campus: productData.campus,
            dormitory: productData.dormitory,
            tradeMethods: productData.tradeMethods || ['面交'],
            status: 'available',
            viewCount: 0,
            favoriteCount: 0,
            tags: productData.tags || []
        };

        return await this.create(product);
    }

    // 根据卖家ID查找商品
    async findBySellerId(sellerId, status = null) {
        const condition = { sellerId };
        if (status) {
            condition.status = status;
        }
        return await this.findWhere(condition);
    }

    // 根据分类查找商品
    async findByCategory(category, page = 1, limit = 10) {
        return await this.findPaginated(page, limit, {
            category,
            status: 'available'
        });
    }

    // 搜索商品
    async searchProducts(keyword, filters = {}, page = 1, limit = 10) {
        let allProducts = await this.findWhere({ status: 'available' });

        // 关键词搜索
        if (keyword) {
            allProducts = allProducts.filter(product =>
                product.title.toLowerCase().includes(keyword.toLowerCase()) ||
                product.description.toLowerCase().includes(keyword.toLowerCase()) ||
                (product.tags && product.tags.some(tag =>
                    tag.toLowerCase().includes(keyword.toLowerCase())
                ))
            );
        }

        // 应用过滤器
        if (filters.category) {
            allProducts = allProducts.filter(product => product.category === filters.category);
        }

        if (filters.minPrice !== undefined) {
            allProducts = allProducts.filter(product => product.price >= parseFloat(filters.minPrice));
        }

        if (filters.maxPrice !== undefined) {
            allProducts = allProducts.filter(product => product.price <= parseFloat(filters.maxPrice));
        }

        if (filters.condition) {
            allProducts = allProducts.filter(product => product.condition === filters.condition);
        }

        if (filters.campus) {
            allProducts = allProducts.filter(product => product.campus === filters.campus);
        }

        // 排序
        const sortBy = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder || 'desc';

        allProducts.sort((a, b) => {
            let aValue = a[sortBy];
            let bValue = b[sortBy];

            if (sortBy === 'createdAt') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }

            if (sortOrder === 'desc') {
                return bValue > aValue ? 1 : -1;
            } else {
                return aValue > bValue ? 1 : -1;
            }
        });

        // 分页
        const total = allProducts.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const records = allProducts.slice(startIndex, startIndex + limit);

        return {
            records,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords: total,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        };
    }

    // 更新商品
    async update(productId, updateData) {
        return await super.update(productId, updateData);
    }

    // 更新商品状态
    async updateStatus(productId, status) {
        return await this.update(productId, { status });
    }

    // 增加浏览次数
    async incrementViewCount(productId) {
        const product = await this.findById(productId);
        if (product) {
            return await this.update(productId, {
                viewCount: product.viewCount + 1
            });
        }
        return null;
    }

    // 增加收藏次数
    async incrementFavoriteCount(productId) {
        const product = await this.findById(productId);
        if (product) {
            return await this.update(productId, {
                favoriteCount: product.favoriteCount + 1
            });
        }
        return null;
    }

    // 减少收藏次数
    async decrementFavoriteCount(productId) {
        const product = await this.findById(productId);
        if (product && product.favoriteCount > 0) {
            return await this.update(productId, {
                favoriteCount: product.favoriteCount - 1
            });
        }
        return null;
    }

    // 获取热门商品
    async getPopularProducts(limit = 10, category) {
        let products = await this.findWhere({ status: 'available' });

        // 按分类筛选
        if (category) {
            products = products.filter(product => product.category === category);
        }

        // 根据浏览次数和收藏次数排序
        products.sort((a, b) => {
            const scoreA = a.viewCount * 0.3 + a.favoriteCount * 0.7;
            const scoreB = b.viewCount * 0.3 + b.favoriteCount * 0.7;
            return scoreB - scoreA;
        });

        return products.slice(0, limit);
    }

    // 获取推荐商品（基于分类和价格范围）
    async getRecommendedProducts(userId, category, priceRange, limit = 10) {
        let products = await this.findWhere({
            status: 'available',
            sellerId: { $ne: userId } // 排除自己的商品
        });

        // 简单推荐算法
        if (category) {
            products = products.filter(product => product.category === category);
        }

        if (priceRange) {
            products = products.filter(product =>
                product.price >= priceRange.min && product.price <= priceRange.max
            );
        }

        // 随机排序
        products.sort(() => Math.random() - 0.5);

        return products.slice(0, limit);
    }

    // 获取商品统计信息
    async getStatistics() {
        const allProducts = await this.findAll();
        const availableProducts = allProducts.filter(p => p.status === 'available');

        const stats = {
            total: allProducts.length,
            available: availableProducts.length,
            sold: allProducts.filter(p => p.status === 'sold').length,
            reserved: allProducts.filter(p => p.status === 'reserved').length,
            categories: {},
            avgPrice: 0
        };

        // 分类统计 - 只统计在售商品(available状态)
        availableProducts.forEach(product => {
            if (product.category) {
                stats.categories[product.category] = (stats.categories[product.category] || 0) + 1;
            }
        });

        // 平均价格
        if (availableProducts.length > 0) {
            const totalPrice = availableProducts.reduce((sum, p) => sum + p.price, 0);
            stats.avgPrice = Math.round(totalPrice / availableProducts.length * 100) / 100;
        }

        return stats;
    }
}

module.exports = Product; 