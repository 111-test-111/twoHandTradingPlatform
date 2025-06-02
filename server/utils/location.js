const axios = require('axios');

class LocationService {
    constructor() {
        // 腾讯地图API密钥 - 需要在腾讯位置服务申请
        this.tencentApiKey = process.env.TENCENT_MAP_KEY || 'YOUR_TENCENT_MAP_API_KEY';
    }

    /**
     * 根据IP地址获取地理位置信息
     * @param {string} ip - IP地址
     * @returns {Object} 位置信息
     */
    async getLocationByIP(ip) {
        try {
            console.log('===== IP定位请求开始 =====');
            console.log('需要解析的IP地址:', ip);
            console.log('IP类型:', this.getIPType(ip));

            // 尝试使用腾讯地图API获取位置
            const tencentResult = await this.getTencentLocationByIP(ip);
            if (tencentResult) {
                return tencentResult;
            }

            // 如果腾讯地图API调用失败，返回默认位置
            console.log('腾讯地图API调用失败，使用默认位置');
            return this.getDefaultLocation();

        } catch (error) {
            console.error('获取IP位置失败:', error);
            return this.getDefaultLocation();
        }
    }

    // 判断IP类型的辅助函数
    getIPType(ip) {
        if (!ip) return 'undefined/null';
        if (ip === '127.0.0.1') return 'localhost';
        if (ip.startsWith('192.168.')) return '内网IP(192.168.x.x)';
        if (ip.startsWith('10.')) return '内网IP(10.x.x.x)';
        if (ip.startsWith('172.')) {
            const secondOctet = parseInt(ip.split('.')[1]);
            if (secondOctet >= 16 && secondOctet <= 31) {
                return '内网IP(172.16-31.x.x)';
            }
        }
        return '公网IP或其他';
    }

    /**
     * 使用腾讯地图API根据IP获取位置
     */
    async getTencentLocationByIP(ip) {
        try {
            console.log('=== 腾讯地图API调用开始 ===');
            console.log('目标IP:', ip);
            console.log('API Key:', this.tencentApiKey ? `${this.tencentApiKey.substring(0, 8)}...` : '未设置');

            const apiUrl = 'https://apis.map.qq.com/ws/location/v1/ip';
            const params = {
                ip: ip,
                key: this.tencentApiKey
            };

            // 构建完整的请求URL（用于调试）
            const fullUrl = `${apiUrl}?ip=${encodeURIComponent(ip)}&key=${encodeURIComponent(this.tencentApiKey)}`;
            console.log('完整请求URL:', fullUrl);
            console.log('请求参数:', { ...params, key: `${params.key.substring(0, 8)}...` });

            const response = await axios.get(apiUrl, {
                params: params,
                timeout: 5000,
                headers: {
                    'User-Agent': 'TwoHandTradingPlatform/1.0'
                }
            });

            console.log('腾讯地图API响应状态:', response.status);
            console.log('腾讯地图API响应数据:', JSON.stringify(response.data, null, 2));

            if (response.data.status === 0) {
                const result = response.data.result;
                const locationData = {
                    country: result.ad_info.nation || '中国',
                    province: result.ad_info.province || '',
                    city: result.ad_info.city || '',
                    district: result.ad_info.district || '',
                    latitude: result.location.lat,
                    longitude: result.location.lng,
                    source: 'tencent'
                };

                console.log('解析后的位置数据:', locationData);
                console.log('=== 腾讯地图API调用成功 ===');
                return locationData;
            } else {
                console.error('腾讯地图API返回错误:');
                console.error('状态码:', response.data.status);
                console.error('错误信息:', response.data.message);
                console.error('请求ID:', response.data.request_id);

                // 检查常见错误
                if (response.data.status === 311) {
                    console.error('❌ API Key格式错误！请检查环境变量 TENCENT_MAP_KEY 是否正确设置');
                } else if (response.data.status === 121) {
                    console.error('⚠️ 腾讯地图API每日调用量已达上限！');
                    console.error('💡 建议：申请更高配额或等待次日重置');
                } else if (response.data.status === 312) {
                    console.error('❌ API Key没有权限！请在腾讯地图控制台检查API权限设置');
                } else {
                    console.error('❌ 其他API错误，状态码:', response.data.status);
                }
            }

            return null;
        } catch (error) {
            console.error('=== 腾讯地图API调用失败 ===');
            console.error('错误类型:', error.name);
            console.error('错误信息:', error.message);
            if (error.response) {
                console.error('HTTP状态码:', error.response.status);
                console.error('响应数据:', error.response.data);
            }
            if (error.code === 'ECONNABORTED') {
                console.error('❌ 请求超时！请检查网络连接');
            }
            return null;
        }
    }

    /**
     * 获取默认位置信息
     */
    getDefaultLocation() {
        return {
            country: '中国',
            province: '',
            city: '',
            district: '',
            latitude: null,
            longitude: null,
            source: 'default'
        };
    }

    /**
     * 从请求中获取真实IP地址
     */
    getRealIP(req) {
        console.log('=== 开始获取真实IP地址 ===');
        console.log('HTTP请求头信息:', {
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'remote-address': req.connection.remoteAddress,
            'cf-connecting-ip': req.headers['cf-connecting-ip'], // Cloudflare
            'true-client-ip': req.headers['true-client-ip'], // Akamai
            'x-client-ip': req.headers['x-client-ip'],
            'forwarded': req.headers['forwarded']
        });

        // 获取真实IP，考虑代理和负载均衡
        const ipSources = [
            req.headers['x-forwarded-for'],
            req.headers['x-real-ip'],
            req.headers['cf-connecting-ip'],
            req.headers['true-client-ip'],
            req.headers['x-client-ip'],
            req.connection.remoteAddress
        ];

        // 尝试所有可能的IP来源
        for (const source of ipSources) {
            if (source) {
                // x-forwarded-for 可能包含多个IP，取第一个（最靠近用户的）
                const ip = source.includes(',') ? source.split(',')[0].trim() : source;

                // 处理IPv6映射的IPv4地址
                const cleanedIP = ip.indexOf('::ffff:') === 0 ? ip.substring(7) : ip;

                console.log('找到IP地址:', cleanedIP, '(来源:', source === req.headers['x-forwarded-for'] ? 'x-forwarded-for' :
                    source === req.headers['x-real-ip'] ? 'x-real-ip' :
                        source === req.headers['cf-connecting-ip'] ? 'cf-connecting-ip' :
                            source === req.headers['true-client-ip'] ? 'true-client-ip' :
                                source === req.headers['x-client-ip'] ? 'x-client-ip' :
                                    'remote-address', ')');

                return cleanedIP;
            }
        }

        console.log('未能找到IP地址，返回默认值: 127.0.0.1');
        return '127.0.0.1';
    }
}

module.exports = new LocationService(); 