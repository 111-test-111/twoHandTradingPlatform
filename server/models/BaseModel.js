const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

class BaseModel {
    constructor(dataPath) {
        this.dataPath = dataPath;
        this.ensureDirectory();
        // 开发环境延迟写入队列
        this.delayedWrites = new Map();
    }

    ensureDirectory() {
        fs.ensureDirSync(this.dataPath);
    }

    // 生成唯一ID
    generateId() {
        return uuidv4();
    }

    // 获取文件路径
    getFilePath(id) {
        return path.join(this.dataPath, `${id}.json`);
    }

    // 创建记录
    async create(data) {
        const id = this.generateId();
        const record = {
            id,
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await fs.writeJson(this.getFilePath(id), record, { spaces: 2 });
        return record;
    }

    // 根据ID查找记录
    async findById(id) {
        try {
            const filePath = this.getFilePath(id);
            if (await fs.pathExists(filePath)) {
                return await fs.readJson(filePath);
            }
            return null;
        } catch (error) {
            console.error(`查找记录错误: ${error.message}`);
            return null;
        }
    }

    // 查找所有记录
    async findAll() {
        try {
            const files = await fs.readdir(this.dataPath);
            const records = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.dataPath, file);
                    const record = await fs.readJson(filePath);
                    records.push(record);
                }
            }

            return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (error) {
            console.error(`查找所有记录错误: ${error.message}`);
            return [];
        }
    }

    // 根据条件查找记录
    async findWhere(condition) {
        const allRecords = await this.findAll();
        return allRecords.filter(record => {
            return Object.keys(condition).every(key => {
                if (typeof condition[key] === 'object' && condition[key].$regex) {
                    const regex = new RegExp(condition[key].$regex, condition[key].$options || '');
                    return regex.test(record[key]);
                }
                return record[key] === condition[key];
            });
        });
    }

    // 更新记录
    async update(id, updateData) {
        console.log('=== BaseModel.update 开始 ===');
        console.log('记录ID:', id);
        console.log('更新数据:', updateData);

        try {
            const record = await this.findById(id);
            if (!record) {
                console.log('错误: 记录不存在');
                throw new Error('记录不存在');
            }

            console.log('原记录数据:', {
                id: record.id,
                avatar: record.avatar,
                updatedAt: record.updatedAt
            });

            const updatedRecord = {
                ...record,
                ...updateData,
                updatedAt: new Date().toISOString()
            };

            console.log('合并后的记录:', {
                id: updatedRecord.id,
                avatar: updatedRecord.avatar,
                updatedAt: updatedRecord.updatedAt
            });

            const filePath = this.getFilePath(id);
            console.log('写入文件路径:', filePath);

            // 在开发环境中，如果是统计数据更新（如 viewCount），延迟写入
            if (config.isDevelopment && config.development.delayStatWrites &&
                (updateData.viewCount !== undefined || updateData.favoriteCount !== undefined)) {

                console.log('开发环境 - 延迟写入统计数据');

                // 清除之前的延迟写入任务
                if (this.delayedWrites.has(id)) {
                    clearTimeout(this.delayedWrites.get(id));
                }

                // 设置新的延迟写入任务
                const timeoutId = setTimeout(async () => {
                    try {
                        await fs.writeJson(filePath, updatedRecord, { spaces: 2 });
                        console.log('延迟写入完成:', id);
                        this.delayedWrites.delete(id);
                    } catch (error) {
                        console.error('延迟写入失败:', error);
                        this.delayedWrites.delete(id);
                    }
                }, config.development.statWriteDelay);

                this.delayedWrites.set(id, timeoutId);
                console.log(`统计数据将在 ${config.development.statWriteDelay}ms 后写入`);

            } else {
                // 非统计数据或生产环境，立即写入
                await fs.writeJson(filePath, updatedRecord, { spaces: 2 });
                console.log('文件写入成功');

                // 验证写入结果
                const verifyRecord = await fs.readJson(filePath);
                console.log('验证写入结果:', {
                    id: verifyRecord.id,
                    avatar: verifyRecord.avatar,
                    updatedAt: verifyRecord.updatedAt
                });
            }

            console.log('=== BaseModel.update 成功 ===');
            return updatedRecord;
        } catch (error) {
            console.error('=== BaseModel.update 失败 ===');
            console.error('更新记录错误:', error.message);
            console.error('错误堆栈:', error.stack);
            throw error;
        }
    }

    // 删除记录
    async delete(id) {
        try {
            const filePath = this.getFilePath(id);
            if (await fs.pathExists(filePath)) {
                await fs.remove(filePath);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`删除记录错误: ${error.message}`);
            throw error;
        }
    }

    // 分页查询
    async findPaginated(page = 1, limit = 10, condition = {}) {
        const allRecords = Object.keys(condition).length > 0
            ? await this.findWhere(condition)
            : await this.findAll();

        const total = allRecords.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const records = allRecords.slice(startIndex, endIndex);

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
}

module.exports = BaseModel; 