import type { FooterConfig } from "../types/config";

export const footerConfig: FooterConfig = {
	// 是否启用Footer HTML注入功能
	enable: true,
	// 友情链接
	links: [
		{
			name: "雨酱Ai",
			url: "https://api.rainchan.com/",
			description: "api.rainchan.com",
		},
		{
			name: "jinao的小窝",
			url: "https://cn.jinao.wang/",
			description: "cn.jinao.wang",
		},
		{
			name: "洛嗷呜の小站",
			url: "https://luoaowoo.cn/",
			description: "luoaowoo.cn",
		},
		{
			name: "魔域",
			url: "https://weibo.com/ttarticle/p/show?id=2309405276788133068860",
			description: "weibo.com",
		},
		{
			name: "农贸市场设计",
			url: "http://www.baiying800.cn",
			description: "baiying800.cn",
		},
		{
			name: "和女生聊天话题",
			url: "https://www.lee8.com/",
			description: "www.lee8.com/",
		},
	],
};

// 直接编辑 config/FooterConfig.html 文件来添加备案号等自定义内容
