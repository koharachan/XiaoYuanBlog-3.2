import type { FooterConfig } from "../types/config";

export const footerConfig: FooterConfig = {
	// 是否启用Footer HTML注入功能
	enable: true,
	// 友情链接
	links: [
		{
			name: "惠州新闻网",
			url: "http://news.huizhou12345.com/",
			description: "惠州本地新闻资讯平台"
		}
	]
};

// 直接编辑 config/FooterConfig.html 文件来添加备案号等自定义内容
