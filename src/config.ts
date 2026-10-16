/**
 * 站点唯一配置文件。改这里就够了，不需要再碰其它源码。
 */

export const site = {
	title: "小原blog",
	tagline: "万物可爱QwQ",
	url: "https://blog.meowhead.cn",
	description:
		"小原酱的个人博客：服务器运维、模型训练与部署、网站折腾记录，以及一些生活随笔。",
	keywords: ["小原酱", "小原blog", "ogata kohara", "技术博客", "AI", "运维", "折腾"],
	lang: "zh-CN",
	/** 站点开始日期，用于页脚的运行天数 */
	startDate: "2023-01-01",
	/** 每页文章数 */
	postsPerPage: 10,
	/** 默认主题：neon（科技感暗色）或 cloud（云·浅色） */
	defaultTheme: "neon" as "neon" | "cloud",
	/** 文章超过多少天未更新时显示“可能过时”提示 */
	outdatedDays: 180,
};

export const author = {
	name: "小原酱",
	avatar: "https://pan.qzyun.net/f/zVviw/%E5%A4%B4%E5%83%8F.jpg",
	bio: "世界第二可爱的小原酱~",
	links: [
		{ name: "GitHub", icon: "github", url: "https://github.com/koharachan" },
		{ name: "Bilibili", icon: "bilibili", url: "https://space.bilibili.com/1379162124" },
		{ name: "QQ", icon: "qq", url: "https://qm.qq.com/q/bwvrjHDrGM" },
		{ name: "Email", icon: "mail", url: "mailto:xy@6832.me" },
		{ name: "RSS", icon: "rss", url: "/rss.xml" },
	],
};

export const nav = [
	{ name: "首页", url: "/" },
	{ name: "归档", url: "/archive/" },
	{ name: "友链", url: "/friends/" },
	{ name: "留言板", url: "/guestbook/" },
	{ name: "关于", url: "/about/" },
	{ name: "赞助", url: "/pay/" },
];

/** 页脚友情链接（互换链接） */
export const footerLinks = [
	{ name: "雨酱Ai", url: "https://api.rainchan.com/" },
	{ name: "jinao的小窝", url: "https://cn.jinao.wang/" },
	{ name: "洛嗷呜の小站", url: "https://luoaowoo.cn/" },
	{ name: "农贸市场设计", url: "http://www.baiying800.cn" },
	{ name: "和女生聊天话题", url: "https://www.lee8.com/" },
	{ name: "成都保洁服务", url: "https://www.7jz.com.cn/" },
];

/** 友链页展示的朋友们 */
export const friends = [
	{ name: "雨酱Ai", url: "https://api.rainchan.com/", desc: "api.rainchan.com" },
	{ name: "jinao的小窝", url: "https://cn.jinao.wang/", desc: "cn.jinao.wang" },
	{ name: "洛嗷呜の小站", url: "https://luoaowoo.cn/", desc: "luoaowoo.cn" },
];

/** 评论：giscus（基于 GitHub Discussions） */
export const giscus = {
	repo: "koharachan/blogcomments",
	repoId: "R_kgDORHsWbw",
	category: "Announcements",
	categoryId: "DIC_kwDORHsWb84C10ni",
	mapping: "pathname",
	lang: "zh-CN",
	/** 留言板/IE 模式下的直达链接 */
	discussionsUrl: "https://github.com/koharachan/blogcomments/discussions",
};

/** 第三方统计/广告。留空即关闭。全部在页面加载完成后再注入，不影响首屏。 */
export const analytics = {
	googleAnalyticsId: "G-P7GBNJKJKL",
	microsoftClarityId: "tx9equrgr6",
	adsenseClient: "ca-pub-6041318726736667",
};

export const license = {
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const sponsor = {
	title: "给小原打钱",
	description: "打钱将用于服务器维护、内容创作和功能开发。",
	methods: [
		{ name: "微信支付", qr: "/assets/images/QrCode/wxpay.png", note: "微信扫码" },
		{
			name: "支付宝",
			qr: "/assets/images/QrCode/alipay.png",
			link: "https://qr.alipay.com/tsx12618ase1dahmcdnobda",
			note: "支付宝扫码或点击唤起",
		},
		{
			name: "支付宝经营码",
			qr: "/assets/images/QrCode/alipay-shop.png",
			link: "https://qr.alipay.com/tsx15698aunndjx7lwh7ef0",
			note: "经营码",
		},
		{ name: "QQ支付", qr: "/assets/images/QrCode/qqpay.png", note: "QQ 扫码" },
		{ name: "数字人民币", qr: "/assets/images/QrCode/e-CNY.png", note: "e-CNY 个人码" },
		{
			name: "PayPal",
			qr: "/assets/images/QrCode/paypal.png",
			link: "https://paypal.me/koharachan",
			note: "全球通用",
		},
		{
			name: "ERC20",
			wallet: "0x66ccFF56ac8D2688801cA7339f2E5049dF466036",
			note: "ETH / POL / BNB 等 EVM 链，USDT/USDC 皆可",
		},
		{
			name: "TRON (TRC20)",
			qr: "/assets/images/QrCode/tron.png",
			wallet: "TYsGR9sdko7szvt3fJtbBmB3xK9Ejn4VkB",
			note: "USDT 或任意 TRC20 Token",
		},
		{ name: "Gate.io", qr: "/assets/images/QrCode/gate.png", note: "站内转账 0 手续费" },
		{ name: "OKX", qr: "/assets/images/QrCode/okx.png", note: "站内转账 0 手续费" },
	],
	sponsors: [
		{ name: "夏叶", amount: "¥50", date: "2025-10-01", message: "感谢分享！" },
		{ name: "匿名用户", amount: "¥20", date: "2025-10-01" },
	],
};
