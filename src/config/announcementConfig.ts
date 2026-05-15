import type { AnnouncementConfig } from "../types/config";

/**
 * 公告栏配置
 */
export const announcementConfig: AnnouncementConfig = {
	// 公告栏标题
	title: "站点公告",
	// 公告栏内容
	content: "欢迎来到小原的blog~",
	// 公告栏图标
	icon: "📢",
	// 公告类型
	type: "info",
	// 是否可关闭
	closable: true,
	// 链接配置
	link: {
		enable: false,
		text: "查看详情",
		url: "/",
		external: false
	}
};
