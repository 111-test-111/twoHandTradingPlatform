const { ProductAPI } = require('../../../utils/api');
const config = require('../../../utils/config');

Page({
    data: {
        // 表单数据
        formData: {
            title: '',
            price: '',
            category: '',
            condition: '',
            description: '',
            images: [],
            campus: '',
            tradeMethods: []
        },
        // 选项数据
        categoryOptions: [
            { value: 'electronics', name: '电子产品' },
            { value: 'books', name: '书籍教材' },
            { value: 'clothing', name: '服装鞋帽' },
            { value: 'daily', name: '日用百货' },
            { value: 'sports', name: '运动健身' },
            { value: 'beauty', name: '美妆护肤' },
            { value: 'furniture', name: '家具家电' },
            { value: 'tickets', name: '票券卡劵' },
            { value: 'others', name: '其他物品' }
        ],
        conditionOptions: ['全新', '几乎全新', '轻微使用痕迹', '明显使用痕迹', '重度使用'],
        campusOptions: ['邯郸校区', '江湾校区', '枫林校区', '张江校区'],
        tradeMethodOptions: ['面交', '邮寄', '快递'],
        // 选中索引
        selectedCategoryIndex: -1,
        selectedConditionIndex: -1,
        selectedCampusIndex: -1,
        selectedTradeMethodIndex: -1,
        // 表单错误
        errors: {},
        // 状态标记
        submitting: false,
        isEdit: false,
        productId: '',
        imageFiles: [] // 存储本地文件路径，用于上传
    },

    onLoad(options) {
        if (options.id) {
            // 编辑模式
            this.setData({
                isEdit: true,
                productId: options.id
            });
            this.loadProductDetail(options.id);
        }
    },

    async loadProductDetail(id) {
        wx.showLoading({ title: '加载商品信息' });

        try {
            const res = await ProductAPI.getDetail(id);
            if (res.success) {
                const product = res.data;

                // 找到对应的选项索引
                const categoryIndex = this.data.categoryOptions.findIndex(item => item.value === product.category);
                const conditionIndex = this.data.conditionOptions.indexOf(product.condition);
                const campusIndex = this.data.campusOptions.indexOf(product.campus);

                // 解析交易方式（后端可能存储为字符串）
                let tradeMethods = product.tradeMethods;
                if (typeof tradeMethods === 'string') {
                    tradeMethods = tradeMethods.split(',');
                }

                // 找到交易方式索引（取第一个）
                const tradeMethodIndex = tradeMethods.length > 0 ?
                    this.data.tradeMethodOptions.indexOf(tradeMethods[0]) : -1;

                this.setData({
                    'formData.title': product.title,
                    'formData.price': product.price.toString(),
                    'formData.category': product.category,
                    'formData.condition': product.condition,
                    'formData.description': product.description,
                    'formData.images': product.images || [],
                    'formData.campus': product.campus,
                    'formData.tradeMethods': tradeMethods,
                    selectedCategoryIndex: categoryIndex !== -1 ? categoryIndex : -1,
                    selectedConditionIndex: conditionIndex !== -1 ? conditionIndex : -1,
                    selectedCampusIndex: campusIndex !== -1 ? campusIndex : -1,
                    selectedTradeMethodIndex: tradeMethodIndex
                });
            }
        } catch (error) {
            console.error('加载商品详情失败:', error);
            wx.showToast({
                title: '加载失败',
                icon: 'none'
            });
        } finally {
            wx.hideLoading();
        }
    },

    // 表单输入处理
    onInputTitle(e) {
        this.setData({
            'formData.title': e.detail.value,
            'errors.title': ''
        });
    },

    onInputPrice(e) {
        this.setData({
            'formData.price': e.detail.value,
            'errors.price': ''
        });
    },

    onInputDescription(e) {
        this.setData({
            'formData.description': e.detail.value,
            'errors.description': ''
        });
    },

    onCategoryChange(e) {
        const index = parseInt(e.detail.value);
        this.setData({
            selectedCategoryIndex: index,
            'formData.category': this.data.categoryOptions[index].value,
            'errors.category': ''
        });
    },

    onConditionChange(e) {
        const index = parseInt(e.detail.value);
        this.setData({
            selectedConditionIndex: index,
            'formData.condition': this.data.conditionOptions[index],
            'errors.condition': ''
        });
    },

    onCampusChange(e) {
        const index = parseInt(e.detail.value);
        this.setData({
            selectedCampusIndex: index,
            'formData.campus': this.data.campusOptions[index],
            'errors.campus': ''
        });
    },

    onTradeMethodChange(e) {
        const index = parseInt(e.detail.value);
        this.setData({
            selectedTradeMethodIndex: index,
            'formData.tradeMethods': [this.data.tradeMethodOptions[index]],
            'errors.tradeMethods': ''
        });
    },

    // 图片处理
    chooseImage() {
        wx.chooseMedia({
            count: 6 - this.data.formData.images.length,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFiles = res.tempFiles;
                const newImageFiles = [...this.data.imageFiles];
                const newImages = [...this.data.formData.images];

                tempFiles.forEach(file => {
                    newImageFiles.push(file.tempFilePath);
                    newImages.push(file.tempFilePath);
                });

                this.setData({
                    imageFiles: newImageFiles,
                    'formData.images': newImages
                });
            }
        });
    },

    previewImage(e) {
        const index = e.currentTarget.dataset.index;
        const images = this.data.formData.images;

        wx.previewImage({
            current: images[index],
            urls: images
        });
    },

    deleteImage(e) {
        const index = e.currentTarget.dataset.index;
        const images = [...this.data.formData.images];
        const imageFiles = [...this.data.imageFiles];

        // 判断是否是新上传的图片
        const isNewImage = images[index].startsWith('http') ? false : true;

        // 从数组中移除对应元素
        const deleted = images.splice(index, 1)[0];

        // 如果是新上传的图片，也从imageFiles中移除
        if (isNewImage) {
            const fileIndex = imageFiles.indexOf(deleted);
            if (fileIndex !== -1) {
                imageFiles.splice(fileIndex, 1);
            }
        }

        this.setData({
            'formData.images': images,
            imageFiles
        });
    },

    // 表单验证
    validateForm() {
        const { title, price, category, condition, description, images, campus, tradeMethods } = this.data.formData;
        const errors = {};

        // 标题验证
        if (!title.trim()) {
            errors.title = '请输入商品名称';
        } else if (title.length < 2) {
            errors.title = '商品名称至少2个字符';
        }

        // 价格验证
        if (!price) {
            errors.price = '请输入价格';
        } else if (isNaN(Number(price)) || Number(price) <= 0) {
            errors.price = '请输入有效的价格';
        }

        // 分类验证
        if (!category) {
            errors.category = '请选择商品分类';
        }

        // 成色验证
        if (!condition) {
            errors.condition = '请选择商品成色';
        }

        // 描述验证
        if (!description.trim()) {
            errors.description = '请输入商品描述';
        } else if (description.length < 10) {
            errors.description = '描述至少10个字符';
        }

        // 图片验证
        if (images.length === 0) {
            errors.images = '请至少上传一张图片';
            wx.showToast({
                title: '请至少上传一张图片',
                icon: 'none'
            });
        }

        // 校区验证
        if (!campus) {
            errors.campus = '请选择校区';
        }

        // 交易方式验证
        if (tradeMethods.length === 0) {
            errors.tradeMethods = '请至少选择一种交易方式';
        }

        this.setData({ errors });
        return Object.keys(errors).length === 0;
    },

    // 图片上传
    async uploadImages() {
        const imageFiles = this.data.imageFiles;
        const formData = this.data.formData;

        // 如果没有新图片，直接返回现有图片
        if (imageFiles.length === 0) {
            return formData.images;
        }

        const uploadTasks = imageFiles.map(filePath => {
            return new Promise((resolve, reject) => {
                // 使用配置文件中的API地址
                const apiBaseUrl = config.API_BASE_URL;

                wx.uploadFile({
                    url: `${apiBaseUrl}/product/upload-image`,
                    filePath: filePath,
                    name: 'image',
                    header: {
                        'Authorization': `Bearer ${wx.getStorageSync('token')}`
                    },
                    success: (res) => {
                        try {
                            const data = JSON.parse(res.data);
                            if (data.success) {
                                resolve(data.data.url);
                            } else {
                                reject(new Error(data.message || '上传失败'));
                            }
                        } catch (error) {
                            reject(new Error('服务器响应格式错误'));
                        }
                    },
                    fail: (error) => {
                        console.error('上传失败:', error);
                        reject(new Error('网络请求失败'));
                    }
                });
            });
        });

        try {
            const uploadedUrls = await Promise.all(uploadTasks);

            // 保留原有的远程图片，替换本地图片为新上传的URL
            const finalImages = [];
            let uploadedIndex = 0;

            formData.images.forEach(img => {
                if (img.startsWith('http')) {
                    finalImages.push(img); // 保留远程图片
                } else {
                    // 本地图片替换为上传后的URL
                    if (uploadedIndex < uploadedUrls.length) {
                        finalImages.push(uploadedUrls[uploadedIndex++]);
                    }
                }
            });

            return finalImages;
        } catch (error) {
            console.error('图片上传错误:', error);
            wx.showToast({
                title: '图片上传失败: ' + error.message,
                icon: 'none'
            });
            throw error;
        }
    },

    // 表单提交
    async submitForm() {
        if (this.data.submitting) return;

        // 表单验证
        if (!this.validateForm()) return;

        this.setData({ submitting: true });

        try {
            wx.showLoading({ title: '上传图片中...' });

            // 上传图片并获取URL
            const imageUrls = await this.uploadImages();

            wx.showLoading({ title: '发布商品中...' });

            // 准备提交数据
            const submitData = {
                title: this.data.formData.title,
                price: parseFloat(this.data.formData.price),
                category: this.data.formData.category,
                condition: this.data.formData.condition,
                description: this.data.formData.description,
                images: imageUrls,
                campus: this.data.formData.campus,
                tradeMethods: this.data.formData.tradeMethods.join(',')
            };

            let res;

            if (this.data.isEdit) {
                // 更新商品
                res = await ProductAPI.update(this.data.productId, submitData);
            } else {
                // 发布新商品
                res = await ProductAPI.publish(submitData);
            }

            if (res.success) {
                wx.showToast({
                    title: this.data.isEdit ? '修改成功' : '发布成功',
                    icon: 'success'
                });

                // 延迟导航，让用户看到成功提示
                setTimeout(() => {
                    if (this.data.isEdit) {
                        // 返回详情页
                        wx.navigateBack();
                    } else {
                        // 跳转到商品详情页
                        wx.redirectTo({
                            url: `/pages/product/detail/detail?id=${res.data.id}`
                        });
                    }
                }, 1500);
            }
        } catch (error) {
            console.error('提交失败:', error);
            wx.showToast({
                title: '提交失败，请重试',
                icon: 'none'
            });
        } finally {
            this.setData({ submitting: false });
            wx.hideLoading();
        }
    },

    // 查看发布规则
    viewPublishRules() {
        wx.showModal({
            title: '发布规则',
            content: '1. 禁止发布违禁物品\n2. 价格必须合理\n3. 图片必须真实清晰\n4. 描述必须准确\n5. 联系方式必须有效',
            showCancel: false
        });
    }
}); 