const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const Product = require('../models/Product');
const User = require('../models/User');
const { verifyToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../data/uploads/products');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = uuidv4() + ext;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 9 // 最多9张图片
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只能上传图片文件'));
        }
    }
});

/**
 * 单独上传商品图片
 * POST /api/product/upload-image
 */
router.post('/upload-image', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传图片'
            });
        }

        // 返回相对路径，不包含服务器URL
        const imageUrl = `/uploads/products/${req.file.filename}`;

        res.json({
            success: true,
            message: '图片上传成功',
            data: {
                url: imageUrl, // 相对路径
                name: req.file.filename
            }
        });

    } catch (error) {
        console.error('上传商品图片错误:', error);
        res.status(500).json({
            success: false,
            message: '上传图片失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取商品列表（支持搜索和筛选）
 * GET /api/product/list
 */
router.get('/list', optionalAuth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            keyword,
            category,
            minPrice,
            maxPrice,
            condition,
            campus,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const productModel = new Product();
        const filters = {
            category,
            minPrice,
            maxPrice,
            condition,
            campus,
            sortBy,
            sortOrder
        };

        // 移除空值
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined || filters[key] === '') {
                delete filters[key];
            }
        });

        const result = await productModel.searchProducts(
            keyword,
            filters,
            parseInt(page),
            parseInt(limit)
        );

        // 获取卖家信息
        const userModel = new User();
        for (let product of result.records) {
            const seller = await userModel.findById(product.sellerId);
            if (seller) {
                product.seller = userModel.getPublicInfo(seller);
            }
        }

        res.json({
            success: true,
            message: '获取商品列表成功',
            data: result
        });

    } catch (error) {
        console.error('获取商品列表错误:', error);
        res.status(500).json({
            success: false,
            message: '获取商品列表失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取商品详情
 * GET /api/product/:id
 */
router.get('/:id([0-9a-fA-F-]+)', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const productModel = new Product();
        const userModel = new User();

        const product = await productModel.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: '商品不存在'
            });
        }

        // 获取卖家信息
        const seller = await userModel.findById(product.sellerId);
        if (seller) {
            product.seller = userModel.getPublicInfo(seller);
        }

        // 先返回响应
        res.json({
            success: true,
            message: '获取商品详情成功',
            data: product
        });

        // 异步增加浏览次数（如果不是商品拥有者）
        if (!req.user || req.user.id !== product.sellerId) {
            // 在开发环境中异步处理，避免触发 nodemon 重启时阻塞响应
            setImmediate(async () => {
                try {
                    await productModel.incrementViewCount(id);
                } catch (error) {
                    console.error('更新浏览次数失败:', error);
                }
            });
        }

    } catch (error) {
        console.error('获取商品详情错误:', error);
        res.status(500).json({
            success: false,
            message: '获取商品详情失败'
        });
    }
});

/**
 * 发布商品
 * POST /api/product/publish
 */
router.post('/publish', verifyToken, upload.array('images', 9), async (req, res) => {
    try {
        const {
            title,
            description,
            price,
            originalPrice,
            category,
            condition,
            campus,
            dormitory,
            tradeMethods,
            tags
        } = req.body;

        // 验证必填字段
        if (!title || !description || !price || !category || !condition) {
            return res.status(400).json({
                success: false,
                message: '请填写完整的商品信息'
            });
        }

        // 处理前端传递的图片URL（JSON）和文件上传
        let images = [];

        // 前端通过JSON提交的已上传图片URL（相对路径）
        if (req.body.images) {
            try {
                const bodyImgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
                if (Array.isArray(bodyImgs)) {
                    images.push(...bodyImgs);
                } else if (typeof bodyImgs === 'string') {
                    images.push(bodyImgs);
                }
            } catch (err) {
                // 非JSON格式，直接作为单个URL
                images.push(req.body.images);
            }
        }

        // multer 处理的文件上传（保存为相对路径）
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const imagePath = `/uploads/products/${file.filename}`;
                images.push(imagePath);
            });
        }

        console.log('商品图片相对路径数组:', images);

        const productData = {
            title,
            description,
            price,
            originalPrice,
            category,
            condition,
            images, // 保存相对路径到数据库
            campus: campus || req.user.campus,
            dormitory: dormitory || req.user.dormitory,
            tradeMethods: tradeMethods ? (Array.isArray(tradeMethods) ? tradeMethods : [tradeMethods]) : ['面交'],
            tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())) : []
        };

        const productModel = new Product();
        const product = await productModel.createProduct(productData, req.user.id);

        // 关联产品到用户
        const userModel = new User();
        await userModel.associateProduct(req.user.id, product.id, 'publish');

        res.json({
            success: true,
            message: '商品发布成功',
            data: product
        });

    } catch (error) {
        console.error('发布商品错误:', error);
        res.status(500).json({
            success: false,
            message: '发布商品失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 更新商品信息
 * PUT /api/product/:id
 */
router.put('/:id([0-9a-fA-F-]+)', verifyToken, upload.array('images', 9), async (req, res) => {
    try {
        const { id } = req.params;
        const productModel = new Product();

        const product = await productModel.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: '商品不存在'
            });
        }

        // 验证权限
        if (product.sellerId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: '无权限修改该商品'
            });
        }

        const {
            title,
            description,
            price,
            originalPrice,
            category,
            condition,
            campus,
            dormitory,
            tradeMethods,
            tags,
            status
        } = req.body;

        const updateData = {};
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (price) updateData.price = parseFloat(price);
        if (originalPrice) updateData.originalPrice = parseFloat(originalPrice);
        if (category) updateData.category = category;
        if (condition) updateData.condition = condition;
        if (campus) updateData.campus = campus;
        if (dormitory) updateData.dormitory = dormitory;
        if (tradeMethods) updateData.tradeMethods = Array.isArray(tradeMethods) ? tradeMethods : [tradeMethods];
        if (tags) updateData.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
        if (status && ['available', 'sold', 'removed'].includes(status)) {
            updateData.status = status;
        }

        // 处理新上传的图片
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => `/uploads/products/${file.filename}`);
            updateData.images = [...(product.images || []), ...newImages];
        }

        const updatedProduct = await productModel.update(id, updateData);

        res.json({
            success: true,
            message: '商品更新成功',
            data: updatedProduct
        });

    } catch (error) {
        console.error('更新商品错误:', error);
        res.status(500).json({
            success: false,
            message: '更新商品失败'
        });
    }
});

/**
 * 删除商品
 * DELETE /api/product/:id
 */
router.delete('/:id([0-9a-fA-F-]+)', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productModel = new Product();

        const product = await productModel.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: '商品不存在'
            });
        }

        // 验证权限
        if (product.sellerId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: '无权限删除该商品'
            });
        }

        // 软删除：更新状态为已移除
        await productModel.update(id, { status: 'removed' });

        res.json({
            success: true,
            message: '商品删除成功'
        });

    } catch (error) {
        console.error('删除商品错误:', error);
        res.status(500).json({
            success: false,
            message: '删除商品失败'
        });
    }
});

/**
 * 获取我的商品
 * GET /api/product/my/list
 */
router.get('/my/list', verifyToken, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const productModel = new Product();

        // 获取用户的商品列表
        const products = await productModel.findBySellerId(req.user.id, status);

        // 分页
        const total = products.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const records = products.slice(startIndex, startIndex + parseInt(limit));

        res.json({
            success: true,
            message: '获取我的商品成功',
            data: {
                records,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalRecords: total,
                    hasNextPage: parseInt(page) < totalPages,
                    hasPrevPage: parseInt(page) > 1
                }
            }
        });

    } catch (error) {
        console.error('获取我的商品错误:', error);
        res.status(500).json({
            success: false,
            message: '获取我的商品失败'
        });
    }
});

/**
 * 获取热门商品
 * GET /api/product/popular
 */
router.get('/popular', async (req, res) => {
    try {
        const { limit = 10, category } = req.query;
        const productModel = new Product();
        const userModel = new User();

        // 增加分类过滤功能
        const products = await productModel.getPopularProducts(parseInt(limit), category);

        // 获取卖家信息
        for (let product of products) {
            const seller = await userModel.findById(product.sellerId);
            if (seller) {
                product.seller = userModel.getPublicInfo(seller);
            }
        }

        res.json({
            success: true,
            message: '获取热门商品成功',
            data: products
        });

    } catch (error) {
        console.error('获取热门商品错误:', error);
        res.status(500).json({
            success: false,
            message: '获取热门商品失败'
        });
    }
});

/**
 * 获取商品分类统计
 * GET /api/product/categories
 */
router.get('/categories', async (req, res) => {
    try {
        const productModel = new Product();
        const stats = await productModel.getStatistics();

        const categories = [
            { name: '数码电子', value: 'electronics', count: stats.categories.electronics || 0 },
            { name: '服装鞋帽', value: 'clothing', count: stats.categories.clothing || 0 },
            { name: '图书教材', value: 'books', count: stats.categories.books || 0 },
            { name: '生活用品', value: 'daily', count: stats.categories.daily || 0 },
            { name: '运动器材', value: 'sports', count: stats.categories.sports || 0 },
            { name: '其他', value: 'others', count: stats.categories.others || 0 }
        ];

        res.json({
            success: true,
            message: '获取分类统计成功',
            data: {
                categories,
                total: stats.total,
                available: stats.available
            }
        });

    } catch (error) {
        console.error('获取分类统计错误:', error);
        res.status(500).json({
            success: false,
            message: '获取分类统计失败'
        });
    }
});

module.exports = router; 