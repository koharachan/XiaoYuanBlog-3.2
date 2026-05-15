import type { SponsorConfig } from "../types/config";

export const sponsorConfig: SponsorConfig = {
	title: "给小原打钱",
	description: "给小原打钱，支持服务器维护和内容创作！",
	usage: "打钱将用于服务器维护、内容创作和功能开发，帮助我持续提供优质内容。",

	showSponsorsList: true,
	showButtonInPost: true,

	methods: [
		{
			name: "微信支付",
			icon: "fa6-brands:weixin",
			qrCode: "/assets/images/sponsor/wxpay.png",
			link: "wxp://f2f0rI4W1cnbURMpgnpfyvmkXgnNghISiJvn",
			description: "微信扫码或点击唤起支付",
			enabled: true,
		},
		{
			name: "支付宝",
			icon: "fa6-brands:alipay",
			qrCode: "/assets/images/sponsor/alipay.png",
			link: "https://qr.alipay.com/tsx16384hrlevhpaqkjvuf62",
			description: "支付宝扫码或点击唤起支付",
			enabled: true,
		},
		{
			name: "支付宝经营码",
			icon: "fa6-brands:alipay",
			qrCode: "/assets/images/sponsor/alipay-shop.png",
			link: "",
			description: "支付宝经营码",
			enabled: true,
		},
		{
			name: "QQ支付",
			icon: "simple-icons:qq",
			qrCode: "/assets/images/sponsor/qqpay.png",
			link: "",
			description: "QQ支付个人码",
			enabled: true,
		},
		{
			name: "数字人民币",
			icon: "e-cny",
			qrCode: "/assets/images/sponsor/e-CNY.png",
			link: "",
			description: "e-CNY个人码",
			enabled: true,
		},
		{
			name: "PayPal",
			icon: "fa6-brands:paypal",
			qrCode: "/assets/images/sponsor/paypal.png",
			link: "https://paypal.me/koharachan",
			description: "全球通用，点击跳转PayPal",
			enabled: true,
		},
		{
			name: "ERC20-USDT/USDC",
			icon: "erc20",
			wallet: "0x66ccFF56ac8D2688801cA7339f2E5049dF466036",
			link: "ethereum:0x66ccFF56ac8D2688801cA7339f2E5049dF466036",
			description: "ERC20网络，支持USDT/USDC/ETH",
			enabled: true,
		},
		{
			name: "TRON-USDT",
			icon: "tron",
			qrCode: "/assets/images/sponsor/tron.png",
			link: "tron:TYsGR9sdko7szvt3fJtbBmB3xK9Ejn4VkB",
			description: "TRC20网络，0 Gas费",
			enabled: true,
		},
		{
			name: "Gate.io",
			icon: "gate",
			qrCode: "/assets/images/sponsor/gate.png",
			link: "",
			description: "站内转账0 Gas费",
			enabled: true,
		},
		{
			name: "OKX",
			icon: "okx",
			qrCode: "/assets/images/sponsor/okx.png",
			link: "",
			description: "站内转账0 Gas费",
			enabled: true,
		},
	],

	sponsors: [
		{
			name: "夏叶",
			amount: "¥50",
			date: "2025-10-01",
			message: "感谢分享！",
		},
		{
			name: "匿名用户",
			amount: "¥20",
			date: "2025-10-01",
		},
	],
};
