// 测试IP定位功能的独立脚本
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const locationService = require('./utils/location');

async function testIPLocation() {
    console.log('=== IP定位功能测试 ===');

    // 检查环境变量
    console.log('环境变量检查:');
    console.log('TENCENT_MAP_KEY:', process.env.TENCENT_MAP_KEY ? `已配置 (${process.env.TENCENT_MAP_KEY.substring(0, 8)}...)` : '❌ 未配置');

    // 测试IP列表
    const testIPs = [
        '111.206.145.41', // 您提供的测试IP
        '8.8.8.8',        // Google DNS
        '114.114.114.114' // 国内DNS
    ];

    for (const ip of testIPs) {
        console.log(`\n--- 测试IP: ${ip} ---`);
        try {
            const result = await locationService.getLocationByIP(ip);
            console.log('定位结果:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('定位失败:', error.message);
        }
    }

    console.log('\n=== 测试完成 ===');
}

// 运行测试
testIPLocation().catch(console.error); 