import type { FooterConfig } from "../types/config";

export const footerConfig: FooterConfig = {
	// 是否启用Footer HTML注入功能
	enable: true,
	// 友情链接
	links: [
		{
			name: "api.rainchan.com",
			url: "https://api.rainchan.com/",
			description: "雨酱Ai"
		},
		{
			name: "cn.jinao.wang",
			url: "https://cn.jinao.wang/",
			description: "jinao的小窝"
		},
		{
			name: "luoaowoo.cn",
			url: "https://luoaowoo.cn/",
			description: "洛嗷呜の小站"
		}
	]
};

// 直接编辑 config/FooterConfig.html 文件来添加备案号等自定义内容
